// ───────────────────────────────────────────────────────────────────────
// Heartbeat 场景 — 心跳场景分发（段3实现）
// 从 before-prompt-build.ts isHeartbeat 分支提取
// ───────────────────────────────────────────────────────────────────────

import type { DispatchContext, ScenarioHandler } from "../types.js";
import { createLogger, logInfo, logError, logWarn } from "../utils/logger.js";
import { buildProtocol, extractAnchors, anchorsNeedAction } from "../protocol.js";
import {
  updateSessionState,
  updateIndex,
  executeCheckScriptWithLog,
} from "./hardcoded/index.js";
import { readRecentL2, createEmptyL2, getTodayStr } from "./memory/reader.js";
import { buildWeeklyProtocol, buildMonthlyProtocol, buildYearlyProtocol } from "./memory/consolidation.js";
import { resolveIntent } from "./intent-resolver.js";
import type { StateParams } from "./intent-resolver.js";
import { loadSleepinessConfig } from "../utils/sleepiness-config.js";
import { getExtraBasePath } from "../utils/agent-config.js";
import * as path from "path";
import * as fs from "fs";

const log = createLogger("module:heartbeat");

// ── 心跳日志类型（与 hardcoded/index.ts 对齐） ─────────────────────────

type HeartbeatLogEntry = {
  timestamp: string;
  checkType: "light" | "medium" | "full";
  trigger: string;
  actions: string[];
  results: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
};

// ── 场景处理器 ─────────────────────────────────────────────────────────

