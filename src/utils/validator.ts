// ───────────────────────────────────────────────────────────────────────
// 验证工具 — 工具调用安全检查、路径验证
// ───────────────────────────────────────────────────────────────────────

import type { SafetyRule } from "../rules.js";
import * as path from "path";

// ── 危险命令模式（统一导出） ─────────────────────────────────────────────

export const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf\b/, reason: "递归强制删除" },
  { pattern: /rm\s+-fr\b/, reason: "递归强制删除" },
  { pattern: /git\s+push\s+--force\b/, reason: "强制推送" },
  { pattern: /git\s+push\s+-f\b/, reason: "强制推送" },
  { pattern: /sudo\s+rm\b/, reason: "sudo删除" },
  { pattern: /sudo\s+chmod\b/, reason: "sudo修改权限" },
  { pattern: />\s*\/etc\/passwd\b/, reason: "覆盖系统密码文件" },
  { pattern: />\s*\/etc\/shadow\b/, reason: "覆盖系统影子文件" },
  { pattern: /dd\s+if=.*of=\/dev\/sd\b/, reason: "写入块设备" },
  { pattern: /\brm\s+-rf\s+\//, reason: "删除根目录" },
  { pattern: /\bmkfs\b/, reason: "格式化磁盘" },
  { pattern: />\s*\/dev\/(sda|vda|hda)/, reason: "覆盖磁盘设备" },
];

// ── 类型定义 ───────────────────────────────────────────────────────────

export interface ValidationContext {
  toolName: string;
  params: Record<string, unknown>;
  sessionId?: string;
  runId?: string;
}

export interface ValidationResult {
  /** 是否通过验证 */
  passed: boolean;
  /** 拦截动作 */
  action?: "block" | "ask" | "warn";
  /** 触发规则 */
  triggeredRule?: SafetyRule;
  /** 原因说明 */
  reason?: string;
  /** 是否需要人工确认 */
  requiresApproval?: boolean;
  /** 审批标题 */
  approvalTitle?: string;
  /** 审批描述 */
  approvalDescription?: string;
  /** 严重级别 */
  severity?: "info" | "warning" | "critical";
}

// ── 公开 API ───────────────────────────────────────────────────────────

/**
 * 验证工具调用是否违反安全红线
 * @param rules 安全红线规则列表
 * @param context 验证上下文
 * @returns 验证结果
 */
export function validateToolCall(
  rules: SafetyRule[],
  context: ValidationContext,
): ValidationResult {
  const { toolName, params } = context;

  // 收集所有匹配的规则
  const matchedRules: SafetyRule[] = [];

  for (const rule of rules) {
    // 检查工具是否适用
    if (!rule.tools.includes(toolName)) continue;

    // 检查参数是否匹配规则模式
    const paramStr = JSON.stringify(params);
    if (rule.pattern && rule.pattern.test(paramStr)) {
      matchedRules.push(rule);
    }
  }

  // 没有匹配规则 → 通过
  if (matchedRules.length === 0) {
    return { passed: true };
  }

  // 取最严重的匹配规则（block > ask > warn）
  const severityOrder: Record<string, number> = { block: 3, ask: 2, warn: 1 };
  const worstRule = matchedRules.reduce((worst, current) => {
    return (severityOrder[current.action] ?? 0) > (severityOrder[worst.action] ?? 0)
      ? current
      : worst;
  });

  const result: ValidationResult = {
    passed: worstRule.action !== "block",
    action: worstRule.action,
    triggeredRule: worstRule,
    reason: worstRule.reason,
    severity: worstRule.severity,
  };

  // ask 级别需要人工确认
  if (worstRule.action === "ask") {
    result.requiresApproval = true;
    result.approvalTitle = "⚠️ 安全红线拦截";
    result.approvalDescription = `${worstRule.reason}\n工具: ${toolName}`;
  }

  return result;
}

/**
 * 验证路径安全性
 */
export function validatePath(pathInput: string, allowedDirs: string[]): boolean {
  const resolved = path.resolve(pathInput);
  return allowedDirs.some((dir) => resolved.startsWith(path.resolve(dir)));
}

/**
 * 验证命令安全性（exec 工具参数检查）
 */
export function validateCommand(command: string): ValidationResult {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        passed: false,
        action: "block",
        reason,
        severity: "critical",
      };
    }
  }

  return { passed: true };
}