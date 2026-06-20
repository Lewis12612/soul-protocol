// ───────────────────────────────────────────────────────────────────────
// 记忆注入钩子 — 薄层包装器（段6重构）
// 钩子: before_prompt_build
//
// 职责：
// 1. 场景判断（startup / heartbeat / recovery）
// 2. 状态持久化（plugin-state.json）
// 3. 调用 hub.dispatch 分发到场景处理器
// 4. 组装返回结果（prependSystemContext / appendSystemContext）
//
// 所有业务逻辑已下沉到 modules/startup.ts、modules/heartbeat.ts、modules/recovery.ts
// ───────────────────────────────────────────────────────────────────────

import type {
  PluginHookBeforePromptBuildEvent,
  PluginHookBeforePromptBuildResult,
  PluginHookAgentContext,
  DispatchContext,
} from "../types.js";
import { dispatch } from "../hub.js";
import { createLogger } from "../utils/logger.js";
import { initAgentConfig } from "../utils/agent-config.js";
import { buildProtocol } from "../protocol.js";
import { buildWeeklyProtocol } from "../modules/memory/consolidation.js";
import { getSleepiness } from "../modules/heartbeat.js";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const log = createLogger("hook:before-prompt-build");

// ── 状态持久化 ──────────────────────────────────────────────────────────

type PluginState = {
  stateVersion: number;
  lastMessageCount: number;
  lastHeartbeatTime: number;
  lastFullInjectTime: number;
  hasDoneStartup: boolean;
};

const PLUGIN_STATE_FILE = "memory/.heartbeat/plugin-state.json";

function getStatePath(workspaceDir: string): string {
  return path.join(workspaceDir, PLUGIN_STATE_FILE);
}

function loadState(workspaceDir: string): PluginState {
  const p = getStatePath(workspaceDir);
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PluginState>;
      return {
        stateVersion: typeof parsed.stateVersion === "number" ? parsed.stateVersion : 1,
        lastMessageCount: typeof parsed.lastMessageCount === "number" ? parsed.lastMessageCount : -1,
        lastHeartbeatTime: typeof parsed.lastHeartbeatTime === "number" ? parsed.lastHeartbeatTime : 0,
        lastFullInjectTime: typeof parsed.lastFullInjectTime === "number" ? parsed.lastFullInjectTime : 0,
        hasDoneStartup: typeof parsed.hasDoneStartup === "boolean" ? parsed.hasDoneStartup : false,
      };
    }
  } catch (err) {
    log.warn("状态加载失败，使用默认值", { error: String(err) });
  }
  return { stateVersion: 1, lastMessageCount: -1, lastHeartbeatTime: 0, lastFullInjectTime: 0, hasDoneStartup: false };
}

function saveState(workspaceDir: string, state: PluginState): void {
  const p = getStatePath(workspaceDir);
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    log.warn("状态保存失败", { error: String(err) });
  }
}

// ── 场景判断 ────────────────────────────────────────────────────────────

/**
 * 根据 trigger 和消息数判断场景类型
 * - heartbeat trigger → heartbeat
 * - 首次运行 / 消息数 ≤ 2 → startup
 * - 消息数骤降（compact后）→ recovery
 * - 其他 → heartbeat（默认）
 */
function determineScenario(
  trigger: string | undefined,
  msgCount: number,
  state: PluginState,
): "startup" | "heartbeat" | "recovery" | "conversation" {
  if (trigger === "heartbeat") return "heartbeat";

  const isFirstRun = state.lastMessageCount === -1;
  if (isFirstRun || msgCount <= 2) return "startup";

  // compact 检测：消息数骤降超过 50%（比例阈值，比固定值更可靠）
  if (state.lastMessageCount > 0 && msgCount < state.lastMessageCount * 0.5) return "recovery";

  return "conversation"; // V3.8.8: 用户消息 → conversation（更精确的语义）
}

// ── 守护进程 keepalive ──────────────────────────────────────────────────

function ensureWatchdogAlive(workspaceDir: string): void {
  const pidFile = path.join(workspaceDir, "memory", ".heartbeat", "watchdog.pid");
  const watchdogScript = path.join(
    workspaceDir, "skills", "soul-protocol", "scripts", "sleepiness-watchdog.cjs",
  );

  try {
    // 检查 PID 文件中的进程是否存活
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
      try {
        process.kill(pid, 0); // 信号 0 = 仅检查是否存在
        return; // 已在运行
      } catch {
        log.info("🛡️ 守护进程 PID 无效，重新启动", { pid });
      }
    }

    // 启动 watchdog 作为分离子进程
    log.info("🛡️ 启动睡眠守护进程");
    const child = spawn("node", [watchdogScript, "--workspace-dir", workspaceDir], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    log.info("🛡️ 守护进程已启动", { pid: child.pid });
  } catch (err) {
    log.warn("守护进程启动失败", { error: String(err) });
  }
}