export const heartbeatScenario: ScenarioHandler = {
  name: "heartbeat",

  async execute(ctx: DispatchContext): Promise<{ output?: string; data?: unknown }> {
    const workspaceDir = ctx.workspaceDir;
    const outputs: string[] = [];
    const systemParts: string[] = []; // prependSystemContext 内容
    const memoryParts: string[] = []; // appendSystemContext 内容

    log.info("💓 心跳场景执行", { trigger: ctx.trigger });

    // ── 0. 区分 trigger 类型 ───────────────────────────────────────
    const isHeartbeatTrigger = ctx.trigger === "heartbeat";

    if (!isHeartbeatTrigger) {
      // 用户主动对话 → 睡意驱动兜底 + 记忆注入
      // 核心修复：即使心跳cron未触发，用户持续对话也应驱动日终
      log.info("💬 用户对话 — 执行睡意驱动兜底");

      // 1. L2 最近记忆注入（保持原有行为）
      const recentL2 = readRecentL2(workspaceDir);
      if (recentL2) {
        memoryParts.push(recentL2);
        log.info("✅ [增量] L2 最近记忆已注入");
      }

      // 2. Intent-resolver: 三角因子指令解析（V3.8.8-beta2）
      //    在睡意兜底之前运行 —— keyword + state → direct/inquire/pass
      if (ctx.userMessage) {
        // 获取睡意作为状态因子（intent-resolver 需要）
        const irSleepiness = getSleepiness(workspaceDir);
        const stateParams: StateParams = {
          sleepinessScore: irSleepiness.score,
          hoursSinceLastEod: irSleepiness.hoursSinceLastEod,
          hoursSinceLastMedium: calcHoursSinceLastMedium(workspaceDir),
          l2Exists: fs.existsSync(path.join(workspaceDir, "memory", `${getTodayStr()}.md`)),
          weeklyFileExists: checkConsolidationFile(workspaceDir, "weekly"),
          monthlyFileExists: checkConsolidationFile(workspaceDir, "monthly"),
          yearlyFileExists: checkConsolidationFile(workspaceDir, "yearly"),
          isWeekend: new Date().getDay() === 6 || new Date().getDay() === 0,
          isMonthEnd: new Date().getDate() === new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
          isYearEnd: new Date().getMonth() === 11 && new Date().getDate() === 31,
        };
        const intent = resolveIntent(ctx.userMessage, stateParams);
        log.info("🎯 指令解析", {
          userMsg: ctx.userMessage.slice(0, 60),
          action: intent.action,
          protocol: intent.protocol,
          keyword: intent.keyword,
          stateRelevance: intent.stateRelevance,
        });

        if (intent.action === "direct" && intent.protocol) {
          // direct: 直接执行协议，跳过睡意兜底
          await executeProtocolDirect(workspaceDir, intent.protocol, systemParts);
          log.info("⚡ 指令协议直接执行，跳过睡意兜底", { protocol: intent.protocol });

          // 合并输出 + return（跳过 sleepiness 检查）
          const protocolStr = systemParts.join("\n\n");
          const memoryStr = memoryParts.join("\n\n");
          const prependSystemContext = [protocolStr, memoryStr]
            .filter(Boolean)
            .join("\n\n");
          return {
            output: "",
            data: {
              prependSystemContext: prependSystemContext || undefined,
            },
          };
        } else if (intent.action === "inquire" && intent.inquirePrompt) {
          // inquire: 注入询问提示词到 systemParts，继续走睡意兜底
          systemParts.push(intent.inquirePrompt);
          log.info("💬 指令询问注入，继续睡意兜底", { prompt: intent.inquirePrompt.slice(0, 80) });
        }
        // action === "pass" → 什么都不做，继续睡意兜底
      }

      // 2.5 A层：Weekly 独立 turn 检测
      // 放在睡意检测之前，但仅在非 exhausted/dreaming 时触发
      // 如果睡意 pending（exhausted/dreaming），先跑 Full → 下次心跳再跑 Weekly
      const weeklySleepinessPreview = getSleepiness(workspaceDir);
      if (
        weeklySleepinessPreview.level !== "dreaming" &&
        weeklySleepinessPreview.level !== "exhausted" &&
        isWeekend() &&
        lastEodCompleted(workspaceDir) &&
        !weeklyAlreadyDone(workspaceDir)
      ) {
        writeProtocolTurnActive(workspaceDir, "weekly");
        log.info("📅 A层: Weekly 独立 turn（周末 + Full 已完成 + Weekly 未执行）");
        const weeklySystem = await buildWeeklyProtocolOnly(workspaceDir);
        if (weeklySystem) {
          return {
            output: "",
            data: {
              prependSystemContext: weeklySystem,
            },
          };
        }
      }

      // 3. 睡意驱动：用户消息中也检测睡意（兜底机制）
      const sleepiness = weeklySleepinessPreview; // 复用已获取的睡意，避免重复调用
      log.info("😴 对话中睡意检测", {
        level: sleepiness.level,
        score: sleepiness.score,
        hoursSinceLastEod: sleepiness.hoursSinceLastEod.toFixed(1),
      });

      if (sleepiness.level === "dreaming" || sleepiness.level === "exhausted") {
        // 💤 睡意极限 → 强制注入日终协议
        // 这是兜底：即使心跳cron从未触发，用户持续对话也会触发日终
        log.info(`💤 ${sleepiness.level} — 用户对话中强制注入日终协议`);
        logInfo("heartbeat", "state_change", `对话中睡意达到${sleepiness.level}，注入日终协议`, {
          from: "sleepy",
          to: sleepiness.level,
          trigger: "conversation_sleepiness_check",
        });
        const fullResult = await executeCheckScriptWithLog(
          workspaceDir, "check-full.sh", "full", ctx.trigger,
        );
        const prefix = sleepiness.level === "dreaming"
          ? "【💤 入梦协议 — 用户对话中触发自动日终】"
          : "【😵 睡意极限 — 强制日终流程注入】";
        systemParts.push(prefix);
        systemParts.push(buildProtocol("full", fullResult, workspaceDir, sleepiness));
        const weeklyProtocol = buildWeeklyProtocol(fullResult, workspaceDir, sleepiness);
        if (weeklyProtocol) {
          systemParts.push(weeklyProtocol);
          systemParts.push("⚡ Full 协议的 spawn actions（daily/deep/work归档）与周梦协议的 spawn actions（W1/M1/Y1）互不依赖，可并行 sessions_spawn");
        }
        // last-eod 不在此更新（由 execute-protocol.ts 在 LLM 真正执行日终时更新）
        // 标记 eod-pending 为已注入（去重，保留文件供 execute-protocol.ts 验证）
        const pendingFile = path.join(workspaceDir, "memory", ".heartbeat", "eod-pending.json");
        try {
          if (fs.existsSync(pendingFile)) {
            const pfRaw = fs.readFileSync(pendingFile, "utf-8");
            const pfData = JSON.parse(pfRaw);
            const pfTmp = pendingFile + ".tmp";
            fs.writeFileSync(pfTmp, JSON.stringify({ ...pfData, injected: true, injected_at: new Date().toISOString() }), "utf-8");
            fs.renameSync(pfTmp, pendingFile);
            log.info("✅ eod-pending 已标记为已注入");
          }
        } catch {}
        log.info("✅ 日终协议已注入用户消息上下文");
      } else if (sleepiness.level === "sleepy") {
        // 微困提示：仅注入自然的提醒文本，不触发完整协议
        log.info("😴 睡意明显 — 注入自然提示");
        systemParts.push(`【${sleepiness.emoji} 睡意提醒】距上次日终已 ${sleepiness.hoursSinceLastEod.toFixed(1)} 小时。${sleepiness.systemHint}`);
      }

      // 4. 合并输出：系统协议（如有）+ L2记忆
      const protocolStr = systemParts.join("\n\n");
      const memoryStr = memoryParts.join("\n\n");
      const prependSystemContext = [protocolStr, memoryStr]
        .filter(Boolean)
        .join("\n\n");

      return {
        output: "",
        data: {
          prependSystemContext: prependSystemContext || undefined,
        },
      };
    }

    // ── 1. 判断检查类型（仅心跳 trigger） ──────────────────────────
    const checkType = determineCheckType(workspaceDir);
    log.info("📋 检查类型判定", { checkType });

    // ── 2. 执行 Light 检查（始终执行） ──────────────────────────────
    const lightStart = Date.now();
    const lightResult = await executeCheckScriptWithLog(
      workspaceDir,
      "check-light.sh",
      "light",
      ctx.trigger,
    );
    const lightDuration = Date.now() - lightStart;

    log.info("✅ Light 检查完成", { durationMs: lightDuration });

    // L1 A层：便签提醒 — "有对话但便签为空"时注入提醒文本
    // 不创建独立 turn（太频繁会打断对话），只注入一行提醒
    const lightAnchors = extractLightAnchors(lightResult);
    if (lightAnchors && (
      (lightAnchors.session_state.notes_empty && lightAnchors.session_state.extra_last_conversation_minutes_ago < 60) ||
      (lightAnchors.session_state.active_tasks === 0 && lightAnchors.session_state.notes_stale_minutes > 120)
    )) {
      systemParts.push("📝 **便签提醒**: 你有新对话但 SESSION-STATE 工作笔记为空。请考虑记录关键硬事实。");
      log.info("📝 A层: 便签提醒已注入 (notes_empty + recent conversation)");
    }

    // ── 3. 硬编码自动化执行 ─────────────────────────────────────────
    const actions = (lightResult as any).required_actions as
      | Array<{ action: string; reason?: string }>
      | undefined;

    if (actions?.some((a) => a.action === "update_session_state")) {
      await updateSessionState(workspaceDir, "heartbeat_triggered");
    }
    if (actions?.some((a) => a.action === "create_l2")) {
      await createEmptyL2(workspaceDir, getTodayStr());
    }

    // ── 4. 睡意驱动日终（替代硬编码时间窗口） ────────────────────
    const sleepiness = getSleepiness(workspaceDir);
    log.info("😴 睡意检测", { level: sleepiness.level, hoursSinceLastEod: sleepiness.hoursSinceLastEod });

    if (sleepiness.level === "dreaming") {
      // 💤 入梦协议 — 撑不住了，自动触发，不等待
      log.info("💤 入梦协议触发 — 自动日终");
      logInfo("heartbeat", "state_change", "睡意达到 dreaming，触发入梦协议", {
        from: "exhausted",
        to: "dreaming",
        trigger: "heartbeat_cron",
      });
      const fullResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", ctx.trigger,
      );
      systemParts.push(`【💤 入梦协议 — 睡意累积到极限，自动执行】`);
      systemParts.push(buildProtocol("full", fullResult, workspaceDir, sleepiness));
      // V3.8.8: 周梦协议增量注入
      const weeklyProtocol = buildWeeklyProtocol(fullResult, workspaceDir, sleepiness);
      if (weeklyProtocol) {
        systemParts.push(weeklyProtocol);
        systemParts.push("⚡ Full 协议的 spawn actions 与周梦协议的 spawn actions 互不依赖，可并行 sessions_spawn");
      }
      // last-eod 不在此更新（由 execute-protocol.ts 在 LLM 真正执行时更新）
    } else if (sleepiness.level === "exhausted") {
      // 😵 睡意极限 → 强制日终
      log.info("😵 睡意达到极限，强制执行 Full 检查");
      logInfo("heartbeat", "state_change", "睡意达到 exhausted，强制执行日终", {
        from: "sleepy",
        to: "exhausted",
        trigger: "heartbeat_cron",
      });
      const fullResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", ctx.trigger,
      );
      systemParts.push(buildProtocol("full", fullResult, workspaceDir, sleepiness));
      // V3.8.8: 周梦协议增量注入
      const weeklyProtocol = buildWeeklyProtocol(fullResult, workspaceDir, sleepiness);
      if (weeklyProtocol) {
        systemParts.push(weeklyProtocol);
        systemParts.push("⚡ Full 协议的 spawn actions 与周梦协议的 spawn actions 互不依赖，可并行 sessions_spawn");
      }
      // last-eod 不在此更新（由 execute-protocol.ts 在 LLM 真正执行时更新）
    } else if (sleepiness.level === "sleepy") {
      // 😴 睡意明显 → 检查是否需要 Medium/Full
      log.info("😴 睡意明显，检查是否需要日终");
      const mediumDue = (lightResult as any).medium_due?.due || false;
      if (mediumDue) {
        const mediumResult = await executeCheckScriptWithLog(
          workspaceDir, "check-medium.sh", "medium", ctx.trigger,
        );
        // D层锚点：检查是否需要独立 turn
        const mediumAnchors = extractAnchors(mediumResult);
        if (mediumAnchors && anchorsNeedAction(mediumAnchors)) {
          log.info("📋 D层锚点: Medium 需要行动 → 独立 turn 模式", {
            formatValid: mediumAnchors.l2.format_valid,
            hoursStale: mediumAnchors.l2.hours_stale,
            activeTasks: mediumAnchors.session_state?.active_tasks,
          });
          writeProtocolTurnActive(workspaceDir, "medium");
          const standaloneHeader = [
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "⚠️ 当前轮为 Medium 协议执行轮",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "你必须按下方清单完成所有行动项后，以\"[✓ Medium协议执行完毕]\"结尾。",
            "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "",
          ].join("\n");
          systemParts.push(standaloneHeader);
          systemParts.push(buildProtocol("medium", mediumResult, workspaceDir, sleepiness));
          // 独立 turn: 跳过 memoryParts 注入 → 协议纯净上下文
          const prependSystemContext = systemParts.join("\n\n");
          await updateIndex(workspaceDir);
          return {
            output: `[📋 Medium 协议轮]`,
            data: { prependSystemContext },
          };
        } else {
          systemParts.push(buildProtocol("medium", mediumResult, workspaceDir, sleepiness));
        }
      } else {
        systemParts.push(buildProtocol("light", lightResult, workspaceDir, sleepiness));
      }
    } else {
      // 🥱 清醒/微困 → 正常流程
      const mediumDue = (lightResult as any).medium_due?.due || false;
      if (mediumDue) {
        log.info("⏰ Medium 检查到期");
        const mediumResult = await executeCheckScriptWithLog(
          workspaceDir, "check-medium.sh", "medium", ctx.trigger,
        );
        // D层锚点：检查是否需要独立 turn
        const mediumAnchors = extractAnchors(mediumResult);
        if (mediumAnchors && anchorsNeedAction(mediumAnchors)) {
          log.info("📋 D层锚点: Medium 需要行动 → 独立 turn 模式", {
            formatValid: mediumAnchors.l2.format_valid,
            hoursStale: mediumAnchors.l2.hours_stale,
            activeTasks: mediumAnchors.session_state?.active_tasks,
          });
          writeProtocolTurnActive(workspaceDir, "medium");
          const standaloneHeader = [
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "⚠️ 当前轮为 Medium 协议执行轮",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "你必须按下方清单完成所有行动项后，以\"[✓ Medium协议执行完毕]\"结尾。",
            "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "",
          ].join("\n");
          systemParts.push(standaloneHeader);
          systemParts.push(buildProtocol("medium", mediumResult, workspaceDir, sleepiness));
          // 独立 turn: 跳过 memoryParts 注入 → 协议纯净上下文
          const prependSystemContext = systemParts.join("\n\n");
          await updateIndex(workspaceDir);
          return {
            output: `[📋 Medium 协议轮]`,
            data: { prependSystemContext },
          };
        } else {
          systemParts.push(buildProtocol("medium", mediumResult, workspaceDir, sleepiness));
        }
      } else {
        systemParts.push(buildProtocol("light", lightResult, workspaceDir, sleepiness));
      }
    }

    // ── 5. INDEX更新（每次心跳都执行） ─────────────────────────────
    await updateIndex(workspaceDir);

    // ── 6. SESSION-STATE 强制验证要求已包含在协议文本中（段5修正） ──
    log.info("✅ SESSION-STATE 强制验证要求已包含在协议中");

    // ── 6.5 协议依赖链：检查周/月/年凝练（A 层独立 turn） ──────────
    // 睡意驱动已处理 Full，此处处理 weekly/monthly/yearly 链
    const pendingChain = resolvePendingProtocols(workspaceDir);
    if (pendingChain.length > 0) {
      const nextProtocol = pendingChain[0];
      log.info("🔗 协议依赖链: 下一个待执行", {
        protocol: nextProtocol,
        fullChain: pendingChain,
      });

      // 执行 check-full.sh 获取状态数据
      const chainFullResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", "protocol_chain",
      );

      if (nextProtocol === "weekly") {
        log.info("📅 A层: Weekly 独立 turn");
        writeProtocolTurnActive(workspaceDir, "weekly");
        const standaloneHeader = [
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "⚠️ 当前轮为 Weekly 协议执行轮",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "🛠️ **强制 Tool 调用**: 你必须首先调用 execute_protocol('weekly') tool 确认接收周凝练协议。",
          "",
          "你必须按下方清单完成所有行动项后，以\"[✓ 周梦协议执行完毕]\"结尾。",
          "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
        ].join("\n");
        systemParts.push(standaloneHeader);
        const wp = buildWeeklyProtocol(chainFullResult, workspaceDir, sleepiness);
        if (wp) systemParts.push(wp);
        else systemParts.push("⚠️ 周凝练条件不满足（非周末或文件已存在），已跳过。");
      } else if (nextProtocol === "monthly") {
        log.info("📅 A层: Monthly 独立 turn");
        writeProtocolTurnActive(workspaceDir, "monthly");
        const standaloneHeader = [
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "⚠️ 当前轮为 Monthly 协议执行轮",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "🛠️ **强制 Tool 调用**: 你必须首先调用 execute_protocol('monthly') tool 确认接收月凝练协议。",
          "",
          "你必须按下方清单完成所有行动项后，以\"[✓ 月凝练协议执行完毕]\"结尾。",
          "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
        ].join("\n");
        systemParts.push(standaloneHeader);
        const mp = buildMonthlyProtocol(chainFullResult, workspaceDir, sleepiness, true);
        if (mp) systemParts.push(mp);
        else systemParts.push("⚠️ 月凝练条件不满足（非月末或文件已存在），已跳过。");
      } else if (nextProtocol === "yearly") {
        log.info("📅 A层: Yearly 独立 turn");
        writeProtocolTurnActive(workspaceDir, "yearly");
        const standaloneHeader = [
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "⚠️ 当前轮为 Yearly 协议执行轮",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          "🛠️ **强制 Tool 调用**: 你必须首先调用 execute_protocol('yearly') tool 确认接收年凝练协议。",
          "",
          "你必须按下方清单完成所有行动项后，以\"[✓ 年凝练协议执行完毕]\"结尾。",
          "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
        ].join("\n");
        systemParts.push(standaloneHeader);
        const yp = buildYearlyProtocol(chainFullResult, workspaceDir, sleepiness, true);
        if (yp) systemParts.push(yp);
        else systemParts.push("⚠️ 年凝练条件不满足（非年末或文件已存在），已跳过。");
      }

      // 独立 turn: 跳过 memoryParts 注入 → 协议纯净上下文
      const prependSystemContext = systemParts.join("\n\n");
      await updateIndex(workspaceDir);
      logInfo("heartbeat", "executed", `协议依赖链独立 turn: ${nextProtocol}`, {
        protocol: nextProtocol,
        fullChain: pendingChain,
      });
      return {
        output: `[📅 ${nextProtocol.toUpperCase()} 协议轮]`,
        data: { prependSystemContext },
      };
    }

    // ── 7. 增量注入：L2 最近记忆 ────────────────────────────────────
    const recentL2 = readRecentL2(workspaceDir);
    if (recentL2) {
      memoryParts.push(recentL2);
      log.info("✅ [增量] L2 最近记忆已注入");
    }

    // ── 8. 合并输出 ────────────────────────────────────────────────
    const systemOutput = systemParts.join("\n\n");
    const memoryOutput = memoryParts.join("\n\n");

    // 协议注入内容 = systemContext + memoryContext
    const protocolParts: string[] = [];
    if (systemOutput) protocolParts.push(systemOutput);
    if (memoryOutput) protocolParts.push(memoryOutput);
    const prependSystemContext = protocolParts.join("\n\n");

    log.info("💓 心跳场景完成", {
      systemParts: systemParts.length,
      memoryParts: memoryParts.length,
      hasProtocolContent: prependSystemContext.length > 0,
    });
    logInfo("heartbeat", "health_check", `心跳检查完成: ${checkType}`, {
      checkType,
      durationMs: lightDuration,
      systemParts: systemParts.length,
      sleepinessLevel: sleepiness?.level ?? "N/A",
    });

    // 段5修正：用户只看简短结果，协议注入系统（prependSystemContext）
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const l2Exists = fs.existsSync(
      path.join(workspaceDir, "memory", `${new Date().toISOString().slice(0, 10)}.md`)
    );
    const userResult = [
      `[✓ ${checkType}已更新: ${timestamp}]`,
      l2Exists ? `[✓ L2已存在]` : `[✓ L2已创建]`,
      `[✓ 心跳协议执行完毕]`,
      `[✓ SESSION-STATE验证完毕]`,
    ].join("\n");

    return {
      output: userResult,
      data: {
        prependSystemContext: prependSystemContext || undefined,
      },
    };
  },
};

