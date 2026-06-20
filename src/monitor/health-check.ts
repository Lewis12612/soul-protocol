// ───────────────────────────────────────────────────────────────────────
// 模块健康检查 — 检测灵魂协议关键组件状态
// 段7实现：monitor 进程核心组件
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../utils/logger.js";
import { getTodayStrShort } from "../utils/date.js";

const log = createLogger("monitor:health");

// ── 类型定义 ───────────────────────────────────────────────────────────

export interface HealthReport {
  /** 整体健康状态 */
  healthy: boolean;
  /** 发现的问题列表 */
  issues: string[];
  /** 详细检查结果 */
  details: HealthDetail[];
  /** 检查时间戳 */
  checkedAt: string;
}

export interface HealthDetail {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
}

// ── 公开 API ───────────────────────────────────────────────────────────

/**
 * 检查模块健康状态
 *
 * 检查项：
 * - 关键源文件是否存在
 * - 心跳日志目录是否存在
 * - 日志目录是否有写入权限
 * - 最近心跳日志是否存在
 */
export function checkModuleHealth(workspaceDir: string): HealthReport {
  const details: HealthDetail[] = [];
  const issues: string[] = [];

  // ── 1. 检查关键编译产物 ────────────────────────────────────────

  const criticalFiles = [
    {
      path: "skills/soul-protocol/dist/hub.js",
      name: "灵魂中枢 (hub.js)",
    },
    {
      path: "skills/soul-protocol/dist/protocol.js",
      name: "协议引擎 (protocol.js)",
    },
    {
      path: "skills/soul-protocol/dist/modules/heartbeat.js",
      name: "心跳模块 (heartbeat.js)",
    },
    {
      path: "skills/soul-protocol/dist/modules/hardcoded/index.js",
      name: "硬编码模块 (hardcoded/index.js)",
    },
    {
      path: "skills/soul-protocol/dist/index.js",
      name: "插件入口 (index.js)",
    },
    {
      path: "skills/soul-protocol/dist/parser.js",
      name: "规则解析器 (parser.js)",
    },
    {
      path: "skills/soul-protocol/dist/rules.js",
      name: "规则类型 (rules.js)",
    },
  ];

  for (const file of criticalFiles) {
    const fullPath = path.join(workspaceDir, file.path);
    if (fs.existsSync(fullPath)) {
      details.push({
        name: file.name,
        status: "ok",
        message: "文件存在",
      });
    } else {
      const issue = `缺失关键文件: ${file.path} (${file.name})`;
      details.push({
        name: file.name,
        status: "error",
        message: issue,
      });
      issues.push(issue);
    }
  }

  // ── 2. 检查钩子文件 ────────────────────────────────────────────

  const hookFiles = [
    {
      path: "skills/soul-protocol/dist/hooks/before-prompt-build.js",
      name: "钩子: before_prompt_build",
    },
    {
      path: "skills/soul-protocol/dist/hooks/before-tool-call.js",
      name: "钩子: before_tool_call",
    },
  ];

  for (const file of hookFiles) {
    const fullPath = path.join(workspaceDir, file.path);
    if (fs.existsSync(fullPath)) {
      details.push({
        name: file.name,
        status: "ok",
        message: "钩子文件存在",
      });
    } else {
      const issue = `缺失钩子文件: ${file.path}`;
      details.push({
        name: file.name,
        status: "warning",
        message: issue,
      });
      issues.push(issue);
    }
  }

  // ── 3. 检查心跳日志目录 ────────────────────────────────────────

  const logsDir = path.join(
    workspaceDir,
    "skills",
    "soul-protocol",
    "logs",
  );

  if (fs.existsSync(logsDir)) {
    details.push({
      name: "心跳日志目录",
      status: "ok",
      message: "目录存在",
    });

    // 检查日志目录写入权限
    try {
      const testFile = path.join(logsDir, ".health-check-test");
      fs.writeFileSync(testFile, "", "utf-8");
      fs.unlinkSync(testFile);
      details.push({
        name: "日志目录写入权限",
        status: "ok",
        message: "可写入",
      });
    } catch {
      const issue = "心跳日志目录无写入权限";
      details.push({
        name: "日志目录写入权限",
        status: "error",
        message: issue,
      });
      issues.push(issue);
    }

    // 检查最近日志文件
    const today = getTodayStrShort();
    const todayLog = path.join(logsDir, `heartbeat-${today}.log`);
    if (fs.existsSync(todayLog)) {
      const stats = fs.statSync(todayLog);
      const sizeKB = Math.round(stats.size / 1024);
      details.push({
        name: "今日心跳日志",
        status: "ok",
        message: `存在 (${sizeKB}KB)`,
      });
    } else {
      details.push({
        name: "今日心跳日志",
        status: "warning",
        message: "今日日志不存在（可能尚未执行心跳）",
      });
    }
  } else {
    const issue = "心跳日志目录不存在";
    details.push({
      name: "心跳日志目录",
      status: "warning",
      message: issue,
    });
    issues.push(issue);
  }

  // ── 4. 检查记忆目录 ────────────────────────────────────────────

  const memoryDir = path.join(workspaceDir, "memory");
  if (fs.existsSync(memoryDir)) {
    details.push({
      name: "记忆目录",
      status: "ok",
      message: "目录存在",
    });
  } else {
    details.push({
      name: "记忆目录",
      status: "warning",
      message: "memory 目录不存在",
    });
  }

  // ── 5. 检查 .heartbeat 状态目录 ────────────────────────────────

  const heartbeatDir = path.join(workspaceDir, "memory", ".heartbeat");
  if (fs.existsSync(heartbeatDir)) {
    details.push({
      name: "心跳状态目录",
      status: "ok",
      message: "目录存在",
    });
  } else {
    details.push({
      name: "心跳状态目录",
      status: "ok",
      message: ".heartbeat 目录不存在（首次运行时自动创建）",
    });
  }

  // ── 汇总 ────────────────────────────────────────────────────────

  const hasErrors = details.some((d) => d.status === "error");

  return {
    healthy: !hasErrors,
    issues,
    details,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * 生成可读的健康报告文本
 */
export function formatHealthReport(report: HealthReport): string {
  const lines: string[] = [];

  lines.push(`# 🔍 模块健康检查报告`);
  lines.push(``);
  lines.push(`**检查时间**: ${report.checkedAt}`);
  lines.push(`**整体状态**: ${report.healthy ? "✅ 健康" : "❌ 异常"}`);
  lines.push(`**问题数量**: ${report.issues.length}`);
  lines.push(``);

  // 按状态分组
  const okItems = report.details.filter((d) => d.status === "ok");
  const warnItems = report.details.filter((d) => d.status === "warning");
  const errorItems = report.details.filter((d) => d.status === "error");

  if (okItems.length > 0) {
    lines.push(`## ✅ 正常项 (${okItems.length})`);
    lines.push(``);
    for (const item of okItems) {
      lines.push(`- ${item.name}: ${item.message}`);
    }
    lines.push(``);
  }

  if (warnItems.length > 0) {
    lines.push(`## ⚠️ 警告项 (${warnItems.length})`);
    lines.push(``);
    for (const item of warnItems) {
      lines.push(`- ${item.name}: ${item.message}`);
    }
    lines.push(``);
  }

  if (errorItems.length > 0) {
    lines.push(`## ❌ 错误项 (${errorItems.length})`);
    lines.push(``);
    for (const item of errorItems) {
      lines.push(`- ${item.name}: ${item.message}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * 写入健康报告到文件
 */
export function writeHealthReport(
  workspaceDir: string,
  report: HealthReport,
): void {
  const reportDir = path.join(workspaceDir, "memory", ".heartbeat");
  const reportFile = path.join(reportDir, "health-report.json");

  try {
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");
    log.info("✅ 健康报告已写入", { reportFile });
  } catch (err) {
    log.error("健康报告写入失败", { error: String(err) });
  }
}

// ── 内部工具函数 ───────────────────────────────────────────────────────
