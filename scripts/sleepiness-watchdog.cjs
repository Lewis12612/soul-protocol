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

// V3.8.8-beta3: 因子计算从共享模块导入（与 heartbeat.ts 公式完全一致）
const {
  calcCircadianFactor,
  calcUptimeFactor,
  calcMemoryLoadFactor,
  calcHoursSinceLastEod,
} = require("./sleepiness-factors.cjs");

// ── 参数解析 ────────────────────────────────────────────────────────────

const wsIdx = process.argv.indexOf("--workspace-dir");
if (wsIdx === -1) {
  console.error("用法: node sleepiness-watchdog.cjs --workspace-dir <path>");
  process.exit(1);
}
const WORKSPACE_DIR = process.argv[wsIdx + 1];
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const LOG_FILE = `${WORKSPACE_DIR}/memory/.heartbeat/logs/plugin.log`;
const PID_FILE = `${WORKSPACE_DIR}/memory/.heartbeat/watchdog.pid`;

// ── 结构化日志（JSONL，与 src/utils/logger.ts 格式完全对齐） ─────────

/**
 * 写入一条 JSONL 日志。
 * @param {string} mod  模块标签
 * @param {string} evt  事件类型
 * @param {string} lvl  日志级别
 * @param {string} msg  人类可读摘要
 * @param {object} [ctx] 可选上下文
 */