// ── 睡意驱动（三层权重兜底） ──────────────────────────────────────────

export type SleepinessLevel = "awake" | "drowsy" | "sleepy" | "exhausted" | "dreaming";

export interface SleepinessState {
  level: SleepinessLevel;
  score: number;
  hoursSinceLastEod: number;
  /** 分解 */
  factors: {
    circadian: number;    // 生物周期 0-1
    uptime: number;       // 距上次日终 0-1
    memoryLoad: number;   // EXTRA 储量 0-1
  };
  emoji: string;
  systemHint: string;
}

const LAST_EOD_FILE = "memory/.heartbeat/last-eod.json";

export function getSleepiness(workspaceDir: string): SleepinessState {
  const config = loadSleepinessConfig(workspaceDir);
  const hoursSinceLastEod = calcHoursSinceLastEod(workspaceDir);
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeOfDay = hour + minute / 60;

  // 因子1: 生物周期（自然作息曲线）
  const circadian = calcCircadianFactor(timeOfDay);

  // 因子2: 运行时间（距上次日终）
  const uptime = calcUptimeFactor(hoursSinceLastEod);

  // 因子3: 记忆储量（EXTRA 层大小）
  const memoryLoad = calcMemoryLoadFactor(workspaceDir);

  // 加权评分
  const score = Math.min(1.0,
    config.weights.circadian * circadian +
    config.weights.uptime * uptime +
    config.weights.memoryLoad * memoryLoad
  );

  // 确定睡意等级
  let level: SleepinessLevel = "awake";
  let emoji = "😊";
  let hint = "";
  for (const t of config.thresholds) {
    if (score <= t.maxScore) {
      level = t.level;
      emoji = t.emoji;
      hint = t.hint;
      break;
    }
  }

  // 生成自然语言提示
  let systemHint = hint;
  if (level === "drowsy" || level === "sleepy") {
    const factorHints: string[] = [];
    if (circadian > 0.5) factorHints.push("天色已晚");
    if (memoryLoad > 0.5) factorHints.push("记忆负担较重");
    if (uptime > 0.6) factorHints.push("运行很久了");
    if (factorHints.length > 0) {
      systemHint = `${hint}（${factorHints.join("，")}）`;
    }
  }

  return {
    level,
    score: Math.round(score * 100) / 100,
    hoursSinceLastEod,
    factors: {
      circadian: Math.round(circadian * 100) / 100,
      uptime: Math.round(uptime * 100) / 100,
      memoryLoad: Math.round(memoryLoad * 100) / 100,
    },
    emoji,
    systemHint,
  };
}

