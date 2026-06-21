// ───────────────────────────────────────────────────────────────────────
// Hub 分发器 — V3.8.8-beta3 精简版
//
// 场景 → handler 直接 dispatch，不引入中间抽象层。
// ───────────────────────────────────────────────────────────────────────

import type { DispatchContext } from "./types.js";
import { startupScenario } from "./modules/startup.js";
import { heartbeatScenario } from "./modules/heartbeat.js";

/**
 * 场景分发入口
 * @param ctx - 分发上下文
 * @returns 输出字符串数组 + data（含prependSystemContext，由框架注入系统prompt）
 */
export async function dispatch(ctx: DispatchContext): Promise<{ output: string[]; data?: unknown }> {
  const handler =
    ctx.scenario === "startup" ? startupScenario :
    ctx.scenario === "heartbeat" || ctx.scenario === "conversation" ? heartbeatScenario :
    null;

  if (!handler) throw new Error(`Unknown scenario: ${ctx.scenario}`);

  const result = await handler.execute(ctx);
  return { output: result.output ? [result.output] : [], data: result.data };
}
