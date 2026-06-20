#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────
// sleepiness-watchdog.cjs — 持久化睡眠守护进程（单 workspace 版）
//
// 用法: node sleepiness-watchdog.cjs --workspace-dir <path>
//
// 完全独立于 OpenClaw Gateway / 系统 cron：
// - 用 setInterval 自循环，每 5 分钟检查一次
// - 写入 eod-pending.json 供 before-prompt-build 钩子消费
// ───────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── 参数解析 ────────────────────────────────────────────────────────────

const wsIdx = process.argv.indexOf("--workspace-dir");
if (wsIdx === -1) {
  console.error("用法: node sleepiness-watchdog.cjs --workspace-dir <path>");
  process.exit(1);
}
const WORKSPACE_DIR = process.argv[wsIdx + 1];
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const LOG_FILE = `${WORKSPACE_DIR}/memory/.heartbeat/watchdog.log`;
const PID_FILE = `${WORKSPACE_DIR}/memory/.heartbeat/watchdog.pid`;

// ── 日志 ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const label = path.basename(path.dirname(path.dirname(WORKSPACE_DIR))) || "agent";
  const line = `[${ts}] [${label}] ${msg}`;
  console.error(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

// ── 睡意配置（从 config/sleepiness.json 读取，与 heartbeat.ts 同源） ───

let _sleepinessConfig = null;
function loadConfig() {
  if (_sleepinessConfig) return _sleepinessConfig;
  const configPath = `${WORKSPACE_DIR}/skills/soul-protocol/config/sleepiness.json`;
  try {
    _sleepinessConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    _sleepinessConfig = {
      weights: { circadian: 0.35, uptime: 0.35, memoryLoad: 0.3 },
      thresholds: [
        { level: "awake", maxScore: 0.3 },
        { level: "drowsy", maxScore: 0.5 },
        { level: "sleepy", maxScore: 0.7 },
        { level: "exhausted", maxScore: 0.95 },
        { level: "dreaming", maxScore: 1.0 },
      ],
      checkScriptsPath: "skills/soul-system/scripts",
    };
  }
  return _sleepinessConfig;
}

// ── EXTRA 基础路径 ──────────────────────────────────────────────────────

function getExtraBasePath() {
  const configPath = `${WORKSPACE_DIR}/skills/soul-protocol/openclaw.plugin.json`;
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8")).agentConfig?.extraBasePath || "/tmp/openclaw-dialogue-logs";
    }
  } catch {}
  return "/tmp/openclaw-dialogue-logs";
}

// ── 因子计算 ────────────────────────────────────────────────────────────

function calcHoursSinceLastEod() {
  const f = `${WORKSPACE_DIR}/memory/.heartbeat/last-eod.json`;
  try {
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, "utf-8"));
      if (d.last_eod_time) return (Date.now() - d.last_eod_time) / 3600000;
    }
  } catch {}
  const sf = `${WORKSPACE_DIR}/memory/.heartbeat/plugin-state.json`;
  try {
    if (fs.existsSync(sf)) {
      const d = JSON.parse(fs.readFileSync(sf, "utf-8"));
      if (d.lastFullInjectTime) return (Date.now() - d.lastFullInjectTime) / 3600000;
    }
  } catch {}
  return 999;
}

function calcCircadianFactor() {
  const tod = new Date().getHours() + new Date().getMinutes() / 60;
  if (tod >= 22 || tod < 6) return 1.0;
  if (tod >= 6 && tod < 10) return 1.0 - (tod - 6) * 0.2;
  if (tod >= 10 && tod < 18) return 0.1;
  return 0.2 + (tod - 18) * 0.2;
}

function calcUptimeFactor(h) {
  if (h < 2) return 0;
  if (h < 8) return ((h - 2) / 6) * 0.5;
  if (h < 16) return 0.5 + ((h - 8) / 8) * 0.3;
  return Math.min(1.0, 0.8 + ((h - 16) / 24) * 0.2);
}

function calcMemoryLoadFactor() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const bp = getExtraBasePath();
    const ep = `${bp}/${today.slice(0, 4)}/${today.slice(5, 7)}/${today}`;
    let total = 0;
    if (fs.existsSync(ep)) {
      for (const f of fs.readdirSync(ep)) try { total += fs.statSync(path.join(ep, f)).size; } catch {}
    }
    const kb = total / 1024;
    if (kb < 50) return 0;
    if (kb < 200) return ((kb - 50) / 150) * 0.5;
    if (kb < 500) return 0.5 + ((kb - 200) / 300) * 0.3;
    return Math.min(1.0, 0.8 + ((kb - 500) / 1000) * 0.2);
  } catch { return 0; }
}

// ── 主检查 ──────────────────────────────────────────────────────────────

function check() {
  const cfg = loadConfig();
  const h = calcHoursSinceLastEod();
  const circadian = calcCircadianFactor();
  const uptime = calcUptimeFactor(h);
  const memoryLoad = calcMemoryLoadFactor();
  const score = Math.min(1.0, cfg.weights.circadian * circadian + cfg.weights.uptime * uptime + cfg.weights.memoryLoad * memoryLoad);

  let level = "awake";
  for (const t of cfg.thresholds) { if (score <= t.maxScore) { level = t.level; break; } }

  const eodFile = `${WORKSPACE_DIR}/memory/.heartbeat/eod-pending.json`;

  if (level === "dreaming" || level === "exhausted") {
    log(`${level} (${score.toFixed(2)}) — 触发日终协议`);

    const scriptsPath = cfg.checkScriptsPath || "skills/soul-system/scripts";
    const checkFullScript = `${WORKSPACE_DIR}/${scriptsPath}/check-full.sh`;
    let fullResult = {};
    if (fs.existsSync(checkFullScript)) {
      const output = execSync(`bash "${checkFullScript}"`, { cwd: WORKSPACE_DIR, timeout: 30000, encoding: "utf-8" });
      const m = output.match(/\{[\s\S]*\}/);
      if (m) { try { fullResult = JSON.parse(m[0]); } catch { fullResult = { raw_output: output }; } }
      else { fullResult = { raw_output: output }; }
    }

    const dir = path.dirname(eodFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(eodFile, JSON.stringify({
      triggered_by: "sleepiness-watchdog",
      trigger_level: level, trigger_score: Math.round(score * 100) / 100,
      sleepiness: { level, score: Math.round(score * 100) / 100, hoursSinceLastEod: Math.round(h * 10) / 10, factors: { circadian: Math.round(circadian * 100) / 100, uptime: Math.round(uptime * 100) / 100, memoryLoad: Math.round(memoryLoad * 100) / 100 } },
      full_result: fullResult,
      created_at: new Date().toISOString(), consumed: false,
    }, null, 2), "utf-8");

    log(`✅ eod-pending.json 已写入`);
  } else {
    log(`${level} (${score.toFixed(2)}) — 正常`);
  }
}

// ── 启动 ────────────────────────────────────────────────────────────────

log(`🛡️ 睡眠守护进程启动 — workspace: ${WORKSPACE_DIR}`);

// 写 PID 文件
try {
  const pidDir = path.dirname(PID_FILE);
  if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid), "utf-8");
} catch {}

check();
setInterval(check, CHECK_INTERVAL_MS);
process.stdin.resume();

function cleanup() {
  log("退出");
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
