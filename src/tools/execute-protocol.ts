// ───────────────────────────────────────────────────────────────────────
// execute_protocol 工具 — LLM 主动调用协议通道（V3.8.8-beta2 新增）
//
// 通过 api.registerTool() 注册，让 LLM 可以主动执行协议模块：
// - full:           日终归档 (check-full.sh)
// - medium:         增量检查 (check-medium.sh)
// - weekly:         周凝练模板
// - monthly:        月凝练模板
// - yearly:         年凝练模板
// - sleepiness_query: 睡意状态查询
// - create_l2:      创建/检查今日 L2
//
// 去重逻辑复用 heartbeat.ts 的 last-eod.json / last-medium.json 机制。
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { OpenClawPluginApi } from "../types.js";
import { loadSleepinessConfig } from "../utils/sleepiness-config.js";
import { getExtraBasePath, getHomeDir } from "../utils/agent-config.js";
import { getTodayStr } from "../modules/memory/reader.js";
import { buildWeeklyProtocol, buildMonthlyProtocol, buildYearlyProtocol } from "../modules/memory/consolidation.js";
import { buildProtocol } from "../protocol.js";
import { createLogger, logInfo, logError } from "../utils/logger.js";

const log = createLogger("tool:execute-protocol");

// ── 常量 ───────────────────────────────────────────────────────────────

const VALID_PROTOCOLS = [
  "full", "medium", "weekly", "monthly", "yearly",
  "sleepiness_query", "create_l2",
] as const;
type ProtocolType = (typeof VALID_PROTOCOLS)[number];

const DEDUP_COOLDOWN_MS = 30 * 60 * 1000; // 30 分钟冷却
const SCRIPT_TIMEOUT_MS = 30000;

// ── 状态文件路径常量 ──────────────────────────────────────────────────

const LAST_EOD_FILE = "memory/.heartbeat/last-eod.json";
const LAST_MEDIUM_FILE = "memory/.heartbeat/last-medium.json";

// ── 公开注册函数 ──────────────────────────────────────────────────────

/**
 * 注册 execute_protocol 工具到插件 API。
 * workspaceDir 通过 api.pluginConfig / api.config 获取，闭包捕获。
 */
