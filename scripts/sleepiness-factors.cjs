#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────
// sleepiness-factors.cjs — 睡意三因子共享计算模块
//
// 作为唯一真相源，供 sleepiness-watchdog.cjs 直 require。
// heartbeat.ts 保留 TypeScript 实现但公式与本文件保持完全一致。
//
// 公式版本: V3.8.8-beta3
// ───────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// ── 生物周期因子 (circadian) ─────────────────────────────────────────────
//
// 自然作息曲线，仅基于当前时间。
// 公式与 heartbeat.ts::calcCircadianFactor 保持同步。
//
// @param {number} [timeOfDay] 当日小时+分钟/60，未传则自动计算
// @returns {number} 0-1
function calcCircadianFactor(timeOfDay) {
  if (timeOfDay === undefined || timeOfDay === null) {
    const now = new Date();
    timeOfDay = now.getHours() + now.getMinutes() / 60;
  }
  // 深夜 22:00-06:00 → 高峰 1.0
  if (timeOfDay >= 22 || timeOfDay < 6) return 1.0;
  // 清晨 06:00-10:00 → 醒来 1.0→0.2
  if (timeOfDay >= 6 && timeOfDay < 10) return 1.0 - (timeOfDay - 6) * 0.2;
  // 白天 10:00-18:00 → 清醒 0.1（微基线，允许午睡）
  if (timeOfDay >= 10 && timeOfDay < 18) return 0.1;
  // 傍晚 18:00-22:00 → 渐困 0.2→1.0
  return 0.2 + (timeOfDay - 18) * 0.2;
}

// ── 运行时间因子 (uptime) ────────────────────────────────────────────────
//
// 距上次日终的时长，分段线性增长。
// 公式与 heartbeat.ts::calcUptimeFactor 保持同步。
//
// @param {number} hoursSinceLastEod
// @returns {number} 0-1
function calcUptimeFactor(hoursSinceLastEod) {
  if (hoursSinceLastEod < 2) return 0;
  if (hoursSinceLastEod < 8) return ((hoursSinceLastEod - 2) / 6) * 0.5;
  if (hoursSinceLastEod < 16) return 0.5 + ((hoursSinceLastEod - 8) / 8) * 0.3;
  return Math.min(1.0, 0.8 + ((hoursSinceLastEod - 16) / 24) * 0.2);
}

// ── 记忆储量因子 (memoryLoad) ────────────────────────────────────────────
//
// EXTRA 层当日对话文件大小，分段线性增长。
// 公式与 heartbeat.ts::calcMemoryLoadFactor 保持同步。
//
// @param {string} workspaceDir
// @returns {number} 0-1
function calcMemoryLoadFactor(workspaceDir) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const y = today.slice(0, 4);
    const m = today.slice(5, 7);

    // 自动探测 EXTRA 基础路径（与 agent-config.ts::getExtraBasePath 同逻辑）
    let basePath = `${process.env.HOME}/dialogue-logs`;
    const pluginConfigPath = path.join(workspaceDir, "skills", "soul-protocol", "openclaw.plugin.json");
    try {
      if (fs.existsSync(pluginConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(pluginConfigPath, "utf-8"));
        if (cfg.agentConfig?.extraBasePath) {
          basePath = cfg.agentConfig.extraBasePath;
        }
      }
    } catch {}

    const extraPath = path.join(basePath, y, m, today);
    let totalSize = 0;
    if (fs.existsSync(extraPath)) {
      for (const file of fs.readdirSync(extraPath)) {
        try { totalSize += fs.statSync(path.join(extraPath, file)).size; } catch {}
      }
    }

    const totalKB = totalSize / 1024;
    // 0-50KB: 0, 50-200KB: 0→0.5, 200-500KB: 0.5→0.8, 500KB+: 0.8→1.0
    if (totalKB < 50) return 0;
    if (totalKB < 200) return ((totalKB - 50) / 150) * 0.5;
    if (totalKB < 500) return 0.5 + ((totalKB - 200) / 300) * 0.3;
    return Math.min(1.0, 0.8 + ((totalKB - 500) / 1000) * 0.2);
  } catch {
    return 0;
  }
}

// ── 日终距时 ─────────────────────────────────────────────────────────────
//
// 从 last-eod.json / plugin-state.json 读取上次日终时间。
// 公式与 heartbeat.ts::calcHoursSinceLastEod 保持同步。
//
// @param {string} workspaceDir
// @returns {number} 小时数
function calcHoursSinceLastEod(workspaceDir) {
  const f = path.join(workspaceDir, "memory", ".heartbeat", "last-eod.json");
  try {
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, "utf-8"));
      if (d.last_eod_time) return (Date.now() - d.last_eod_time) / 3600000;
    }
  } catch {}
  const sf = path.join(workspaceDir, "memory", ".heartbeat", "plugin-state.json");
  try {
    if (fs.existsSync(sf)) {
      const d = JSON.parse(fs.readFileSync(sf, "utf-8"));
      if (d.lastFullInjectTime) return (Date.now() - d.lastFullInjectTime) / 3600000;
    }
  } catch {}
  return 999;
}

// ── 导出 ─────────────────────────────────────────────────────────────────

module.exports = {
  calcCircadianFactor,
  calcUptimeFactor,
  calcMemoryLoadFactor,
  calcHoursSinceLastEod,
};