function ensureExtraAlive(workspaceDir: string): void {
  // 从 workspaceDir 推导 state 目录（~/.openclaw 或 ~/.openclaw-4.2）
  const home = process.env.HOME || "/home/openclaw";
  const stateDir = workspaceDir.includes(".openclaw-4.2")
    ? path.join(home, ".openclaw-4.2")
    : path.join(home, ".openclaw");
  const pidFile = path.join(stateDir, "logs", "dialogue-logger.pid");
  const daemonScript = path.join(workspaceDir, "skills", "dialogue-logger", "daemon.sh");

  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
      try {
        process.kill(pid, 0);
        return; // 已在运行
      } catch {
        log.info("📁 EXTRA 守护进程 PID 无效，重新启动", { pid });
      }
    }

    if (!fs.existsSync(daemonScript)) {
      log.warn("EXTRA daemon.sh 不存在，跳过");
      return;
    }

    log.info("📁 启动 EXTRA 守护进程");
    const child = spawn("bash", [daemonScript], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    log.info("📁 EXTRA 守护进程已启动", { pid: child.pid });
  } catch (err) {
    log.warn("EXTRA 守护进程启动失败", { error: String(err) });
  }
}

// ── workspaceDir 解析 ────────────────────────────────────────────────────

function resolveWorkspaceDir(
  ctx: PluginHookAgentContext,
  pluginWorkspaceDir?: string,
): string {
  if (pluginWorkspaceDir) return pluginWorkspaceDir;
  if (ctx.workspaceDir) return ctx.workspaceDir;
  if (process.env.OPENCLAW_WORKSPACE_DIR) return process.env.OPENCLAW_WORKSPACE_DIR;
  const defaultDir = process.env.HOME
    ? `${process.env.HOME}/.openclaw/workspace`
    : "/tmp/openclaw-workspace";
  log.warn("workspaceDir 回退到默认值", { defaultDir });
  return defaultDir;
}

// ── 协议标记检测（L2 兜底） ───────────────────────────────────────────

const PROTOCOL_MARKER_REGEX = /<!--\s*PROTOCOL:(\w+)\s*-->/;

interface MarkerResult {
  marker: string;
  protocol: string;
}

/**
 * 检查消息中的协议标记（L2 兜底机制）
 * 遍历 event.messages（倒序），找到最后一条 assistant 消息中的 <!-- PROTOCOL:xxx --> 标记
 * 找到后从消息内容中移除标记（用户不可见），返回标记信息
 */
function checkProtocolMarkers(messages: unknown[]): MarkerResult | null {
  // 去重：如果本轮已有 execute_protocol tool 调用，跳过标记检测
  const hasToolCall = messages.some((m) => {
    const msg = m as Record<string, unknown>;
    if (msg.role === "assistant") {
      const tc = msg.tool_calls as Array<Record<string, unknown>> | undefined;
      return tc?.some((t) => (t as any).function?.name === "execute_protocol") ?? false;
    }
    return false;
  });
  if (hasToolCall) {
    log.info("🔖 跳过标记检测：本轮已有 execute_protocol tool 调用（去重）");
    return null;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role !== "assistant") continue;

    const content = typeof msg.content === "string" ? msg.content : "";
    if (!content) continue;

    const match = content.match(PROTOCOL_MARKER_REGEX);
    if (!match) continue;

    const protocol = match[1].toLowerCase();
    const marker = match[0];

    // 从消息中移除标记（用户不可见）
    (messages[i] as Record<string, unknown>).content = content.replace(marker, "").trim();

    return { marker, protocol };
  }
  return null;
}

/**
 * 根据标记的协议类型构建协议文本（轻量版，不更新状态）
 * L2 兜底机制：LLM 应该已通过 tool 或手动执行了动作，标记只是补充注入
 */
