// ───────────────────────────────────────────────────────────────────────
// Hub 分发器 — V3.8.6 场景路由核心
// ───────────────────────────────────────────────────────────────────────

import type { DispatchContext, ScenarioHandler } from "./types.js";
import { startupScenario } from "./modules/startup.js";
import { heartbeatScenario } from "./modules/heartbeat.js";
import { recoveryScenario } from "./modules/recovery.js";

const scenarios: Record<string, ScenarioHandler> = {
  startup: startupScenario,
  heartbeat: heartbeatScenario,
  recovery: recoveryScenario,
  conversation: heartbeatScenario, // V3.8.8: 用户消息场景，路由到心跳处理器
};

/**
 * 场景分发入口
 * @param ctx - 分发上下文
 * @returns 输出字符串数组 + data（含prependSystemContext，由框架注入系统prompt）
 */
export async function dispatch(ctx: DispatchContext): Promise<{ output: string[]; data?: unknown }> {
  const handler = scenarios[ctx.scenario];
  if (!handler) {
    throw new Error(`Unknown scenario: ${ctx.scenario}`);
  }
  const result = await handler.execute(ctx);
  return {
    output: result.output ? [result.output] : [],
    data: result.data,
  };
}
