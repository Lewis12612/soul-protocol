// ───────────────────────────────────────────────────────────────────────
// 安全拦截钩子 — 最小化硬编码拦截，优先保证记忆流动
// 钩子: before_tool_call
// 设计方向: 未来改为LLM判断危险程度
// ───────────────────────────────────────────────────────────────────────

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "../types.js";
import type { ParsedRules, SafetyRule } from "../rules.js";
import { createLogger, logInterception } from "../utils/logger.js";
import { validateToolCall, validateCommand, DANGEROUS_PATTERNS } from "../utils/validator.js";

const log = createLogger("hook:before-tool-call");

/**
 * before_tool_call 钩子处理函数
 *
 * 当前策略：最小化硬编码拦截
 * - 只拦截真正危险操作（rm -rf、git push --force、sudo等）
 * - 不拦截正常工作文件（L2日记、SESSION-STATE等）
 * - 未来方向：改为LLM判断危险程度
 */
export function createBeforeToolCallHook(rules: ParsedRules) {
  return async function beforeToolCall(
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ): Promise<PluginHookBeforeToolCallResult | void> {
    const { toolName, params } = event;

    log.debug("🔍 工具调用检查", {
      tool: toolName,
      runId: event.runId,
      sessionId: ctx.sessionId,
    });

    // 1. 安全红线检查（只检查命令级危险操作）
    const safetyResult = checkSafetyRules(rules.safetyRules, toolName, params);
    if (safetyResult) {
      logInterception(
        log,
        safetyResult.triggeredRule?.id ?? "unknown",
        safetyResult.action ?? "block",
        toolName,
        params,
        safetyResult.reason ?? "",
      );

      return buildToolCallResult(safetyResult);
    }

    // 2. exec/bash 命令检查（只拦截危险命令）
    if (toolName === "exec" || toolName === "bash") {
      const commandResult = checkDangerousCommand(params);
      if (commandResult) {
        return commandResult;
      }
    }

    // 3. delete/unlink 检查
    if (toolName === "delete" || toolName === "unlink") {
      log.warn("⚠️ 删除操作", { target: params.path });
      // 不拦截，只记录日志
      // 未来改为LLM判断
    }

    // 通过检查 — 不拦截正常工具调用
    return undefined;
  };
}

/** 检查安全红线规则（只检查命令级） */
function checkSafetyRules(
  rules: SafetyRule[],
  toolName: string,
  params: Record<string, unknown>,
): ReturnType<typeof validateToolCall> | null {
  if (rules.length === 0) return null;

  const result = validateToolCall(rules, { toolName, params });
  // 只拦截block级别，ask级别改为日志
  if (!result.passed && result.action === "block") {
    return result;
  }
  
  // ask级别只记录日志，不拦截
  if (result.action === "ask") {
    log.info("⚠️ 安全红线提醒（不拦截）", {
      rule: result.triggeredRule?.id,
      reason: result.reason,
    });
  }
  
  return null;
}

/** 检查危险命令（只拦截真正危险的） */
function checkDangerousCommand(params: Record<string, unknown>): PluginHookBeforeToolCallResult | null {
  const command = typeof params.command === "string"
    ? params.command
    : typeof params.cmd === "string"
      ? params.cmd
      : null;

  if (!command) return null;

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      log.warn("🚫 危险命令拦截", { command, reason });
      return {
        block: true,
        blockReason: `${reason}: ${command}`,
      };
    }
  }

  return null;
}

/** 构建拦截结果 */
function buildToolCallResult(
  result: ReturnType<typeof validateToolCall>,
): PluginHookBeforeToolCallResult {
  return {
    block: result.action === "block",
    blockReason: result.reason ?? "安全红线拦截",
    requireApproval: result.action === "ask" ? {
      title: "安全审批",
      description: result.reason ?? "需要老师确认",
      severity: "warning",
    } : undefined,
  };
}