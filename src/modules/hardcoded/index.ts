// ───────────────────────────────────────────────────────────────────────
// Hardcoded 模块 — 钉死规则执行（段4实现）
// 从 before-prompt-build.ts 提取的硬编码自动化函数
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createLogger } from "../../utils/logger.js";
import { getTodayStrShort } from "../../utils/date.js";
import { getCheckScriptsPath } from "../../utils/sleepiness-config.js";

// ── 超时常量 ───────────────────────────────────────────────

const SCRIPT_UPDATE_TIMEOUT = 30000;  // ms
const DEFAULT_EXEC_TIMEOUT = 15000;   // ms

const log = createLogger("module:hardcoded");
const execAsync = promisify(exec);

// ── 心跳日志类型 ───────────────────────────────────────────────────────

export type HeartbeatLogEntry = {
  timestamp: string;
  checkType: "light" | "medium" | "full";
  trigger: string;
  actions: string[];
  results: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
};

// ── 公开 API ───────────────────────────────────────────────────────────

/**
 * 更新 SESSION-STATE Light 心跳状态行
 * 替换 | Light | ... | ... | 行为当前时间戳
 */
export async function updateSessionState(
  workspaceDir: string,
  reason: string,
): Promise<void> {
  const stateFile = path.join(workspaceDir, "SESSION-STATE.md");
  const timestamp = new Date()
    .toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    .replace(/\//g, "-");

  try {
    if (!fs.existsSync(stateFile)) {
      log.warn("SESSION-STATE 不存在，跳过更新");
      return;
    }

    let content = fs.readFileSync(stateFile, "utf-8");

    // 尝试替换 Light 行
    const lightLine = `| Light | ${timestamp} | ✅ 已执行（${reason}） |`;
    const replaced = content.replace(
      /\| Light \| [^\|]* \| [^\|]* \|/,
      lightLine,
    );

    if (replaced !== content) {
      fs.writeFileSync(stateFile, replaced, "utf-8");
      log.info("✅ SESSION-STATE Light 行已更新", { timestamp, reason });
    } else {
      log.warn("SESSION-STATE 中未找到 Light 行，跳过更新");
    }
  } catch (err) {
    log.warn("SESSION-STATE 更新失败", { error: String(err) });
  }
}

/**
 * 执行 INDEX更新脚本（路径从 sleepiness 配置读取）
 */
export async function updateIndex(workspaceDir: string): Promise<void> {
  const scriptsPath = getCheckScriptsPath(workspaceDir);
  const updateScript = path.join(workspaceDir, scriptsPath, "update-index.sh");

  try {
    if (!fs.existsSync(updateScript)) {
      log.warn("update-index.sh 不存在，跳过 INDEX更新", { path: updateScript });
      return;
    }

    log.info("📝 执行 INDEX更新（心跳驱动）");
    await execAsync(`bash "${updateScript}"`, { timeout: 30000 });
    log.info("✅ INDEX更新完成");
  } catch (err) {
    log.warn("⚠️ INDEX更新失败", { error: String(err) });
  }
}

/**
 * 写入心跳日志到文件
 * 日志路径: {workspaceDir}/skills/soul-protocol/logs/heartbeat-YYYYMMDD.log
 * 追加写入，不阻断主流程
 */
export function writeHeartbeatLog(
  workspaceDir: string,
  entry: HeartbeatLogEntry,
): void {
  try {
    const logsDir = path.join(workspaceDir, "skills", "soul-protocol", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 统一日志文件名（与插件日志合并）
    const logFile = path.join(logsDir, `soul-protocol-${getTodayStrShort()}.log`);

    // 统一格式：添加 module 字段标识心跳
    const unifiedEntry = {
      ...entry,
      module: "heartbeat",
    };
    const line = JSON.stringify(unifiedEntry) + "\n";
    fs.appendFileSync(logFile, line, "utf-8");
  } catch (err) {
    log.error("心跳日志写入失败", { error: String(err) });
  }
}

/**
 * 清理过期日志文件
 * 检查 logs 目录，删除超过 maxDays 天的 .log 文件
 * 在启动或日终执行
 */
export function cleanupOldLogs(workspaceDir: string, maxDays: number = 7): void {
  const logsDir = path.join(workspaceDir, "skills", "soul-protocol", "logs");
  if (!fs.existsSync(logsDir)) return;

  const now = Date.now();
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log"));
  for (const file of files) {
    const filePath = path.join(logsDir, file);
    const stat = fs.statSync(filePath);
    const ageDays = Math.floor((now - stat.mtimeMs) / (24 * 60 * 60 * 1000));
    if (ageDays > maxDays) {
      fs.unlinkSync(filePath);
      log.info("清理过期日志", { file, ageDays });
    }
  }
}

/**
 * 执行检查脚本并自动记录心跳日志
 * 包装 executeCheckScript，增加耗时测量和日志写入
 */
export async function executeCheckScriptWithLog(
  workspaceDir: string,
  scriptName: string,
  checkType: "light" | "medium" | "full",
  trigger: string,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const result = await executeCheckScript(workspaceDir, scriptName);
  const durationMs = Date.now() - startTime;

  writeHeartbeatLog(workspaceDir, {
    timestamp: new Date().toISOString(),
    checkType,
    trigger,
    actions: extractActions(result),
    results: result,
    durationMs,
    success: Object.keys(result).length > 0,
  });

  return result;
}

// ── 内部工具函数 ───────────────────────────────────────────────────────

/**
 * 执行检查脚本
 * 脚本输出 JSON → 解析为对象
 */
async function executeCheckScript(
  workspaceDir: string,
  scriptName: string,
): Promise<Record<string, unknown>> {
  const scriptsPath = getCheckScriptsPath(workspaceDir);
  const scriptPath = path.join(workspaceDir, scriptsPath, scriptName);

  try {
    if (!fs.existsSync(scriptPath)) {
      log.warn("检查脚本不存在", { script: scriptPath });
      return { required_actions: [] };
    }

    const { stdout } = await execAsync(`bash "${scriptPath}"`, {
      timeout: 15000,
      maxBuffer: 1024 * 1024, // 1MB
    });

    // 正则提取 JSON（check-full.sh 可能输出非 JSON 尾随内容）
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn("检查脚本输出中未找到 JSON", { script: scriptName });
      return { required_actions: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    log.info("检查脚本执行成功", {
      script: scriptName,
      checkType: (parsed as any).check_type,
      actionCount: ((parsed as any).required_actions as any[])?.length ?? 0,
    });
    return parsed;
  } catch (err) {
    log.warn("检查脚本执行失败", { script: scriptName, error: String(err) });
    return { required_actions: [] };
  }
}

/**
 * 从脚本返回结果中提取 actions 字符串列表
 */
function extractActions(results: Record<string, unknown>): string[] {
  const actions: string[] = [];

  // 从 required_actions 数组提取
  const ra = results.required_actions as
    | Array<{ action?: string; reason?: string }>
    | undefined;
  if (Array.isArray(ra)) {
    for (const a of ra) {
      actions.push(a.action || "unknown");
    }
  }

  // 从 action 对象提取（check-full.sh 返回格式）
  const ao = results.action as { action?: string } | undefined;
  if (ao?.action && !actions.includes(ao.action)) {
    actions.push(ao.action);
  }

  return actions;
}

// ── Monitor 模块导出（段7） ────────────────────────────────────────────

export {
  collectStats,
  writeStatsReport,
  collectMultiDayStats,
} from "../../monitor/stats-collector.js";
export type { StatsData } from "../../monitor/stats-collector.js";

export {
  checkModuleHealth,
  formatHealthReport,
  writeHealthReport,
} from "../../monitor/health-check.js";
export type { HealthReport, HealthDetail } from "../../monitor/health-check.js";
