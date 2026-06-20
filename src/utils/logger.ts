// ───────────────────────────────────────────────────────────────────────
// 日志工具 — 统一日志格式，支持级别过滤 + 文件持久化
// 日志路径: skills/soul-protocol/logs/soul-protocol-YYYYMMDD.log
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { getTodayStrShort } from "./date.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface SoulLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  setLevel: (level: LogLevel) => void;
}

export interface LoggerOptions {
  prefix: string;
  minLevel?: LogLevel;
  workspaceDir?: string;  // 可选：启用文件日志
}

/**
 * 创建日志器
 * @param options.prefix 模块前缀
 * @param options.minLevel 最小日志级别
 * @param options.workspaceDir 可选，启用文件持久化
 */
export function createLogger(options: LoggerOptions | string): SoulLogger {
  // 兼容旧调用方式：createLogger(prefix, minLevel)
  const opts: LoggerOptions = typeof options === "string"
    ? { prefix: options, minLevel: "info" }
    : options;
  
  const { prefix, minLevel = "info", workspaceDir } = opts;
  const tag = `[soul-protocol:${prefix}]`;

  // 文件日志路径（如果启用）
  let logFile: string | null = null;
  if (workspaceDir) {
    const logsDir = path.join(workspaceDir, "skills", "soul-protocol", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFile = path.join(logsDir, `soul-protocol-${getTodayStrShort()}.log`);
  }

  let currentMinLevel = minLevel;

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentMinLevel]) return;

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const line = `${timestamp} ${level.toUpperCase()} ${tag} ${message}${metaStr}`;

    // 输出到 console
    switch (level) {
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
    }

    // 同时写入文件（如果启用）
    if (logFile) {
      const entry = { timestamp, level, module: prefix, message, meta };
      fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
    }
  }

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
    setLevel: (level: LogLevel) => {
      currentMinLevel = level;
    },
  };
}

/** 拦截日志 — 专门记录安全拦截事件 */
export function logInterception(
  logger: SoulLogger,
  ruleId: string,
  action: string,
  toolName: string,
  params: Record<string, unknown>,
  reason: string,
): void {
  logger.warn("⚠️ 安全拦截", {
    ruleId,
    action,
    tool: toolName,
    reason,
    paramsPreview: truncateParams(params),
  });
}

/** 验证日志 — 记录验证结果 */
export function logValidation(
  logger: SoulLogger,
  check: string,
  passed: boolean,
  detail?: string,
): void {
  const icon = passed ? "✅" : "❌";
  const level = passed ? "info" : "warn";
  logger[level](`${icon} 验证${passed ? "通过" : "失败"}: ${check}`, { detail });
}

function truncateParams(params: Record<string, unknown>, maxLen = 100): string {
  const str = JSON.stringify(params);
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}