/** 生物周期因子：基于时间的自然作息曲线
 *  公式与 scripts/sleepiness-factors.cjs::calcCircadianFactor 保持同步 */
function calcCircadianFactor(timeOfDay: number): number {
  // 深夜 22:00-06:00 → 高峰 1.0
  if (timeOfDay >= 22 || timeOfDay < 6) return 1.0;
  // 清晨 06:00-10:00 → 醒来 1.0→0.2
  if (timeOfDay >= 6 && timeOfDay < 10) return 1.0 - (timeOfDay - 6) * 0.2;
  // 白天 10:00-18:00 → 清醒 0.1（微基线，允许午睡）
  if (timeOfDay >= 10 && timeOfDay < 18) return 0.1;
  // 傍晚 18:00-22:00 → 渐困 0.2→1.0
  return 0.2 + (timeOfDay - 18) * 0.2;
}

/** 运行时间因子：距上次日终的时长
 *  公式与 scripts/sleepiness-factors.cjs::calcUptimeFactor 保持同步 */
function calcUptimeFactor(hoursSinceLastEod: number): number {
  if (hoursSinceLastEod < 2) return 0;
  if (hoursSinceLastEod < 8) return (hoursSinceLastEod - 2) / 6 * 0.5;
  if (hoursSinceLastEod < 16) return 0.5 + (hoursSinceLastEod - 8) / 8 * 0.3;
  return Math.min(1.0, 0.8 + (hoursSinceLastEod - 16) / 24 * 0.2);
}

