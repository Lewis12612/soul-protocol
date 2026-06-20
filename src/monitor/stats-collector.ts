// ───────────────────────────────────────────────────────────────────────
// 心跳统计收集器 — 读取心跳日志，生成统计报告
// 段7实现：monitor 进程核心组件
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../utils/logger.js";
import { getTodayStrShort, formatDateShort } from "../utils/date.js";

const log = createLogger("monitor:stats");

// ── 类型定义 ───────────────────────────────────────────────────────────

export interface StatsData {
  heartbeatCount: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  lastCheckTime: string;
  /** 按检查类型分组统计 */
  byType: {
    light: { count: number; success: number; error: number; avgMs: number };
    medium: { count: number; success: number; error: number; avgMs: number };
    full: { count: number; success: number; error: number; avgMs: number };
  };
  /** 协议完成率 */
  completionRate: number;
}

interface HeartbeatLogEntry {
  timestamp: string;
  checkType: "light" | "medium" | "full";
  trigger: string;
  actions: string[];
  results: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ── 公开 API ───────────────────────────────────────────────────────────

/**
 * 收集今日心跳日志统计
 *
 * 读取 skills/soul-protocol/logs/heartbeat-YYYYMMDD.log
 * 返回心跳计数、成功率、平均耗时等指标
 */
export function collectStats(workspaceDir: string): StatsData {
  const logsDir = path.join(workspaceDir, "skills", "soul-protocol", "logs");

  // 获取今日日期 YYYYMMDD
  const today = getTodayStrShort();
  const logFile = path.join(logsDir, `heartbeat-${today}.log`);

  // 日志不存在 → 返回零值
  if (!fs.existsSync(logFile)) {
    log.debug("今日心跳日志不存在", { logFile });
    return emptyStats();
  }

  // 读取并解析日志
  let raw: string;
  try {
    raw = fs.readFileSync(logFile, "utf-8").trim();
  } catch (err) {
    log.error("读取心跳日志失败", { error: String(err) });
    return emptyStats();
  }

  if (!raw) return emptyStats();

  const lines = raw.split("\n");
  const entries: HeartbeatLogEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      log.warn("跳过无效日志行", { line: line.slice(0, 80) });
    }
  }

  if (entries.length === 0) return emptyStats();

  // 全局统计
  const successCount = entries.filter((e) => e.success).length;
  const errorCount = entries.length - successCount;
  const avgDuration =
    entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length;

  // 按类型分组统计
  const byType = computeByType(entries);

  // 协议完成率 = 成功心跳数 / 总心跳数
  const completionRate =
    entries.length > 0 ? Math.round((successCount / entries.length) * 10000) / 100 : 0;

  return {
    heartbeatCount: entries.length,
    successCount,
    errorCount,
    avgDurationMs: Math.round(avgDuration),
    lastCheckTime: entries[entries.length - 1]?.timestamp || "unknown",
    byType,
    completionRate,
  };
}

/**
 * 将统计报告写入文件
 * 路径: {workspaceDir}/memory/.heartbeat/stats-report.json
 */
export function writeStatsReport(
  workspaceDir: string,
  stats: StatsData,
): void {
  const reportDir = path.join(workspaceDir, "memory", ".heartbeat");
  const reportFile = path.join(reportDir, "stats-report.json");

  try {
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(reportFile, JSON.stringify(stats, null, 2), "utf-8");
    log.info("✅ 统计报告已写入", { reportFile });
  } catch (err) {
    log.error("统计报告写入失败", { error: String(err) });
  }
}

/**
 * 读取最近 N 天的统计报告
 * 返回合并后的统计摘要
 */
export function collectMultiDayStats(
  workspaceDir: string,
  days: number = 7,
): StatsData & { dateRange: string } {
  const logsDir = path.join(workspaceDir, "skills", "soul-protocol", "logs");
  const allEntries: HeartbeatLogEntry[] = [];

  // 遍历最近 N 天
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = formatDateShort(date);
    const logFile = path.join(logsDir, `heartbeat-${dateStr}.log`);

    if (!fs.existsSync(logFile)) continue;

    try {
      const raw = fs.readFileSync(logFile, "utf-8").trim();
      if (!raw) continue;
      for (const line of raw.split("\n")) {
        try {
          allEntries.push(JSON.parse(line));
        } catch {
          // skip invalid lines
        }
      }
    } catch {
      continue;
    }
  }

  if (allEntries.length === 0) {
    return {
      ...emptyStats(),
      dateRange: `${days}天内无日志`,
    };
  }

  const successCount = allEntries.filter((e) => e.success).length;
  const errorCount = allEntries.length - successCount;
  const avgDuration =
    allEntries.reduce((sum, e) => sum + e.durationMs, 0) / allEntries.length;
  const byType = computeByType(allEntries);
  const completionRate =
    Math.round((successCount / allEntries.length) * 10000) / 100;

  const firstTime = allEntries[0]?.timestamp || "unknown";
  const lastTime = allEntries[allEntries.length - 1]?.timestamp || "unknown";

  return {
    heartbeatCount: allEntries.length,
    successCount,
    errorCount,
    avgDurationMs: Math.round(avgDuration),
    lastCheckTime: lastTime,
    byType,
    completionRate,
    dateRange: `${firstTime} → ${lastTime}`,
  };
}

// ── 内部工具函数 ───────────────────────────────────────────────────────

function emptyStats(): StatsData {
  return {
    heartbeatCount: 0,
    successCount: 0,
    errorCount: 0,
    avgDurationMs: 0,
    lastCheckTime: "无日志",
    byType: {
      light: { count: 0, success: 0, error: 0, avgMs: 0 },
      medium: { count: 0, success: 0, error: 0, avgMs: 0 },
      full: { count: 0, success: 0, error: 0, avgMs: 0 },
    },
    completionRate: 0,
  };
}

function computeByType(entries: HeartbeatLogEntry[]): StatsData["byType"] {
  const result: StatsData["byType"] = {
    light: { count: 0, success: 0, error: 0, avgMs: 0 },
    medium: { count: 0, success: 0, error: 0, avgMs: 0 },
    full: { count: 0, success: 0, error: 0, avgMs: 0 },
  };

  const typeMap: Record<string, keyof StatsData["byType"]> = {
    light: "light",
    medium: "medium",
    full: "full",
  };

  for (const typeKey of Object.keys(result) as (keyof StatsData["byType"])[]) {
    const typeEntries = entries.filter(
      (e) => typeMap[e.checkType] === typeKey,
    );
    result[typeKey].count = typeEntries.length;
    result[typeKey].success = typeEntries.filter((e) => e.success).length;
    result[typeKey].error = typeEntries.length - result[typeKey].success;
    result[typeKey].avgMs =
      typeEntries.length > 0
        ? Math.round(
            typeEntries.reduce((s, e) => s + e.durationMs, 0) /
              typeEntries.length,
          )
        : 0;
  }

  return result;
}