function buildMarkerProtocol(protocol: string, workspaceDir: string): string | null {
  const VALID = ["full", "medium", "weekly", "monthly", "yearly", "sleepiness"];
  if (!VALID.includes(protocol)) {
    log.warn("未知协议标记", { protocol });
    return null;
  }

  switch (protocol) {
    case "full": {
      // 读取睡意状态和上次日终信息，构建轻量日终协议提示
      let sleepinessInfo = "";
      try {
        const s = getSleepiness(workspaceDir);
        sleepinessInfo = `【${s.emoji} 睡意状态: ${s.level} (${s.score})】\n距上次日终: ${s.hoursSinceLastEod.toFixed(1)}h | 生物: ${s.factors.circadian} | 运行: ${s.factors.uptime} | 记忆: ${s.factors.memoryLoad}\n💭 ${s.systemHint}`;
      } catch { /* ignore */ }

      const lastEod = tryReadLastEod(workspaceDir);
      const lines: string[] = [];
      lines.push("【🌙 日终协议（标记触发）】");
      lines.push("检测到上轮标记 <!-- PROTOCOL:full -->，继续执行日终归档流程。");
      if (lastEod) {
        const ago = Math.round((Date.now() - lastEod.last_eod_time) / 36000) / 100;
        lines.push(`上次日终: ${ago}h 前 (${new Date(lastEod.last_eod_time).toISOString()})`);
      }
      if (sleepinessInfo) lines.push(sleepinessInfo);
      lines.push("");
      lines.push("请执行日终流程：L2跨日交接 → daily归档 → 日记 → deep/work归档 → SESSION-STATE清理。");
      lines.push("完成后输出: [✓ 日终协议执行完毕]");
      return lines.join("\n");
    }

    case "medium": {
      let sleepinessInfo = "";
      try {
        const s = getSleepiness(workspaceDir);
        sleepinessInfo = `【${s.emoji} 睡意: ${s.level} (${s.score})】`;
      } catch { /* ignore */ }

      const lines: string[] = [];
      lines.push("【☕ Medium 协议（标记触发）】");
      lines.push("检测到上轮标记 <!-- PROTOCOL:medium -->，执行 L2 增量更新。");
      if (sleepinessInfo) lines.push(sleepinessInfo);
      lines.push("");
      lines.push("请执行 Medium 协议：更新 L2 记忆 → 检查 INDEX → 验证 SESSION-STATE。");
      lines.push("完成后输出: [✓ Medium协议执行完毕]");
      return lines.join("\n");
    }

    case "weekly": {
      return "【📅 周凝练协议（标记触发）】\n检测到上轮标记 <!-- PROTOCOL:weekly -->。请执行周叙事重建 + L4 演化审查。读取 templates/consolidation/weekly-template.md 获取格式。完成后输出: [✓ 周梦协议执行完毕]";
    }

    case "monthly": {
      return "【📅 月凝练协议（标记触发）】\n检测到上轮标记 <!-- PROTOCOL:monthly -->。请执行月索引压缩。读取 templates/consolidation/monthly-template.md 获取格式。完成后输出: [✓ 月凝练完成]";
    }

    case "yearly": {
      return "【📅 年凝练协议（标记触发）】\n检测到上轮标记 <!-- PROTOCOL:yearly -->。请执行年度回顾 + 主题演变。读取 templates/consolidation/yearly-template.md 获取格式。完成后输出: [✓ 年凝练完成]";
    }

    case "sleepiness": {
      try {
        const s = getSleepiness(workspaceDir);
        return `【${s.emoji} 睡意状态: ${s.level} (${s.score})】\n距上次日终: ${s.hoursSinceLastEod.toFixed(1)}h | 生物: ${s.factors.circadian} | 运行: ${s.factors.uptime} | 记忆: ${s.factors.memoryLoad}\n💭 ${s.systemHint}`;
      } catch {
        return "【😴 睡意状态】无法获取睡意状态。";
      }
    }

    default:
      return null;
  }
}

/** 读取上次日终状态（轻量，仅读时间戳） */
function tryReadLastEod(workspaceDir: string): { last_eod_time: number } | null {
  try {
    const p = path.join(workspaceDir, "memory", ".heartbeat", "last-eod.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as { last_eod_time: number };
    }
  } catch { /* ignore */ }
  return null;
}

// ── 协议工作流文档注入（startup 场景） ───────────────────────────────

/**
 * 读取协议工作流参考文档
 * 文件路径: skills/soul-protocol/references/protocol-workflow.md
 * 不存在时返回 null
 */
function readProtocolWorkflowDoc(workspaceDir: string): string | null {
  const filePath = path.join(
    workspaceDir, "skills", "soul-protocol", "references", "protocol-workflow.md",
  );
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    log.warn("读取协议工作流文档失败", { error: String(err) });
  }
  return null;
}

// ── 主钩子 ───────────────────────────────────────────────────────────────

/**
 * 创建 before_prompt_build 钩子
 * @param pluginWorkspaceDir 插件注册时传入的 workspaceDir
 */