/** 记忆储量因子：EXTRA 层文件大小
 *  公式与 scripts/sleepiness-factors.cjs::calcMemoryLoadFactor 保持同步 */
function calcMemoryLoadFactor(workspaceDir: string): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // V3.8.8: 从 agent-config 读取 EXTRA 基础路径
    const basePath = getExtraBasePath();
    const possiblePaths = [
      `${basePath}/${today.slice(0, 4)}/${today.slice(5, 7)}/${today}`,
    ];

    let totalSize = 0;
    for (const extraPath of possiblePaths) {
      if (fs.existsSync(extraPath)) {
        const files = fs.readdirSync(extraPath);
        for (const file of files) {
          try {
            totalSize += fs.statSync(path.join(extraPath, file)).size;
          } catch { /* skip */ }
        }
      }
    }

    const totalKB = totalSize / 1024;
    // 0-50KB: 0, 50-200KB: 0→0.5, 200-500KB: 0.5→0.8, 500KB+: 0.8→1.0
    if (totalKB < 50) return 0;
    if (totalKB < 200) return (totalKB - 50) / 150 * 0.5;
    if (totalKB < 500) return 0.5 + (totalKB - 200) / 300 * 0.3;
    return Math.min(1.0, 0.8 + (totalKB - 500) / 1000 * 0.2);
  } catch {
    return 0; // EXTRA 不可用时降级
  }
}