export function registerExecuteProtocolTool(api: OpenClawPluginApi): void {
  const workspaceDir: string =
    (api.pluginConfig as Record<string, unknown> | undefined)
      ?.workspaceDir as string
    ?? (api.config?.workspace?.dir as string)
    ?? process.env.OPENCLAW_WORKSPACE_DIR
    ?? path.join(getHomeDir(), ".openclaw", "workspace");

  api.registerTool({
    name: "execute_protocol",
    description:
      "主动执行灵魂系统协议模块。当用户要求日终归档、周终凝练、检查记忆状态时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        protocol: {
          type: "string",
          enum: [...VALID_PROTOCOLS],
          description: "要执行的协议类型",
        },
        reason: {
          type: "string",
          description: "执行原因（用户请求/自主判断）",
        },
      },
      required: ["protocol"],
    },
    async execute(
      _id: string,
      params: Record<string, unknown>,
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const protocol = params.protocol as string;
      const reason = (params.reason as string) || "未指定";

      log.info("🔧 execute_protocol 被调用", { protocol, reason });
      logInfo("protocol", "executed", `LLM调用 execute_protocol: ${protocol}`, {
        protocol,
        source: reason,
      });

      // ── 1. 参数验证 ──────────────────────────────────────────
      if (!VALID_PROTOCOLS.includes(protocol as ProtocolType)) {
        const msg = `❌ 无效协议类型: "${protocol}"。有效值: ${VALID_PROTOCOLS.join(", ")}`;
        log.warn(msg);
        return { content: [{ type: "text", text: msg }] };
      }

      // ── 2. 去重检查 ──────────────────────────────────────────
      const dedup = shouldExecute(protocol as ProtocolType, workspaceDir);
      if (!dedup.ok) {
        log.info("⏭️ 协议去重跳过", { protocol, reason: dedup.reason });
        return {
          content: [
            {
              type: "text",
              text: `⏭️ 协议 "${protocol}" 跳过：${dedup.reason}\n原因: ${reason}`,
            },
          ],
        };
      }

      // ── 3. 执行协议 ──────────────────────────────────────────
      const resultText = executeProtocol(
        protocol as ProtocolType,
        workspaceDir,
        reason,
      );

      // ── 4. 更新状态 ──────────────────────────────────────────
      updateState(protocol as ProtocolType, workspaceDir);

      // B层：对于 full/medium 协议，记录 protocol:confirmed 确认日志
      if (protocol === "full") {
        logInfo("protocol", "confirmed", "LLM通过tool确认接收日终协议", {
          protocol: "full",
          source: reason,
        });
      }
      if (protocol === "medium") {
        logInfo("protocol", "confirmed", "LLM通过tool确认接收Medium协议", {
          protocol: "medium",
          source: reason,
        });
      }
      if (protocol === "weekly") {
        logInfo("protocol", "confirmed", "LLM通过tool确认接收周凝练协议", {
          protocol: "weekly",
          source: reason,
        });
      }
      if (protocol === "monthly") {
        logInfo("protocol", "confirmed", "LLM通过tool确认接收月凝练协议", {
          protocol: "monthly",
          source: reason,
        });
      }
      if (protocol === "yearly") {
        logInfo("protocol", "confirmed", "LLM通过tool确认接收年凝练协议", {
          protocol: "yearly",
          source: reason,
        });
      }

      // B层：对于 full 协议，构建完整协议清单附加到返回结果
      let protocolChecklist = "";
      if (protocol === "full" && workspaceDir) {
        try {
          // 从脚本输出提取 JSON 用于 buildProtocol
          const jsonMatch = resultText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const fullResult = JSON.parse(jsonMatch[0]);
            const checklist = buildProtocol("full", fullResult, workspaceDir);
            protocolChecklist = `\n\n---\n📋 **协议执行清单**（后续步骤参考）:\n${checklist}`;
          }
        } catch { /* 构建失败不影响正常返回 */ }
      }

      return {
        content: [{ type: "text", text: resultText + protocolChecklist }],
      };
    },
  });

  log.info("📌 注册工具: execute_protocol");
}

// ── 去重检查 ──────────────────────────────────────────────────────────

interface DedupResult {
  ok: boolean;
  reason?: string;
}

function shouldExecute(protocol: ProtocolType, workspaceDir: string): DedupResult {
  const now = Date.now();

  switch (protocol) {
    case "full": {
      const eodPath = path.join(workspaceDir, LAST_EOD_FILE);
      if (fs.existsSync(eodPath)) {
        try {
          const raw = fs.readFileSync(eodPath, "utf-8");
          const parsed = JSON.parse(raw) as { last_eod_time?: number };
          if (parsed.last_eod_time && now - parsed.last_eod_time < DEDUP_COOLDOWN_MS) {
            const minutes = Math.round((now - parsed.last_eod_time) / 60000);
            return { ok: false, reason: `距上次 Full 执行仅 ${minutes} 分钟，冷却中（最短间隔 30 分钟）` };
          }
        } catch { /* 解析失败 → 允许执行 */ }
      }
      return { ok: true };
    }

    case "medium": {
      const medPath = path.join(workspaceDir, LAST_MEDIUM_FILE);
      if (fs.existsSync(medPath)) {
        try {
          const raw = fs.readFileSync(medPath, "utf-8");
          const parsed = JSON.parse(raw) as { check_time?: string };
          if (parsed.check_time) {
            const lastTs = new Date(parsed.check_time).getTime();
            if (now - lastTs < DEDUP_COOLDOWN_MS) {
              const minutes = Math.round((now - lastTs) / 60000);
              return { ok: false, reason: `距上次 Medium 执行仅 ${minutes} 分钟，冷却中（最短间隔 30 分钟）` };
            }
          }
        } catch { /* 解析失败 → 允许执行 */ }
      }
      return { ok: true };
    }

    case "weekly": {
      return checkConsolidationFileExists(workspaceDir, "weekly");
    }

    case "monthly": {
      return checkConsolidationFileExists(workspaceDir, "monthly");
    }

    case "yearly": {
      return checkConsolidationFileExists(workspaceDir, "yearly");
    }

    // sleepiness_query / create_l2 无冷却
    default:
      return { ok: true };
  }
}