export function createBeforePromptBuildHook(pluginWorkspaceDir?: string) {
  let state: PluginState = {
    stateVersion: 1,
    lastMessageCount: -1,
    lastHeartbeatTime: 0,
    lastFullInjectTime: 0,
    hasDoneStartup: false,
  };
  let stateInitialized = false;

  return async function beforePromptBuild(
    event: PluginHookBeforePromptBuildEvent,
    ctx: PluginHookAgentContext,
  ): Promise<PluginHookBeforePromptBuildResult | void> {
    const workspaceDir = resolveWorkspaceDir(ctx, pluginWorkspaceDir);
    const trigger = ctx.trigger || "prompt";
    const msgCount = event.messages?.length ?? 0;

    // 首次调用时从文件加载状态
    if (!stateInitialized) {
      state = loadState(workspaceDir);
      initAgentConfig(workspaceDir); // V3.8.8: 初始化 Agent 配置
      stateInitialized = true;

      // 🛡️ 守护进程 keepalive：首次调用时确保后台进程运行
      ensureWatchdogAlive(workspaceDir);
      ensureExtraAlive(workspaceDir);
    }

    log.debug("Prompt构建开始", {
      messageCount: msgCount,
      trigger,
      workspaceDir,
      stateLastMsgCount: state.lastMessageCount,
    });

    // 判断场景
    const scenario = determineScenario(trigger, msgCount, state);

    // 更新状态
    const prevMessageCount = state.lastMessageCount;
    state.lastMessageCount = msgCount;

    if (scenario === "startup") {
      log.info("🚀 启动场景：全量注入", { msgCount });
      state.lastFullInjectTime = Date.now();
      state.hasDoneStartup = true;
    } else if (scenario === "recovery") {
      log.info("🔄 恢复场景（compact后）", {
        prevMsgCount: prevMessageCount,
        currMsgCount: msgCount,
      });
      state.lastFullInjectTime = Date.now();
    } else if (scenario === "heartbeat") {
      log.info("💓 心跳场景：增量注入", { msgCount });
      state.lastHeartbeatTime = Date.now();
    }

    saveState(workspaceDir, state);

    // ── 0. 守护进程 EOD 待处理检查 ──
    // 如果当前为 startup 场景（msgCount≤2），跳过 eod-pending 消费
    // 优先执行 startup 全量注入（L3 INDEX + SESSION-STATE + 工作流文档）
    const eodPendingFile = path.join(workspaceDir, "memory", ".heartbeat", "eod-pending.json");
    const isStartup = msgCount <= 2 && state.lastMessageCount === -1;
    if (isStartup && fs.existsSync(eodPendingFile)) {
      log.info("🔔 eod-pending 存在但当前为 startup，推迟消费——优先全量注入");
    } else {
    try {
      if (fs.existsSync(eodPendingFile)) {
        const pendingRaw = fs.readFileSync(eodPendingFile, "utf-8");
        const pendingData = JSON.parse(pendingRaw) as {
          triggered_by?: string;
          trigger_level?: string;
          sleepiness?: { level?: string; score?: number };
          full_result?: Record<string, unknown>;
          created_at?: string;
          consumed?: boolean;
        };

        // 检查时效性：10分钟内的待处理才有效
        const createdMs = pendingData.created_at
          ? new Date(pendingData.created_at).getTime()
          : 0;
        const ageMs = Date.now() - createdMs;
        const isFresh = ageMs < 10 * 60 * 1000; // 10分钟

        if (isFresh && !pendingData.consumed && pendingData.full_result) {
          log.info("🔔 守护进程日终协议待处理，直接注入", {
            triggeredBy: pendingData.triggered_by,
            level: pendingData.trigger_level,
            ageSeconds: Math.round(ageMs / 1000),
          });

          // 构建 Full + Weekly 协议
          const sleepinessState = pendingData.sleepiness as any;
          const fullProtocol = buildProtocol(
            "full",
            pendingData.full_result,
            workspaceDir,
            sleepinessState,
          );
          const weeklyProtocol = buildWeeklyProtocol(
            pendingData.full_result,
            workspaceDir,
            sleepinessState,
          );

          const prependSystemContext = [fullProtocol, weeklyProtocol]
            .filter(Boolean)
            .join("\n\n");

          // 标记已消费并清理
          try {
            // 更新 last-eod 时间防止 watchdog 重复触发
            const lastEodFile = path.join(workspaceDir, "memory", ".heartbeat", "last-eod.json");
            const lastEodDir = path.dirname(lastEodFile);
            if (!fs.existsSync(lastEodDir)) fs.mkdirSync(lastEodDir, { recursive: true });
            // 原子写入：先写临时文件，再 rename（防止并发写损坏）
            const tmpPath = lastEodFile + ".tmp";
            fs.writeFileSync(tmpPath, JSON.stringify({
              last_eod_time: Date.now(),
              updated_at: new Date().toISOString(),
            }), "utf-8");
            fs.renameSync(tmpPath, lastEodFile);
            log.info("✅ last-eod 时间已更新（去重）");

            fs.unlinkSync(eodPendingFile);
            log.info("✅ 守护进程日终协议已注入并清理");
          } catch {
            // 清理失败不影响注入
          }

          // 直接返回，跳过正常场景分发
          return {
            prependSystemContext: prependSystemContext || undefined,
          };
        } else if (!isFresh) {
          // 过期残留 → 清理
          fs.unlinkSync(eodPendingFile);
          log.info("🧹 清理过期的守护进程待处理文件");
        }
        // consumed=true → 异常状态，也清理
        else if (pendingData.consumed) {
          fs.unlinkSync(eodPendingFile);
          log.info("🧹 清理已消费的守护进程残留文件");
        }
      }
    } catch (err) {
      log.warn("守护进程待处理检查异常", { error: String(err) });
      // 异常不阻塞正常流程
    }
    } // end eod-pending check (skipped for startup)

    // ── 0.5. 协议标记检测（L2 兜底） ────────────────────────────
    const markerResult = checkProtocolMarkers(event.messages);
    if (markerResult) {
      log.info("🔖 协议标记检测到", { marker: markerResult.marker, protocol: markerResult.protocol });
      const markerProtocol = buildMarkerProtocol(markerResult.protocol, workspaceDir);
      if (markerProtocol) {
        return { prependSystemContext: markerProtocol };
      }
    }

    // V3.8.8-beta2: 提取最后一条用户消息文本（conversation 场景用于 intent-resolver）
    let userMessage: string | undefined;
    if (scenario === "conversation" && event.messages?.length > 0) {
      const messages = event.messages as Array<{ role?: string; content?: unknown }>;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.role === "user" && msg.content !== undefined) {
          const content = msg.content;
          if (typeof content === "string") {
            userMessage = content;
          } else if (Array.isArray(content)) {
            // 多模态消息：提取文本块拼接
            userMessage = (content as Array<{ type?: string; text?: string }>)
              .filter((c) => c.type === "text" && c.text)
              .map((c) => c.text)
              .join("\n");
          }
          break;
        }
      }
    }

    // 构建分发上下文
    const dispatchCtx: DispatchContext = {
      scenario,
      trigger,
      workspaceDir,
      userMessage,
    };

    // 调用 hub 分发
    const result = await dispatch(dispatchCtx);

    // startup 场景：注入协议工作流文档
    if (scenario === "startup") {
      const workflowDoc = readProtocolWorkflowDoc(workspaceDir);
      if (workflowDoc) {
        log.info("📘 startup: 注入协议工作流文档");
        // 注入到 result.data.prependSystemContext（在现有内容之前）
        if (!result.data || typeof result.data !== "object") {
          (result as Record<string, unknown>).data = { prependSystemContext: workflowDoc };
        } else {
          const data = result.data as Record<string, unknown>;
          data.prependSystemContext = data.prependSystemContext
            ? `${workflowDoc}\n\n${data.prependSystemContext}`
            : workflowDoc;
        }
      }
    }

    // 组装返回结果
    const hookResult: PluginHookBeforePromptBuildResult = {};

    // result.output[0] 是给用户看的简短结果 → appendSystemContext（用户层）
    if (result.output.length > 0) {
      hookResult.appendSystemContext = result.output.join("\n");
    }

    // result.data.prependSystemContext 是协议注入内容 → prependSystemContext（系统层）
    if (result.data && typeof result.data === "object") {
      const data = result.data as { prependSystemContext?: string; appendSystemContext?: string };
      if (data.prependSystemContext) {
        hookResult.prependSystemContext = data.prependSystemContext;
      }
      // 如果协议层也有 appendSystemContext（如L2记忆），合并到用户层
      if (data.appendSystemContext) {
        hookResult.appendSystemContext = hookResult.appendSystemContext
          ? `${hookResult.appendSystemContext}\n\n${data.appendSystemContext}`
          : data.appendSystemContext;
      }
    }

    if (Object.keys(hookResult).length > 0) {
      log.info("✅ 上下文注入完成", {
        scenario,
        hasPrepend: !!hookResult.prependSystemContext,
        hasAppend: !!hookResult.appendSystemContext,
      });
      return hookResult;
    }

    log.info("✅ 无上下文需要注入");
  };
}