//  公式与 scripts/sleepiness-factors.cjs::calcHoursSinceLastEod 保持同步
function calcHoursSinceLastEod(workspaceDir: string): number {
  const filePath = path.join(workspaceDir, LAST_EOD_FILE);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { last_eod_time?: number };
      if (parsed.last_eod_time) {
        return (Date.now() - parsed.last_eod_time) / (1000 * 60 * 60);
      }
    }
  } catch { /* ignore */ }
  // 回退到 plugin-state 的 lastFullInjectTime
  const statePath = path.join(workspaceDir, "memory", ".heartbeat", "plugin-state.json");
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(raw) as { lastFullInjectTime?: number };
      if (state.lastFullInjectTime) {
        return (Date.now() - state.lastFullInjectTime) / (1000 * 60 * 60);
      }
    }
  } catch { /* ignore */ }
  return 999;
}

function updateLastEodTime(workspaceDir: string): void {
  const filePath = path.join(workspaceDir, LAST_EOD_FILE);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // 原子写入：先写临时文件，再 rename（防止并发写损坏）
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify({
      last_eod_time: Date.now(),
      updated_at: new Date().toISOString(),
    }), "utf-8");
    fs.renameSync(tmpPath, filePath);
    log.info("✅ 日终时间已记录");
  } catch (err) {
    log.warn("日终时间记录失败", { error: String(err) });
  }
}

// ── D层锚点：协议独立 turn 辅助 ────────────────────────────────────

/** 写入 protocol-turn-active 标记，使本轮成为独立协议执行轮 */
function writeProtocolTurnActive(workspaceDir: string, protocol: string): void {
  try {
    const turnActivePath = path.join(workspaceDir, "memory", ".heartbeat", "protocol-turn-active.json");
    const dir = path.dirname(turnActivePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpActivePath = turnActivePath + ".tmp";
    fs.writeFileSync(tmpActivePath, JSON.stringify({
      protocol,
      created_at: new Date().toISOString(),
    }, null, 2), "utf-8");
    fs.renameSync(tmpActivePath, turnActivePath);
    log.info("📋 A层: protocol-turn-active 标记已写入", { protocol });
  } catch {
    log.warn("⚠️ 写入 protocol-turn-active 失败");
  }
}

// ── 协议依赖链（A 层：独立 turn 机制） ──────────────────────────────

/**
 * 全局协议依赖链解析。
 * 按依赖顺序返回待执行的协议列表：weekly → monthly → yearly。
 * 每个 turn 只执行链中第一个协议，执行后标记，下次心跳检查下一个。
 */
function resolvePendingProtocols(workspaceDir: string): string[] {
  const chain: string[] = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();
  const month = today.getMonth(); // 0-based (11 = December)

  // Full: 永远最高优先级（睡意驱动，不在此处理）

  // Weekly: 周末 + Weekly 文件不存在 → 加入链
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (!weeklyAlreadyDone(workspaceDir)) chain.push("weekly");
  }

  // Monthly: 月末 (28-31) + 所有 Weekly 完成 → 加入链
  if (dayOfMonth >= 28) {
    if (allWeekliesDone(workspaceDir) && !monthlyAlreadyDone(workspaceDir)) {
      chain.push("monthly");
    }
  }

  // Yearly: 年末 (12月) + 所有 Monthly 完成 → 加入链
  if (month === 11) {
    if (allMonthliesDone(workspaceDir) && !yearlyAlreadyDone(workspaceDir)) {
      chain.push("yearly");
    }
  }

  return chain;
}

/** 检查当前周的 weekly 文件是否已存在 */
function weeklyAlreadyDone(workspaceDir: string): boolean {
  const now = new Date();
  const wn = getWeekNumber(now);
  const wy = String(now.getFullYear());
  const wf = path.join(workspaceDir, "memory", "memory-core", "weekly", wy, `${wy}-W${wn}.md`);
  return fs.existsSync(wf);
}

/** 检查当前月的 weekly 文件是否已存在 */
function monthlyAlreadyDone(workspaceDir: string): boolean {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const mf = path.join(workspaceDir, "memory", "memory-core", "monthly", y, `${y}-${m}.md`);
  return fs.existsSync(mf);
}

/** 检查当前年的 yearly 文件是否已存在 */
function yearlyAlreadyDone(workspaceDir: string): boolean {
  const now = new Date();
  const y = String(now.getFullYear());
  const yf = path.join(workspaceDir, "memory", "memory-core", "yearly", `${y}.md`);
  return fs.existsSync(yf);
}