function logEvent(mod, evt, lvl, msg, ctx) {
  const entry = { ts: new Date().toISOString(), mod, evt, lvl, msg };
  if (ctx && Object.keys(ctx).length > 0) entry.ctx = ctx;
  const line = JSON.stringify(entry);

  // console 输出（保留可见性）
  const label = path.basename(path.dirname(path.dirname(WORKSPACE_DIR))) || "agent";
  console.error(`[${entry.ts.slice(0, 19).replace("T", " ")}] [${label}] [${mod}:${evt}] ${msg}`);

  // 写入 plugin.log
  try {
    const logsDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    // 自动轮转：>10MB
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 10 * 1024 * 1024) {
      const archiveDir = path.join(logsDir, "archive");
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      fs.renameSync(LOG_FILE, path.join(archiveDir, `plugin-${ts}.log`));
    }
    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {}
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

// ── EXTRA 基础路径 + 因子计算 ──────────────────────────────────────────
// 因子函数已抽离至 ./sleepiness-factors.cjs（顶部 require），此处仅保留调用

// ── 主检查 ──────────────────────────────────────────────────────────────

function check() {
  const cfg = loadConfig();
  const h = calcHoursSinceLastEod(WORKSPACE_DIR);
  const circadian = calcCircadianFactor();          // 自动取当前时间
  const uptime = calcUptimeFactor(h);
  const memoryLoad = calcMemoryLoadFactor(WORKSPACE_DIR);
  const score = Math.min(1.0, cfg.weights.circadian * circadian + cfg.weights.uptime * uptime + cfg.weights.memoryLoad * memoryLoad);

  let level = "awake";
  for (const t of cfg.thresholds) { if (score <= t.maxScore) { level = t.level; break; } }

  const eodFile = `${WORKSPACE_DIR}/memory/.heartbeat/eod-pending.json`;

  if (level === "dreaming" || level === "exhausted") {
    logEvent("watchdog", "health_check", "info", `${level} — 触发日终协议`, {
      score: Math.round(score * 100) / 100,
      level,
      hoursSinceLastEod: Math.round(h * 10) / 10,
    });
    logEvent("watchdog", "injected", "info", `睡意${level}，写入 eod-pending.json`, {
      sleepiness: {
        level,
        score: Math.round(score * 100) / 100,
        hoursSinceLastEod: Math.round(h * 10) / 10,
        factors: {
          circadian: Math.round(circadian * 100) / 100,
          uptime: Math.round(uptime * 100) / 100,
          memoryLoad: Math.round(memoryLoad * 100) / 100,
        },
      },
    });

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

    const eodTmp = eodFile + ".tmp";
    fs.writeFileSync(eodTmp, JSON.stringify({
      triggered_by: "sleepiness-watchdog",
      trigger_level: level, trigger_score: Math.round(score * 100) / 100,
      sleepiness: { level, score: Math.round(score * 100) / 100, hoursSinceLastEod: Math.round(h * 10) / 10, factors: { circadian: Math.round(circadian * 100) / 100, uptime: Math.round(uptime * 100) / 100, memoryLoad: Math.round(memoryLoad * 100) / 100 } },
      full_result: fullResult,
      created_at: new Date().toISOString(), consumed: false,
    }, null, 2), "utf-8");
    fs.renameSync(eodTmp, eodFile);

    logEvent("watchdog", "executed", "info", "eod-pending.json 已写入");
  } else {
    logEvent("watchdog", "health_check", "info", `${level} — 正常`, {
      score: Math.round(score * 100) / 100,
      level,
      hoursSinceLastEod: Math.round(h * 10) / 10,
    });
  }

  // ── 验证闭环：检查注入后是否真正执行 ────────────────────────────────
  verifyEodExecution();
}

// ── 轻量 JSONL 日志包装（对齐现有 logEvent） ───────────────────────────

/**
 * 写入一条验证日志，自动映射事件类型到日志级别。
 * @param {string} mod  模块标签
 * @param {string} evt  事件类型 (retry|critical|consumed|health_warn)
 * @param {string} msg  人类可读摘要
 * @param {object} [ctx] 可选上下文
 */
function writeJsonLog(mod, evt, msg, ctx) {
  const levelMap = { retry: "warn", critical: "error", consumed: "info", health_warn: "warn" };
  logEvent(mod, evt, levelMap[evt] || "info", msg, ctx);
}

// ── EOD 执行验证闭环 ────────────────────────────────────────────────────

/**
 * 检查 last-eod.json 是否超过 24 小时未更新。
 * 仅在 eod-pending.json 不存在时调用 —— 可能是系统静默故障。
 */
function checkLastEodStale() {
  const lastEodFile = path.join(WORKSPACE_DIR, "memory", ".heartbeat", "last-eod.json");
  if (!fs.existsSync(lastEodFile)) return;
  try {
    const lastEod = JSON.parse(fs.readFileSync(lastEodFile, "utf-8"));
    const hoursSinceLast = (Date.now() - lastEod.last_eod_time) / 3600000;
    if (hoursSinceLast > 24) {
      console.error(`[soul-protocol] WARNING: last-eod 超过 ${Math.round(hoursSinceLast)} 小时未更新`);
      writeJsonLog("watchdog", "health_warn", "last-eod超过24h未更新，可能系统静默故障", {
        hours_since: Math.round(hoursSinceLast),
      });
    }
  } catch {}
}

/**
 * 验证日终 spawn 子步骤的产出物。
 * 在 EOD 确认执行后调用 —— 检查 daily/deep/work/日记文件是否在 injected_at 之后被写入。
 */
function verifySpawnOutput() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = today.slice(0, 4);
  const m = today.slice(5, 7);

  const checks = [
    { name: "daily归档", file: `memory/memory-core/daily-dialogue/${y}/${m}/${today}.md` },
    { name: "日记",      file: `memory/memory-core/diary/${y}/${m}/${today}.md` },
  ];

  // deep/work 归档文件名含主题，用 glob 匹配
  const deepDir  = path.join(WORKSPACE_DIR, "memory", "memory-core", "deep-dialogue", y, m);
  const workDir  = path.join(WORKSPACE_DIR, "memory", "memory-core", "work-dialogue", y, m);

  for (const check of checks) {
    const fullPath = path.join(WORKSPACE_DIR, check.file);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtime > now - 24 * 3600000) {
          writeJsonLog("spawn", "step_done", `${check.name} 已产出`, { file: check.file, size: stat.size });
        } else {
          writeJsonLog("spawn", "step_fail", `${check.name} 文件存在但修改时间超过24h`, { file: check.file });
        }
      } catch {
        writeJsonLog("spawn", "step_fail", `${check.name} 无法读取`, { file: check.file });
      }
    } else {
      writeJsonLog("spawn", "step_fail", `${check.name} 未产出`, { file: check.file });
    }
  }

  // deep 归档
  try {
    if (fs.existsSync(deepDir)) {
      const deepFiles = fs.readdirSync(deepDir).filter(f => f.startsWith(today));
      if (deepFiles.length > 0) {
        writeJsonLog("spawn", "step_done", "deep归档 已产出", { count: deepFiles.length });
      } else {
        writeJsonLog("spawn", "step_fail", "deep归档 未产出", { dir: deepDir });
      }
    }
  } catch {}

  // work 归档
  try {
    if (fs.existsSync(workDir)) {
      const workFiles = fs.readdirSync(workDir).filter(f => f.startsWith(today));
      if (workFiles.length > 0) {
        writeJsonLog("spawn", "step_done", "work归档 已产出", { count: workFiles.length });
      } else {
        writeJsonLog("spawn", "step_fail", "work归档 未产出", { dir: workDir });
      }
    }
  } catch {}
}

