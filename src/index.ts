// ───────────────────────────────────────────────────────────────────────
// 灵魂协议插件 — 入口文件
// 动态规则 + 钉死执行：从身份层文件读取规则，通过钩子框架强制执行
// ───────────────────────────────────────────────────────────────────────

import type { OpenClawPluginApi } from "./types.js";

// 导入解析器
import { parseIdentityFiles } from "./parser.js";
import type { ParsedRules } from "./rules.js";
import { createLogger, logInitFromConfig } from "./utils/logger.js";
import { loadSleepinessConfig } from "./utils/sleepiness-config.js";

// 导入钩子
import { createBeforePromptBuildHook } from "./hooks/before-prompt-build.js";
import { createBeforeToolCallHook } from "./hooks/before-tool-call.js";

// 导入工具
import { registerExecuteProtocolTool } from "./tools/execute-protocol.js";

const log = createLogger("soul-protocol");

// ───────────────────────────────────────────────────────────────────────
// 插件注册
// ───────────────────────────────────────────────────────────────────────

/**
 * 灵魂协议插件注册函数
 *
 * 设计原则：
 * - 规则来源：动态（从身份层文件读取，用户可编辑）
 * - 执行逻辑：钉死（钩子框架固定，系统强制执行）
 * - 生效方式：解析文件 → 钩子配置 → 自动执行
 */
export default function register(api: OpenClawPluginApi): void {
  const pluginId = api.id;
  const workspaceDir = (api.pluginConfig as any)?.workspaceDir
    ?? api.config?.workspace?.dir
    ?? (process.env.OPENCLAW_WORKSPACE_DIR)
    ?? (process.env.HOME ? `${process.env.HOME}/.openclaw/workspace` : undefined);

  const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const enabled = pluginConfig.enabled !== false;
  const strictMode = pluginConfig.strictMode === true;
  const logLevel = (pluginConfig.logLevel as string) ?? "info";

  log.setLevel(logLevel as any);

  // 初始化结构化日志系统（JSONL → memory/.heartbeat/logs/plugin.log）
  let sleepinessConfigForLog;
  try {
    sleepinessConfigForLog = loadSleepinessConfig(workspaceDir);
  } catch {
    sleepinessConfigForLog = undefined;
  }
  logInitFromConfig(workspaceDir, sleepinessConfigForLog ?? { logLevel: "info" } as any);

  if (!enabled) {
    log.info("灵魂协议插件已禁用");
    return;
  }

  log.info("🔮 灵魂协议插件启动", {
    workspaceDir,
    strictMode,
    logLevel,
  });

  // ── 1. 解析身份层文件 ──────────────────────────────────────────

  let rules: ParsedRules;
  try {
    rules = parseIdentityFiles({
      workspaceDir,
      useDefaults: !strictMode,
      strict: strictMode,
    });
    log.info("✅ 身份层文件解析成功", {
      safetyRules: rules.safetyRules.length,
      memoryRules: rules.memoryRules.length,
      executionLessons: rules.executionLessons.length,
      hasStartupConfig: !!rules.startupConfig,
      hasPersonalityParams: !!rules.personalityParams,
      hasRelationship: !!rules.relationship,
    });
  } catch (err) {
    log.error("❌ 身份层文件解析失败", { error: String(err) });
    if (strictMode) {
      throw err;
    }
    // 降级：使用空规则
    rules = {
      safetyRules: [],
      personalityPreset: "",
      startupConfig: null,
      memoryRules: [],
      executionLessons: [],
      endOfDayConfig: null,
      personalityParams: null,
      relationship: null,
      parseTimestamp: Date.now(),
      fileStatus: {},
    };
  }

  // ── 2. 注册钩子 ────────────────────────────────────────────────

  // Hook 1: before_prompt_build — 记忆注入（独立，不依赖 rules）
  // ⭐ 传入 workspaceDir，确保钩子使用的路径与插件配置一致
  const beforePromptBuild = createBeforePromptBuildHook(workspaceDir);
  api.on("before_prompt_build", beforePromptBuild as any, { priority: 100 });
  log.info("📌 注册钩子: before_prompt_build (priority: 100)", { workspaceDir });

  // Hook 2: before_tool_call — 安全拦截
  const beforeToolCall = createBeforeToolCallHook(rules);
  api.on("before_tool_call", beforeToolCall as any, { priority: 200 });
  log.info("📌 注册钩子: before_tool_call (priority: 200)");

  // ── 3. 注册工具 ────────────────────────────────────────────────

  // 工具: execute_protocol — LLM 主动调用协议通道
  registerExecuteProtocolTool(api);
  log.info("📌 注册工具: execute_protocol");

  // ── 4. 注册完成 ────────────────────────────────────────────────

  log.info("🎉 灵魂协议插件注册完成", {
    hooks: 2,
    rulesLoaded: {
      safety: rules.safetyRules.length,
      memory: rules.memoryRules.length,
      lessons: rules.executionLessons.length,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────
// 导出类型（供外部使用）
// ───────────────────────────────────────────────────────────────────────

export type { ParsedRules } from "./rules.js";
export { parseIdentityFiles } from "./parser.js";
export { createLogger } from "./utils/logger.js";

// Monitor 模块导出（段7）
export {
  collectStats,
  writeStatsReport,
  collectMultiDayStats,
  checkModuleHealth,
  formatHealthReport,
  writeHealthReport,
} from "./monitor/index.js";
export type { StatsData, HealthReport, HealthDetail } from "./monitor/index.js";
