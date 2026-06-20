// ───────────────────────────────────────────────────────────────────────
// 全量注入 — startup + recovery 共享逻辑（合并重构）
// startup: createL2=true  |  recovery: createL2=false
// 之前是 startup.ts(68行) 和 recovery.ts(68行) 两处几乎相同的代码
// ───────────────────────────────────────────────────────────────────────

import type { DispatchContext, ScenarioHandler } from "../types.js";
import { createLogger } from "../utils/logger.js";
import {
  readL3Index,
  readRecentL2,
  readSessionState,
  verifyState,
  createEmptyL2,
  getTodayStr,
} from "./memory/reader.js";

/**
 * 创建全量注入场景处理器
 * @param options.createL2 是否创建今日 L2（startup=true, recovery=false）
 * @param options.scenarioName 场景名称
 */
export function createFullInjectScenario(options: {
  createL2: boolean;
  scenarioName: string;
}): ScenarioHandler {
  const log = createLogger(`module:${options.scenarioName}`);

  return {
    name: options.scenarioName,

    async execute(ctx: DispatchContext): Promise<{ output?: string; data?: unknown }> {
      const workspaceDir = ctx.workspaceDir;
      const outputs: string[] = [];
      const tag = options.createL2 ? "启动" : "恢复";

      log.info(`${tag}场景执行`, { workspaceDir });

      // 1. L3 INDEX 注入
      const indexContent = readL3Index(workspaceDir);
      if (indexContent) {
        outputs.push(indexContent);
        log.info(`✅ [全量] L3 INDEX 已注入`);
      } else {
        log.warn(`⚠️ [全量] L3 INDEX 未找到`);
      }

      // 2. L2 最近记忆注入
      const recentL2 = readRecentL2(workspaceDir);
      if (recentL2) {
        outputs.push(recentL2);
        log.info(`✅ [全量] L2 最近记忆已注入`);
      } else {
        log.warn(`⚠️ [全量] L2 最近记忆未找到`);
      }

      // 3. SESSION-STATE 加载
      const sessionState = readSessionState(workspaceDir);
      if (sessionState) {
        outputs.push(sessionState);
        log.info(`✅ [全量] SESSION-STATE 已加载`);
      }

      // 4. 状态验证提醒
      const stateCheck = verifyState(workspaceDir);
      if (stateCheck) {
        outputs.push(stateCheck);
        log.info(`⚠️ [全量] 状态验证提醒已注入`);
      }

      // 5. 创建今日 L2（仅 startup）
      if (options.createL2) {
        const todayDate = getTodayStr();
        await createEmptyL2(workspaceDir, todayDate);
        log.info("✅ [全量] 今日L2已创建（startup）");
      }

      log.info(`${tag}场景完成`, { outputs: outputs.length });

      return { output: outputs.join("\n\n") };
    },
  };
}