/**
 * 验证 EOD 协议注入后是否真正执行。
 *
 * 验证路径：
 *   A. eod-pending 不存在 → checkLastEodStale() 健康检查
 *   B. consumed=true        → 正常清理
 *   C. injected=true 但未消费 → 对比 last-eod 时间戳判断是否已执行
 *       C1. 已执行 → 正常清理
 *       C2. 未执行 → retry_count++ → retry<3 重置标记重新注入 / retry≥3 放弃
 */
function verifyEodExecution() {
  const pendingFile = path.join(WORKSPACE_DIR, "memory", ".heartbeat", "eod-pending.json");

  // ── 路径 A：eod-pending 不存在 ──────────────────────────────────────
  if (!fs.existsSync(pendingFile)) {
    checkLastEodStale();
    return;
  }

  // ── 路径 B/C：读取 eod-pending ──────────────────────────────────────
  let pending;
  try {
    pending = JSON.parse(fs.readFileSync(pendingFile, "utf-8"));
  } catch {
    // 损坏的 JSON → 直接清理
    try { fs.unlinkSync(pendingFile); } catch {}
    return;
  }

  const lastEodFile = path.join(WORKSPACE_DIR, "memory", ".heartbeat", "last-eod.json");

  // ── 路径 B：已被 execute-protocol 消费 ──────────────────────────────
  if (pending.consumed) {
    writeJsonLog("watchdog", "consumed", "EOD协议已确认执行");
    try { fs.unlinkSync(pendingFile); } catch {}
    return;
  }

  // ── 路径 C：已注入但未消费 ──────────────────────────────────────────
  if (pending.injected && !pending.consumed) {
    let executed = false;
    if (pending.injected_at && fs.existsSync(lastEodFile)) {
      try {
        const lastEod = JSON.parse(fs.readFileSync(lastEodFile, "utf-8"));
        executed = lastEod.last_eod_time > new Date(pending.injected_at).getTime();
      } catch {}
    }

    // ── C1：日终已执行 → 正常清理 + spawn 产出验证 ──────────────────
    if (executed) {
      writeJsonLog("watchdog", "consumed", "EOD协议已确认执行");
      verifySpawnOutput();  // P2：验证归档文件是否产出
      try { fs.unlinkSync(pendingFile); } catch {}
      return;
    }

    // ── C2：日终未执行 → retry ─────────────────────────────────────
    const retry = (pending.retry_count || 0) + 1;
    pending.retry_count = retry;

    if (retry >= 3) {
      // 放弃：避免死循环
      console.error(`[soul-protocol] CRITICAL: EOD ${retry}次重试失败，已放弃。请手动检查记忆完整性。`);
      writeJsonLog("watchdog", "critical", `EOD ${retry}次重试失败，放弃自动重试`, {
        retry_count: retry,
      });
      try { fs.unlinkSync(pendingFile); } catch {}
    } else if (retry === 2) {
      // 升级告警
      pending.injected = false;
      pending.consumed = false;
      const tmpR2 = pendingFile + ".tmp";
      fs.writeFileSync(tmpR2, JSON.stringify(pending, null, 2), "utf-8");
      fs.renameSync(tmpR2, pendingFile);
      writeJsonLog("watchdog", "retry", "EOD 2次重试仍未执行，升级告警", {
        retry_count: retry,
      });
    } else {
      // retry=1：重置标记，让下一轮 hook 重新注入
      pending.injected = false;
      pending.consumed = false;
      const tmpR1 = pendingFile + ".tmp";
      fs.writeFileSync(tmpR1, JSON.stringify(pending, null, 2), "utf-8");
      fs.renameSync(tmpR1, pendingFile);
      writeJsonLog("watchdog", "retry", `EOD注入后未执行，第${retry}次重试`, {
        retry_count: retry,
      });
    }
  }
}

// ── 启动 ────────────────────────────────────────────────────────────────

logEvent("watchdog", "executed", "info", "睡眠守护进程启动", { workspace: WORKSPACE_DIR, pid: process.pid });

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
  logEvent("watchdog", "executed", "info", "守护进程退出");
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
info", "守护进程退出");
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