/**
 * 检查周期凝练文件是否已存在
 * 文件已存在 → 跳过（防止重复凝练）
 */
function checkConsolidationFileExists(
  workspaceDir: string,
  type: "weekly" | "monthly" | "yearly",
): DedupResult {
  const now = new Date();
  const year = now.getFullYear();
  let filePath: string;

  switch (type) {
    case "weekly": {
      const weekNum = getWeekNumber(now);
      filePath = path.join(
        workspaceDir, "memory", "memory-core", "weekly",
        String(year), `${year}-W${weekNum}.md`,
      );
      break;
    }
    case "monthly": {
      const month = String(now.getMonth() + 1).padStart(2, "0");
      filePath = path.join(
        workspaceDir, "memory", "memory-core", "monthly",
        String(year), `${year}-${month}.md`,
      );
      break;
    }
    case "yearly": {
      filePath = path.join(
        workspaceDir, "memory", "memory-core", "yearly",
        `${year}.md`,
      );
      break;
    }
  }

  if (fs.existsSync(filePath)) {
    return { ok: false, reason: `${type} 凝练文件已存在: ${filePath}` };
  }
  return { ok: true };
}

/** ISO 周数计算 */
function getWeekNumber(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstThursdayDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayNr + 3);
  const weekNum = Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 + firstThursday.getDay() - 1) / 7,
  );
  return String(weekNum).padStart(2, "0");
}

// ── 协议执行 ──────────────────────────────────────────────────────────

function executeProtocol(
  protocol: ProtocolType,
  workspaceDir: string,
  reason: string,
): string {
  switch (protocol) {
    case "full":
      return executeCheckScript(workspaceDir, "check-full.sh", "full", reason);
    case "medium":
      return executeCheckScript(workspaceDir, "check-medium.sh", "medium", reason);
    case "weekly":
      return executeConsolidationScript(workspaceDir, "weekly", reason);
    case "monthly":
      return executeConsolidationScript(workspaceDir, "monthly", reason);
    case "yearly":
      return executeConsolidationScript(workspaceDir, "yearly", reason);
    case "sleepiness_query":
      return querySleepiness(workspaceDir);
    case "create_l2":
      return checkL2Status(workspaceDir);
    default:
      return "未知协议类型";
  }
}

// ── 检查脚本执行 ─────────────────────────────────────────────────────

function executeCheckScript(
  workspaceDir: string,
  scriptName: string,
  checkType: string,
  reason: string,
): string {
  const config = loadSleepinessConfig(workspaceDir);
  const scriptsPath = config.checkScriptsPath;
  const scriptPath = path.join(workspaceDir, scriptsPath, scriptName);

  if (!fs.existsSync(scriptPath)) {
    log.warn("检查脚本不存在", { scriptPath });
    return `❌ 检查脚本不存在: ${scriptPath}\n原因: ${reason}`;
  }

  const startTime = Date.now();
  try {
    const stdout = execSync(`bash "${scriptPath}"`, {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8" as BufferEncoding,
    });

    const durationMs = Date.now() - startTime;

    // 正则提取 JSON
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return `⚠️ ${checkType} 脚本执行完成，但输出中未找到 JSON。\n耗时: ${durationMs}ms\n原因: ${reason}\n\n原始输出:\n${stdout.slice(0, 2000)}`;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const summary = formatCheckResult(checkType, parsed, durationMs, reason);

    return summary;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    log.warn(`${checkType} 脚本执行失败`, { error: String(err) });
    return `❌ ${checkType} 脚本执行失败\n耗时: ${durationMs}ms\n错误: ${String(err)}\n原因: ${reason}`;
  }
}

