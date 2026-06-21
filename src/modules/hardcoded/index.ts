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

// ── SESSION-STATE 管理（V3.8.8-beta3：工作记忆系统升级） ────────────

/** 生成时间戳字符串（Asia/Shanghai, yyyy-MM-dd HH:mm:ss） */
function formatTimestamp(): string {
  return new Date()
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
}

/**
 * 确保 SESSION-STATE.md 存在
 * - 不存在 → 从模板创建，填充初始变量
 * - 存在但缺少标记段 → 追加标记段（模板升级兼容）
 * - 存在且标记完整 → 无操作
 */
export function ensureSessionState(workspaceDir: string): void {
  const stateFile = path.join(workspaceDir, "SESSION-STATE.md");
  const templatePath = path.join(
    workspaceDir,
    "skills",
    "soul-protocol",
    "templates",
    "archive",
    "session-state-template.md",
  );

  try {
    if (!fs.existsSync(stateFile)) {
      // 从模板创建
      const template = fs.existsSync(templatePath)
        ? fs.readFileSync(templatePath, "utf-8")
        : null;

      if (!template) {
        log.warn("SESSION-STATE 模板不存在，无法创建", { templatePath });
        return;
      }

      const now = formatTimestamp();
      const isoNow = new Date().toISOString();
      const content = template
        .replace(/\{\{light_time\}\}/g, now)
        .replace(/\{\{medium_time\}\}/g, "未执行")
        .replace(/\{\{full_time\}\}/g, "未执行")
        .replace(/\{\{last_light\}\}/g, isoNow)
        .replace(/\{\{last_medium\}\}/g, "");

      fs.writeFileSync(stateFile, content, "utf-8");
      log.info("✅ SESSION-STATE.md 已从模板创建");
      return;
    }

    // 文件已存在：检查是否有标记段
    let content = fs.readFileSync(stateFile, "utf-8");

    if (!content.includes("<!-- HEARTBEAT_MARKERS_START -->")) {
      // 模板可能过时，追加标记段
      log.info("SESSION-STATE 缺少标记段，追加中...");
      const isoNow = new Date().toISOString();
      const markerSection = [
        "",
        "## ⚠️ 心跳标记",
        "_以下由插件自动写入，LLM 无需编辑_",
        "",
        "<!-- HEARTBEAT_MARKERS_START -->",
        "| 标记 | 值 |",
        "|------|-----|",
        `| last_light | ${isoNow} |`,
        "| last_medium |  |",
        "| protocol_turn_pending | false |",
        "<!-- HEARTBEAT_MARKERS_END -->",
      ].join("\n");

      // 检查是否已有「心跳标记」标题（旧格式）
      if (content.includes("心跳标记")) {
        // 已有标题但缺少 HTML 注释标记，替换旧标记段
        content = content.replace(
          /## ⚠️ 心跳标记[\s\S]*$/,
          markerSection,
        );
      } else {
        content = content.trimEnd() + "\n" + markerSection + "\n";
      }

      fs.writeFileSync(stateFile, content, "utf-8");
      log.info("✅ SESSION-STATE 标记段已追加");
    }
  } catch (err) {
    log.warn("ensureSessionState 失败", { error: String(err) });
  }
}

/**
 * 更新 Light 心跳状态（Light 协议专用）
 * - 更新心跳状态表中的 Light 行
 * - 更新标记段中的 last_light
 */
export function updateSessionStateLight(
  workspaceDir: string,
  reason: string,
): void {
  ensureSessionState(workspaceDir);
  const stateFile = path.join(workspaceDir, "SESSION-STATE.md");

  try {
    let content = fs.readFileSync(stateFile, "utf-8");
    const now = formatTimestamp();

    // 更新心跳状态表中的 Light 行
    const lightLine = `| Light | ${now} | ✅ 已执行（${reason}） |`;
    const replaced1 = content.replace(
      /\| Light \| [^\n]*\|/,
      lightLine,
    );

    if (replaced1 !== content) {
      content = replaced1;
      log.info("SESSION-STATE Light 行已更新", { timestamp: now, reason });
    } else {
      log.warn("SESSION-STATE 中未找到 Light 行");
    }

    // 更新标记段中的 last_light
    const isoNow = new Date().toISOString();
    const replaced2 = content.replace(
      /\| last_light \| [^\n]*\|/,
      `| last_light | ${isoNow} |`,
    );

    if (replaced2 !== content) {
      content = replaced2;
    }

    fs.writeFileSync(stateFile, content, "utf-8");
  } catch (err) {
    log.warn("updateSessionStateLight 失败", { error: String(err) });
  }
}

/**
 * 更新 Medium 心跳状态（Medium 协议专用）
 * - 更新心跳状态表中的 Medium 行
 * - 更新标记段中的 last_medium
 */
export function updateSessionStateMedium(
  workspaceDir: string,
  reason: string,
): void {
  ensureSessionState(workspaceDir);
  const stateFile = path.join(workspaceDir, "SESSION-STATE.md");

  try {
    let content = fs.readFileSync(stateFile, "utf-8");
    const now = formatTimestamp();

    // 更新心跳状态表中的 Medium 行
    const mediumLine = `| Medium | ${now} | ✅ 已执行（${reason}） |`;
    const replaced1 = content.replace(
      /\| Medium \| [^\n]*\|/,
      mediumLine,
    );

    if (replaced1 !== content) {
      content = replaced1;
      log.info("SESSION-STATE Medium 行已更新", { timestamp: now, reason });
    } else {
      log.warn("SESSION-STATE 中未找到 Medium 行");
    }

    // 更新标记段中的 last_medium
    const isoNow = new Date().toISOString();
    const replaced2 = content.replace(
      /\| last_medium \| [^\n]*\|/,
      `| last_medium | ${isoNow} |`,
    );

    if (replaced2 !== content) {
      content = replaced2;
    }

    fs.writeFileSync(stateFile, content, "utf-8");
  } catch (err) {
    log.warn("updateSessionStateMedium 失败", { error: String(err) });
  }
}

/**
 * @deprecated 使用 updateSessionStateLight / updateSessionStateMedium 代替
 * 保留以兼容旧调用方
 */
export async function updateSessionState(
  workspaceDir: string,
  reason: string,
): Promise<void> {
  updateSessionStateLight(workspaceDir, reason);
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