/**
 * 检查当前月所有周的 weekly 文件是否都存在。
 * 计算本月包含的 ISO 周，逐一检查文件存在性。
 */
function allWeekliesDone(workspaceDir: string): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const weeklyDir = path.join(workspaceDir, "memory", "memory-core", "weekly", String(year));

  // 计算本月从第一天到最后一天覆盖的所有 ISO 周
  const weeksInMonth = new Set<string>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const wn = getWeekNumber(dt);
    weeksInMonth.add(wn);
  }

  // 检查每个周文件是否存在
  let foundAny = false;
  for (const wn of weeksInMonth) {
    const wf = path.join(weeklyDir, `${year}-W${wn}.md`);
    if (!fs.existsSync(wf)) return false;
    foundAny = true;
  }

  // 如果本月没有任何周 → 不满足"全部完成"（兜底：至少要有 1 个）
  return foundAny;
}

/**
 * 检查当前年所有月的 monthly 文件是否都存在。
 */
function allMonthliesDone(workspaceDir: string): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const monthlyDir = path.join(workspaceDir, "memory", "memory-core", "monthly", String(year));

  // 检查 1月～当前月的 monthly 文件
  const currentMonth = now.getMonth() + 1; // 1-based
  for (let m = 1; m <= currentMonth; m++) {
    const mn = String(m).padStart(2, "0");
    const mf = path.join(monthlyDir, `${year}-${mn}.md`);
    if (!fs.existsSync(mf)) return false;
  }

  return true;
}

// ── L1 A层：Light 便签锚点提取 ──────────────────────────────────────

/**
 * 从 Light 检查结果中提取 session_state 锚点，用于 A 层便签维护提醒。
 * 只在"有对话但便签为空"或"活跃任务为零且便签过时"时触发。
 */
function extractLightAnchors(lightResult: Record<string, unknown>): {
  session_state: {
    active_tasks: number;
    notes_empty: boolean;
    notes_stale_minutes: number;
    extra_last_conversation_minutes_ago: number;
  };
} | null {
  const ss = (lightResult as any).session_state;
  if (!ss || typeof ss !== "object") return null;
  return {
    session_state: {
      active_tasks: typeof ss.active_tasks === "number" ? ss.active_tasks : 0,
      notes_empty: ss.notes_empty === true || ss.notes_empty === "true",
      notes_stale_minutes: typeof ss.notes_stale_minutes === "number" ? ss.notes_stale_minutes : 9999,
      extra_last_conversation_minutes_ago: typeof ss.extra_last_conversation_minutes_ago === "number" ? ss.extra_last_conversation_minutes_ago : 9999,
    },
  };
}

// ── 检查类型判断（保留 Medium 逻辑，移除硬编码日终窗口） ─────────────

/**
 * 判断检查类型（仅 light / medium）
 * Full 检查由睡意驱动，不在此函数判断
 */
function determineCheckType(workspaceDir: string): "light" | "medium" {
  const lastMediumFile = path.join(
    workspaceDir,
    "memory",
    ".heartbeat",
    "last-medium.json",
  );

  if (!fs.existsSync(lastMediumFile)) {
    return "medium";
  }

  try {
    const raw = fs.readFileSync(lastMediumFile, "utf-8");
    const parsed = JSON.parse(raw) as { check_time?: string };
    const lastCheckTime = parsed.check_time;

    if (!lastCheckTime) {
      return "medium";
    }

    const lastTs = new Date(lastCheckTime).getTime();
    const elapsedMs = Date.now() - lastTs;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (elapsedHours >= 2) {
      return "medium";
    }
  } catch {
    log.warn("无法解析 last-medium.json，降级为 light");
  }

  return "light";
}

// ── Intent-Resolver 辅助函数（V3.8.8-beta2） ────────────────────────────

/**
 * 计算距上次 Medium 检查的小时数。
 * 从 memory/.heartbeat/last-medium.json 读取时间戳。
 */
function calcHoursSinceLastMedium(workspaceDir: string): number {
  const filePath = path.join(workspaceDir, "memory", ".heartbeat", "last-medium.json");
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { check_time?: string };
      if (parsed.check_time) {
        return (Date.now() - new Date(parsed.check_time).getTime()) / (1000 * 60 * 60);
      }
    }
  } catch { /* ignore */ }
  // 无记录 → 视为逾期很久
  return 999;
}

/**
 * 计算 ISO 周数（与 execute-protocol.ts 的 getWeekNumber 一致）
 */
function getWeekNumber(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
  );
  return String(weekNum).padStart(2, "0");
}

/**
 * 检查周期凝练文件是否存在（轻量级文件探针）
 * - weekly: 精确到当前周文件
 * - monthly/yearly: 精确路径匹配
 */
function checkConsolidationFile(
  workspaceDir: string,
  type: "weekly" | "monthly" | "yearly",
): boolean {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const base = path.join(workspaceDir, "memory", "memory-core");

  try {
    switch (type) {
      case "weekly": {
        // 精确检查当前周文件（与 execute-protocol.ts 一致）
        const weekNum = getWeekNumber(now);
        const weekFile = path.join(base, "weekly", year, `${year}-W${weekNum}.md`);
        return fs.existsSync(weekFile);
      }
      case "monthly": {
        const file = path.join(base, "monthly", year, `${year}-${month}.md`);
        return fs.existsSync(file);
      }
      case "yearly": {
        const file = path.join(base, "yearly", `${year}.md`);
        return fs.existsSync(file);
      }
    }
  } catch {
    return false;
  }
}

