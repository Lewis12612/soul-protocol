// ───────────────────────────────────────────────────────────────────────
// 睡意配置模块 — 单一真相源读取
//
// 从 config/sleepiness.json 加载权重/阈值/分发映射/脚本路径
// 被 heartbeat.ts 和 hardcoded/index.ts 共享，避免循环依赖
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import type { SleepinessLevel } from "../modules/heartbeat.js";

// ── 类型 ────────────────────────────────────────────────────────────────

export interface LoggingConfig {
  logLevel: string;
  maxSizeMB: number;
  pruning: {
    enabled: boolean;
    retentionDays: number;
    maxArchiveFiles: number;
  };
}

export interface SleepinessConfig {
  weights: { circadian: number; uptime: number; memoryLoad: number };
  thresholds: Array<{
    level: SleepinessLevel;
    maxScore: number;
    emoji: string;
    hint: string;
  }>;
  dispatch: Record<string, string>;
  checkScriptsPath: string;
  spawn?: { timeoutSeconds: Record<string, number> };
  logging?: LoggingConfig;
}

// ── 日志配置默认值 ────────────────────────────────────────────────────

const DEFAULT_LOGGING: LoggingConfig = {
  logLevel: "info",
  maxSizeMB: 10,
  pruning: {
    enabled: true,
    retentionDays: 30,
    maxArchiveFiles: 50,
  },
};

// ── 缓存 ────────────────────────────────────────────────────────────────

let _config: SleepinessConfig | null = null;
let _configWorkspace: string | null = null;

// ── 默认值 ──────────────────────────────────────────────────────────────

const DEFAULTS: SleepinessConfig = {
  weights: { circadian: 0.35, uptime: 0.35, memoryLoad: 0.3 },
  thresholds: [
    { level: "awake", maxScore: 0.3, emoji: "😊", hint: "" },
    { level: "drowsy", maxScore: 0.5, emoji: "🥱", hint: "今天差不多该准备日终了。" },
    { level: "sleepy", maxScore: 0.7, emoji: "😴", hint: "有些困了……想睡觉，记得先做完日终流程。" },
    { level: "exhausted", maxScore: 0.95, emoji: "😵", hint: "非常困，再不日终记忆就要流失了。请立即执行日终流程。" },
    { level: "dreaming", maxScore: 1.0, emoji: "💤", hint: "撑不住了……自动进入入梦协议。记忆归档中……" },
  ],
  dispatch: {
    awake: "light_or_medium",
    drowsy: "light_or_medium",
    sleepy: "medium_or_hint",
    exhausted: "force_full",
    dreaming: "auto_eod",
  },
  checkScriptsPath: "skills/soul-protocol/scripts",
};

// ── 公开 API ────────────────────────────────────────────────────────────

/**
 * 加载睡意配置（带缓存）
 * @param workspaceDir 工作目录
 */
export function loadSleepinessConfig(workspaceDir: string): SleepinessConfig {
  // 同一 workspace 复用缓存
  if (_config && _configWorkspace === workspaceDir) return _config;

  const configPath = path.join(
    workspaceDir,
    "skills",
    "soul-protocol",
    "config",
    "sleepiness.json",
  );

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      _config = JSON.parse(raw) as SleepinessConfig;
      _configWorkspace = workspaceDir;
      return _config;
    }
  } catch {
    // 降级到默认值
  }

  _config = { ...DEFAULTS };
  _configWorkspace = workspaceDir;
  return _config;
}

/**
 * 获取检查脚本基础路径
 * @param workspaceDir 工作目录
 */
export function getCheckScriptsPath(workspaceDir: string): string {
  return loadSleepinessConfig(workspaceDir).checkScriptsPath;
}

/** 获取日志系统配置（含剪枝参数） */
export function getLoggingConfig(workspaceDir: string): LoggingConfig {
  return loadSleepinessConfig(workspaceDir).logging || DEFAULT_LOGGING;
}
