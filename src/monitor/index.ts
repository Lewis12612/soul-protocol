// ───────────────────────────────────────────────────────────────────────
// Monitor 模块 — 心跳日志监控进程
// 段7实现：类似 Gateway 日志的监控能力
// ───────────────────────────────────────────────────────────────────────

export {
  collectStats,
  writeStatsReport,
  collectMultiDayStats,
} from "./stats-collector.js";

export type { StatsData } from "./stats-collector.js";

export {
  checkModuleHealth,
  formatHealthReport,
  writeHealthReport,
} from "./health-check.js";

export type { HealthReport, HealthDetail } from "./health-check.js";