/** 格式化检查脚本结果为人类可读摘要 */
function formatCheckResult(
  checkType: string,
  result: Record<string, unknown>,
  durationMs: number,
  reason: string,
): string {
  const lines: string[] = [];
  lines.push(`✅ ${checkType.toUpperCase()} 协议执行完成`);
  lines.push("");
  lines.push(`📊 执行摘要:`);
  lines.push(`- 触发原因: ${reason}`);
  lines.push(`- 耗时: ${durationMs}ms`);
  lines.push(`- 检查类型: ${(result as any).check_type || checkType}`);

  // 必需动作
  const actions = (result as any).required_actions as
    | Array<{ action: string; reason?: string }>
    | undefined;
  if (actions?.length) {
    lines.push(`- 必需动作 (${actions.length}):`);
    for (const a of actions) {
      lines.push(`  • ${a.action}${a.reason ? ` (原因: ${a.reason})` : ""}`);
    }
  }

  // 日终相关
  if (checkType === "full" || checkType === "medium") {
    const actionObj = (result as any).action as Record<string, unknown> | undefined;
    if (actionObj) {
      lines.push(`- action: ${JSON.stringify(actionObj)}`);
    }
    const status = (result as any).status as string | undefined;
    if (status) {
      lines.push(`- 状态: ${status}`);
    }
    const currentDate = (result as any).current_date as string | undefined;
    if (currentDate) {
      lines.push(`- 当前日期: ${currentDate}`);
    }
  }

  // L2 信息
  const l2 = (result as any).l2 as Record<string, unknown> | undefined;
  if (l2?.exists !== undefined) {
    lines.push(
      `- L2: ${l2.exists ? "✅ 存在" : "❌ 不存在"}`
      + (l2.lines ? ` (${l2.lines}行, ${(l2.bytes as number || 0)}字节)` : ""),
    );
  }

  // 周期凝练相关
  const weeklyDue = (result as any).weekly_due as Record<string, unknown> | undefined;
  if (weeklyDue) {
    const wn = weeklyDue.week_num;
    const wy = weeklyDue.week_year;
    const needs = weeklyDue.needs_weekly_consolidation;
    lines.push(`- 周凝练: ${needs ? "⚠️ 需要" : "✅ 已完成"} (${wy}-W${wn})`);
  }
  const monthEnd = (result as any).month_end as Record<string, unknown> | undefined;
  if (monthEnd) {
    lines.push(
      `- 月末: ${monthEnd.is_month_end ? "⚠️ 是" : "否"}`
      + ` (${monthEnd.month_year}-${monthEnd.month_num})`,
    );
  }
  const yearEnd = (result as any).year_end as Record<string, unknown> | undefined;
  if (yearEnd) {
    lines.push(`- 年末: ${yearEnd.is_year_end ? "⚠️ 是" : "否"}`);
  }

  // 蜜雪/金雪
  const honey = (result as any).honey_snow as number | undefined;
  const gold = (result as any).gold_snow as number | undefined;
  if (honey !== undefined) lines.push(`- 蜜雪: ${honey}`);
  if (gold !== undefined) lines.push(`- 金雪: ${gold}`);

  return lines.join("\n");
}

// ── 周期凝练模板描述 ─────────────────────────────────────────────────

function executeConsolidationScript(
  workspaceDir: string,
  type: "weekly" | "monthly" | "yearly",
  reason: string,
): string {
  // 执行 check-full.sh 获取状态数据
  const fullJson = executeCheckScript(workspaceDir, "check-full.sh", "full", reason);
  if (fullJson.startsWith("❌")) return fullJson;

  const fullResult = extractJsonFromOutput(fullJson);
  if (!fullResult) return "无法解析 check-full.sh 输出";

  // 根据类型构建对应协议
  let protocolText = "";
  switch (type) {
    case "weekly":
      protocolText = buildWeeklyProtocol(fullResult, workspaceDir);
      if (!protocolText) return "周凝练条件不满足（非周末或文件已存在）";
      break;
    case "monthly":
      protocolText = buildMonthlyProtocol(fullResult, workspaceDir, undefined, true);
      if (!protocolText) return "月凝练条件不满足（检查月末状态和文件状态）";
      break;
    case "yearly":
      protocolText = buildYearlyProtocol(fullResult, workspaceDir, undefined, true);
      if (!protocolText) return "年凝练条件不满足（检查年末状态和文件状态）";
      break;
  }

  return protocolText;
}

/**
 * 从 check 脚本文本输出中提取 JSON 对象
 */
