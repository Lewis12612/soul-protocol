// ───────────────────────────────────────────────────────────────────────
// 结构化日志系统 — JSONL 格式，统一写入 plugin.log
//
// 日志路径: {workspaceDir}/memory/.heartbeat/logs/plugin.log
// 归档目录: {workspaceDir}/memory/.heartbeat/logs/archive/
// 自动轮转: >10MB → archive/plugin-{timestamp}.log
//
// 日志格式（JSONL）:
//   {"ts":"ISO8601","mod":"模块名","evt":"事件类型","lvl":"info|warn|error|debug","msg":"人类可读摘要","ctx":{}}
//
// 模块标签: heartbeat | watchdog | eod | protocol | spawn | state | health
// 事件类型: injected | executed | step_done | step_fail | skipped | timeout | retry | error | health_check | state_change
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import type { LoggingConfig, SleepinessConfig } from "./sleepiness-config.js";

// ── 类型 ────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogModule =
  | "heartbeat"
  | "watchdog"
  | "eod"
  | "protocol"
  | "spawn"
  | "state"
  | "health"
  | "safety";

export type LogEvent =
  | "injected"
  | "executed"
  | "confirmed"
  | "intercepted"
  | "step_done"
  | "step_fail"
  | "skipped"
  | "timeout"
  | "retry"
  | "error"
  | "health_check"
  | "state_change";

export interface LogEntry {
  ts: string;
  mod: LogModule;
  evt: LogEvent;
  lvl: LogLevel;
  msg: string;
  ctx?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── 内部状态 ────────────────────────────────────────────────────────────

let _workspaceDir: string | null = null;
let _minLevel: LogLevel = "info";
let _initialized = false;

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// ── 初始化 ──────────────────────────────────────────────────────────────

/**
 * 初始化日志系统。
 * 确保日志目录存在，设置工作目录和日志级别。
 *
 * @param workspaceDir 工作目录（用于定位 memory/.heartbeat/logs/）
 * @param logLevel 最小日志级别（从 config/sleepiness.json 读取，默认 "info"）
 */
export function logInit(
  workspaceDir: string,
  logLevel?: LogLevel,
): void {
  _workspaceDir = workspaceDir;
  if (logLevel) _minLevel = logLevel;

  const logsDir = path.join(workspaceDir, "memory", ".heartbeat", "logs");
  const archiveDir = path.join(logsDir, "archive");

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
  } catch {
    // 静默降级：日志目录创建失败不影响主流程
  }

  _initialized = true;
}

/**
 * 从 sleepiness 配置初始化日志系统（含剪枝配置）。
 *
 * @param workspaceDir 工作目录
 * @param config 睡意配置对象（读取 logging 段）
 */
export function logInitFromConfig(
  workspaceDir: string,
  config: SleepinessConfig,
): void {
  const logCfg: Partial<LoggingConfig> = config.logging || {};
  const level = (logCfg.logLevel as LogLevel) || "info";
  logInit(workspaceDir, level);
  if (logCfg.pruning) {
    setPruneConfig(logCfg.pruning);
  }
}

/**
 * 运行时更新日志级别（不重新初始化目录）。
 */
export function setLogLevel(level: LogLevel): void {
  _minLevel = level;
}

// ── 核心写入函数 ────────────────────────────────────────────────────────

/**
 * 写入一条日志事件。
 *
 * @param mod   模块标签
 * @param evt   事件类型
 * @param lvl   日志级别
 * @param msg   人类可读摘要
 * @param ctx   可选上下文（不应包含敏感信息）
 */
export function logEvent(
  mod: LogModule,
  evt: LogEvent,
  lvl: LogLevel,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  // 级别过滤
  if (!_initialized) return;
  if (LEVEL_ORDER[lvl] < LEVEL_ORDER[_minLevel]) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    mod,
    evt,
    lvl,
    msg,
  };
  if (ctx && Object.keys(ctx).length > 0) {
    entry.ctx = sanitizeContext(ctx);
  }

  const line = JSON.stringify(entry) + "\n";

  // 写入文件
  try {
    const logFile = getLogPath();
    fs.appendFileSync(logFile, line, "utf-8");

    // 检查是否需要轮转
    checkRotate(logFile);
  } catch {
    // 静默降级：日志写入失败不影响主流程
  }
}

// ── 便捷函数 ────────────────────────────────────────────────────────────

export function logInfo(
  mod: LogModule,
  evt: LogEvent,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  logEvent(mod, evt, "info", msg, ctx);
}

export function logWarn(
  mod: LogModule,
  evt: LogEvent,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  logEvent(mod, evt, "warn", msg, ctx);
}

export function logError(
  mod: LogModule,
  evt: LogEvent,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  logEvent(mod, evt, "error", msg, ctx);
}

export function logDebug(
  mod: LogModule,
  evt: LogEvent,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  logEvent(mod, evt, "debug", msg, ctx);
}

// ── 内部辅助 ────────────────────────────────────────────────────────────

function getLogPath(): string {
  if (!_workspaceDir) {
    throw new Error("logger not initialized: call logInit() first");
  }
  return path.join(_workspaceDir, "memory", ".heartbeat", "logs", "plugin.log");
}

/** 检查日志文件大小，超过 10MB 自动轮转 */
function checkRotate(logFile: string): void {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > MAX_LOG_SIZE) {
      rotateLog(logFile);
    }
  } catch {
    // 文件不存在或无法 stat → 忽略
  }
}