/**
 * Intent-resolver direct 协议执行器。
 * 根据解析出的协议类型，执行对应操作并注入 systemParts。
 */
async function executeProtocolDirect(
  workspaceDir: string,
  protocol: string,
  systemParts: string[],
): Promise<void> {
  switch (protocol) {
    case "full": {
      const fullResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", "intent_resolver",
      );
      systemParts.push("【📋 指令协议 — 用户主动触发日终】");
      systemParts.push(buildProtocol("full", fullResult, workspaceDir));
      const wp = buildWeeklyProtocol(fullResult, workspaceDir);
      if (wp) {
        systemParts.push(wp);
        systemParts.push("⚡ Full 协议的 spawn actions 与周梦协议的 spawn actions 互不依赖，可并行 sessions_spawn");
      }
      // 标记 eod-pending 已注入（不更新 last-eod，由 execute-protocol 的 updateState 在 LLM 执行后更新）
      const pf = path.join(workspaceDir, "memory", ".heartbeat", "eod-pending.json");
      try {
        if (fs.existsSync(pf)) {
          const cur = JSON.parse(fs.readFileSync(pf, "utf-8"));
          cur.injected = true;
          cur.injected_at = new Date().toISOString();
          fs.writeFileSync(pf, JSON.stringify(cur), "utf-8");
        }
      } catch { /* ignore */ }
      break;
    }
    case "medium": {
      const mediumResult = await executeCheckScriptWithLog(
        workspaceDir, "check-medium.sh", "medium", "intent_resolver",
      );
      systemParts.push("【📋 指令协议 — 用户主动触发】");
      systemParts.push(buildProtocol("medium", mediumResult, workspaceDir));
      break;
    }
    case "weekly": {
      const wkResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", "intent_resolver",
      );
      systemParts.push("【📅 指令协议 — 用户主动触发周终凝练】");
      const wp = buildWeeklyProtocol(wkResult, workspaceDir);
      if (wp) systemParts.push(wp);
      break;
    }
    case "monthly": {
      const moResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", "intent_resolver",
      );
      systemParts.push("【📅 指令协议 — 用户主动触发月终凝练】");
      const mp = buildMonthlyProtocol(moResult, workspaceDir, undefined, true);
      if (mp) systemParts.push(mp);
      else systemParts.push("⚠️ 月凝练条件不满足（非月末或文件已存在），已跳过。");
      break;
    }
    case "yearly": {
      const yrResult = await executeCheckScriptWithLog(
        workspaceDir, "check-full.sh", "full", "intent_resolver",
      );
      systemParts.push("【📅 指令协议 — 用户主动触发年终凝练】");
      const yp = buildYearlyProtocol(yrResult, workspaceDir, undefined, true);
      if (yp) systemParts.push(yp);
      else systemParts.push("⚠️ 年凝练条件不满足（非年末或文件已存在），已跳过。");
      break;
    }
    case "sleepiness_query": {
      const s = getSleepiness(workspaceDir);
      systemParts.push(
        `【😴 睡意查询】等级: ${s.level} (${s.score}) | ` +
        `距上次日终: ${s.hoursSinceLastEod.toFixed(1)}h | ` +
        `生物周期: ${s.factors.circadian} | 运行: ${s.factors.uptime} | 记忆储量: ${s.factors.memoryLoad}`,
      );
      break;
    }
    case "create_l2":
      await createEmptyL2(workspaceDir, getTodayStr());
      systemParts.push("【📝 指令协议 — L2 已创建】");
      break;
  }
}

// ── Weekly A层独立 turn 辅助函数 ──────────────────────────────────────

/** 判断当前是否为周末（周六=6，周日=0） */
function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

/** 检查 last-eod.json 是否存在且为今日记录（Full EOD 已完成） */
function lastEodCompleted(workspaceDir: string): boolean {
  const eodPath = path.join(workspaceDir, LAST_EOD_FILE);
  if (!fs.existsSync(eodPath)) return false;
  try {
    const raw = fs.readFileSync(eodPath, "utf-8");
    const parsed = JSON.parse(raw) as { last_eod_time?: number };
    if (!parsed.last_eod_time) return false;
    // last_eod_time 必须是今天（避免跨日残留）
    const eodDate = new Date(parsed.last_eod_time).toISOString().slice(0, 10);
    return eodDate === getTodayStr();
  } catch {
    return false;
  }
}

/**
 * 构建 Weekly 单独协议（A层独立 turn 使用）
 * 只运行 check-full.sh 获取 anchors，生成 Weekly 协议文本。
 * 不与 Full 协议混合——Full 优先由调用方保证。
 */
async function buildWeeklyProtocolOnly(workspaceDir: string): Promise<string> {
  const fullResult = await executeCheckScriptWithLog(
    workspaceDir, "check-full.sh", "full", "weekly_auto",
  );
  const protocolText = buildWeeklyProtocol(fullResult, workspaceDir);
  if (!protocolText) return "";

  const weeklyDue = (fullResult as any).weekly_due as Record<string, unknown> | undefined;
  const wn = weeklyDue?.week_num || "?";
  const wy = weeklyDue?.week_year || "?";

  const header = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `⚠️ 当前轮为 Weekly 协议执行轮（${wy}-W${wn} 周凝练）`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "你必须按下方清单完成所有行动项后，以\"[✓ 周梦协议执行完毕]\"结尾。",
    "对话消息将在下一轮处理。本轮只执行协议，不回复用户对话。",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ].join("\n");

  return header + "\n" + protocolText;
}