function extractJsonFromOutput(output: string): Record<string, unknown> | null {
  const m = output.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ── 睡意查询 ──────────────────────────────────────────────────────────

function querySleepiness(workspaceDir: string): string {
  const eodPath = path.join(workspaceDir, LAST_EOD_FILE);
  let hoursSinceLastEod = -1;
  let lastEodTimeStr = "未知";
  let lastEodTimestamp = 0;

  if (fs.existsSync(eodPath)) {
    try {
      const raw = fs.readFileSync(eodPath, "utf-8");
      const parsed = JSON.parse(raw) as { last_eod_time?: number; updated_at?: string };
      if (parsed.last_eod_time) {
        lastEodTimestamp = parsed.last_eod_time;
        hoursSinceLastEod = (Date.now() - parsed.last_eod_time) / (1000 * 60 * 60);
        lastEodTimeStr = new Date(parsed.last_eod_time).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        });
      }
    } catch { /* 忽略解析错误 */ }
  }

  // 计算睡意分数
  const config = loadSleepinessConfig(workspaceDir);
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeOfDay = hour + minute / 60;

  // 生物周期因子
  let circadian: number;
  if (timeOfDay >= 22 || timeOfDay < 6) circadian = 1.0;
  else if (timeOfDay >= 6 && timeOfDay < 10) circadian = 1.0 - (timeOfDay - 6) * 0.2;
  else if (timeOfDay >= 10 && timeOfDay < 18) circadian = 0.1;
  else circadian = 0.2 + (timeOfDay - 18) * 0.2;

  // 运行时间因子
  let uptime: number;
  if (hoursSinceLastEod < 2) uptime = 0;
  else if (hoursSinceLastEod < 8) uptime = (hoursSinceLastEod - 2) / 6 * 0.5;
  else if (hoursSinceLastEod < 16) uptime = 0.5 + (hoursSinceLastEod - 8) / 8 * 0.3;
  else uptime = Math.min(1.0, 0.8 + (hoursSinceLastEod - 16) / 24 * 0.2);

  // 记忆储量因子（从 EXTRA 目录计算，与 heartbeat.ts 一致）
  let memoryLoad = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const bp = getExtraBasePath();
    const extraPath = path.join(bp, today.slice(0, 4), today.slice(5, 7), today);
    if (fs.existsSync(extraPath)) {
      const files = fs.readdirSync(extraPath);
      let totalSize = 0;
      for (const f of files) {
        try { totalSize += fs.statSync(path.join(extraPath, f)).size; } catch {}
      }
      const totalKB = totalSize / 1024;
      if (totalKB < 50) memoryLoad = 0;
      else if (totalKB < 200) memoryLoad = (totalKB - 50) / 150 * 0.5;
      else if (totalKB < 500) memoryLoad = 0.5 + (totalKB - 200) / 300 * 0.3;
      else memoryLoad = Math.min(1.0, 0.8 + (totalKB - 500) / 1000 * 0.2);
    }
  } catch { /* 忽略 */ }

  const score = Math.min(1.0,
    config.weights.circadian * circadian +
    config.weights.uptime * uptime +
    config.weights.memoryLoad * memoryLoad,
  );

  // 确定睡意等级
  let level = "awake";
  let emoji = "😊";
  for (const t of config.thresholds) {
    if (score <= t.maxScore) {
      level = t.level;
      emoji = t.emoji;
      break;
    }
  }

  const lines: string[] = [];
  lines.push(`😴 睡意状态查询`);
  lines.push("");
  lines.push(`**当前等级**: ${emoji} ${level}`);
  lines.push(`**睡意分数**: ${(score * 100).toFixed(1)}/100`);
  lines.push(`**距上次日终**: ${hoursSinceLastEod >= 0 ? hoursSinceLastEod.toFixed(1) + " 小时" : "未知（无记录）"}`);
  if (lastEodTimeStr !== "未知") {
    lines.push(`**上次日终时间**: ${lastEodTimeStr}`);
  }
  lines.push("");
  lines.push("**因子分解**:");
  lines.push(`- 生物周期 (${(config.weights.circadian * 100).toFixed(0)}%): ${(circadian * 100).toFixed(1)}/100`);
  lines.push(`- 运行时间 (${(config.weights.uptime * 100).toFixed(0)}%): ${(uptime * 100).toFixed(1)}/100`);
  lines.push(`- 记忆储量 (${(config.weights.memoryLoad * 100).toFixed(0)}%): ${(memoryLoad * 100).toFixed(1)}/100`);
  lines.push("");
  lines.push("**阈值参考**:");
  for (const t of config.thresholds) {
    lines.push(`- ${t.emoji} ${t.level}: score ≤ ${(t.maxScore * 100).toFixed(0)}`);
  }

  // 推荐动作
  lines.push("");
  if (level === "dreaming" || level === "exhausted") {
    lines.push("⚠️ **强烈建议立即执行日终 (full 协议)**");
  } else if (level === "sleepy") {
    lines.push("💡 建议在本次对话中执行日终");
  } else if (level === "drowsy") {
    lines.push("💡 可以准备日终，也可以继续对话");
  } else {
    lines.push("✅ 状态良好，无需日终");
  }

  return lines.join("\n");
}