/** 将当前日志文件移动到归档目录，同时触发剪枝 */
function rotateLog(logFile: string): void {
  if (!_workspaceDir) return;

  const archiveDir = path.join(_workspaceDir, "memory", ".heartbeat", "logs", "archive");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archiveName = `plugin-${ts}.log`;
  const archivePath = path.join(archiveDir, archiveName);

  try {
    fs.renameSync(logFile, archivePath);
    // 轮转后触发剪枝
    pruneArchives(archiveDir);
  } catch {
    // 轮转失败静默降级
  }
}

// ── 剪枝 ────────────────────────────────────────────────────────────────

interface PruneConfig {
  enabled: boolean;
  retentionDays: number;
  maxArchiveFiles: number;
}

let _pruneConfig: PruneConfig = { enabled: true, retentionDays: 30, maxArchiveFiles: 50 };

/** 设置剪枝配置（从 sleepiness.json 读取） */
export function setPruneConfig(config: Partial<PruneConfig>): void {
  if (config.enabled !== undefined) _pruneConfig.enabled = config.enabled;
  if (config.retentionDays !== undefined) _pruneConfig.retentionDays = config.retentionDays;
  if (config.maxArchiveFiles !== undefined) _pruneConfig.maxArchiveFiles = config.maxArchiveFiles;
}

/** 剪枝归档目录：过期/超量文件（pruning.enabled=false 时跳过） */
function pruneArchives(archiveDir: string): void {
  if (!_pruneConfig.enabled) return;

  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.startsWith("plugin-") && f.endsWith(".log"))
      .map(f => ({
        name: f,
        path: path.join(archiveDir, f),
        mtime: fs.statSync(path.join(archiveDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // 最新在前

    const cutoff = Date.now() - _pruneConfig.retentionDays * 24 * 60 * 60 * 1000;

    let deleted = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // 条件1：超期删除
      if (f.mtime < cutoff) {
        try { fs.unlinkSync(f.path); deleted++; } catch {}
        continue;
      }
      // 条件2：超量删除（保留最新 N 个）
      if (i >= _pruneConfig.maxArchiveFiles) {
        try { fs.unlinkSync(f.path); deleted++; } catch {}
      }
    }

    if (deleted > 0) {
      // 剪枝本身不写日志（避免递归），仅静默清理
    }
  } catch {
    // 剪枝失败不影响主流程
  }
}

/** 清除上下文中的敏感字段（密码、token 等） */
function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    /password/i, /token/i, /secret/i, /api[_-]?key/i,
    /credential/i, /auth/i,
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    const isSensitive = sensitiveKeys.some((re) => re.test(key));
    if (isSensitive) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── 兼容旧 API ──────────────────────────────────────────────────────────

// 保留旧的 createLogger 接口以兼容现有代码（heartbeat.ts、before-prompt-build.ts 等）
// 新的 logEvent/logInfo 等函数是主力 API

export interface SoulLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  setLevel: (level: LogLevel) => void;
}

/** 创建兼容旧接口的日志器（内部桥接到新 JSONL 日志） */
export function createLogger(prefix: string): SoulLogger {
  // 从 prefix 中提取模块名（如 "module:heartbeat" → "heartbeat"）
  const mod = extractModuleFromPrefix(prefix) as LogModule;

  let currentMinLevel: LogLevel = "info";

  function log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    // console 输出（保留）
    const timestamp = new Date().toISOString();
    const tag = `[soul-protocol:${prefix}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const line = `${timestamp} ${level.toUpperCase()} ${tag} ${message}${metaStr}`;

    switch (level) {
      case "debug": console.debug(line); break;
      case "info": console.info(line); break;
      case "warn": console.warn(line); break;
      case "error": console.error(line); break;
    }

    // JSONL 文件日志
    if (_initialized) {
      const eventType = inferEventFromMessage(message);
      logEvent(mod, eventType, level, message, meta);
    }
  }

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    setLevel: (level: LogLevel) => {
      currentMinLevel = level;
    },
  };
}

function extractModuleFromPrefix(prefix: string): string {
  // "module:heartbeat" → "heartbeat"
  // "hook:before-prompt-build" → "eod"
  // "tool:execute-protocol" → "protocol"
  // "soul-protocol" → "heartbeat"
  if (prefix.includes("heartbeat")) return "heartbeat";
  if (prefix.includes("execute-protocol") || prefix.includes("protocol")) return "protocol";
  if (prefix.includes("prompt-build")) return "eod";
  if (prefix.includes("tool-call")) return "health";
  if (prefix.includes("module")) {
    const parts = prefix.split(":");
    return parts[parts.length - 1] || "heartbeat";
  }
  return "heartbeat";
}

function inferEventFromMessage(msg: string): LogEvent {
  if (msg.includes("注入") || msg.includes("injected")) return "injected";
  if (msg.includes("执行") || msg.includes("executed") || msg.includes("完成")) return "executed";
  if (msg.includes("失败") || msg.includes("fail")) return "step_fail";
  if (msg.includes("跳过") || msg.includes("skip")) return "skipped";
  if (msg.includes("超时") || msg.includes("timeout")) return "timeout";
  if (msg.includes("重试") || msg.includes("retry")) return "retry";
  if (msg.includes("错误") || msg.includes("Error") || msg.includes("❌")) return "error";
  if (msg.includes("检查") || msg.includes("health")) return "health_check";
  if (msg.includes("状态") || msg.includes("state")) return "state_change";
  return "executed";
}