// ── L2 状态检查 ───────────────────────────────────────────────────────

function checkL2Status(workspaceDir: string): string {
  const today = getTodayStr();
  const l2Path = path.join(workspaceDir, "memory", `${today}.md`);
  const exists = fs.existsSync(l2Path);

  const lines: string[] = [];
  lines.push(`📄 今日 L2 状态`);
  lines.push("");
  lines.push(`**日期**: ${today}`);
  lines.push(`**文件**: ${l2Path}`);
  lines.push(`**状态**: ${exists ? "✅ 已存在" : "❌ 不存在"}`);

  if (exists) {
    try {
      const stat = fs.statSync(l2Path);
      const content = fs.readFileSync(l2Path, "utf-8");
      const lineCount = content.split("\n").length;
      lines.push(`**大小**: ${stat.size} 字节`);
      lines.push(`**行数**: ${lineCount} 行`);
      lines.push(`**创建时间**: ${stat.birthtime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
      lines.push(`**最后修改**: ${stat.mtime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);

      // 检查是否为空框架
      const trimmed = content.trim();
      if (trimmed.length < 100 || content.includes("（待填充）")) {
        lines.push("");
        lines.push("⚠️ L2 文件可能是空框架，建议填充实际内容。");
      }
    } catch (err) {
      lines.push(`**读取错误**: ${String(err)}`);
    }
  } else {
    lines.push("");
    lines.push("💡 执行 `create_l2` 协议不会自动创建 L2——创建由心跳系统的 `createEmptyL2` 函数处理。");
    lines.push("   如确需手动创建，请使用 file_write 工具创建文件。");
  }

  return lines.join("\n");
}

// ── 状态更新 ──────────────────────────────────────────────────────────

function updateState(protocol: ProtocolType, workspaceDir: string): void {
  const heartbeatDir = path.join(workspaceDir, "memory", ".heartbeat");

  // 确保目录存在
  if (!fs.existsSync(heartbeatDir)) {
    try { fs.mkdirSync(heartbeatDir, { recursive: true }); } catch { /* ignore */ }
  }

  switch (protocol) {
    case "full": {
      const eodPath = path.join(workspaceDir, LAST_EOD_FILE);
      try {
        // 原子写入：先写临时文件，再 rename
        const tmpPath = eodPath + ".tmp";
        fs.writeFileSync(tmpPath, JSON.stringify({
          last_eod_time: Date.now(),
          updated_at: new Date().toISOString(),
        }, null, 2), "utf-8");
        fs.renameSync(tmpPath, eodPath);
        log.info("✅ last-eod.json 已更新");
        logInfo("eod", "step_done", "last-eod.json 已更新", { step: "last-eod" });
      } catch (err) {
        log.warn("last-eod.json 更新失败", { error: String(err) });
      }
      break;
    }

    case "medium": {
      const medPath = path.join(workspaceDir, LAST_MEDIUM_FILE);
      try {
        fs.writeFileSync(
          medPath,
          JSON.stringify({
            check_time: new Date().toISOString(),
            check_type: "medium",
            triggered_by: "execute_protocol",
          }, null, 2),
          "utf-8",
        );
        log.info("✅ last-medium.json 已更新");
      } catch (err) {
        log.warn("last-medium.json 更新失败", { error: String(err) });
      }
      break;
    }

    // weekly/monthly/yearly/sleepiness_query/create_l2 不需要更新状态文件
    default:
      break;
  }
}
