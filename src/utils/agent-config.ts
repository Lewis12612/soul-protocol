// ───────────────────────────────────────────────────────────────────────
// Agent 配置模块 — 从 plugin.json 读取 Agent 名称和路径参数
//
// V3.8.8：替代硬编码 "your-agent" / "your-dream-agent" / EXTRA 路径
// 部署到新 agent 时只需修改 plugin.json，无需改代码
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

// ── 配置结构 ────────────────────────────────────────────────────────────

interface AgentConfig {
  /** Agent 自身名称（用于协议中的 executor 标记） */
  agentName: string;
  /** 梦 Agent 名称（用于 spawn:梦 的 executor 标记） */
  dreamAgentName: string;
  /** EXTRA 对话日志基础路径（不含日期子目录） */
  extraBasePath: string;
}

// ── 缓存 ────────────────────────────────────────────────────────────────

let _config: AgentConfig | null = null;

// ── 默认值（兜底） ──────────────────────────────────────────────────────

const DEFAULTS: AgentConfig = {
  agentName: "agent",
  dreamAgentName: "agent的梦",
  extraBasePath: "/tmp/openclaw-dialogue-logs",
};

// ── 公开 API ────────────────────────────────────────────────────────────

/**
 * 初始化配置（在插件入口调用一次）
 * @param workspaceDir 工作目录，用于定位 plugin.json
 */
export function initAgentConfig(workspaceDir: string): void {
  if (_config) return; // 已初始化

  const configPath = path.join(
    workspaceDir,
    "skills",
    "soul-protocol",
    "openclaw.plugin.json",
  );

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const agentConfig = (parsed as any).agentConfig as Partial<AgentConfig> | undefined;

      _config = {
        agentName: agentConfig?.agentName || DEFAULTS.agentName,
        dreamAgentName: agentConfig?.dreamAgentName || DEFAULTS.dreamAgentName,
        extraBasePath: agentConfig?.extraBasePath || DEFAULTS.extraBasePath,
      };
    } else {
      _config = { ...DEFAULTS };
    }
  } catch (err) {
    // 降级到默认值
    _config = { ...DEFAULTS };
  }
}

/** 获取 Agent 自身名称（如 "your-agent"） */
export function getAgentName(): string {
  return _config?.agentName || DEFAULTS.agentName;
}

/** 获取梦 Agent 名称（如 "your-dream-agent"） */
export function getDreamAgentName(): string {
  return _config?.dreamAgentName || DEFAULTS.dreamAgentName;
}

/** 获取 spawn executor 标记（如 "spawn:your-dream-agent"） */
export function getSpawnExecutor(): string {
  return `spawn:${getDreamAgentName()}`;
}

/** 获取 EXTRA 对话日志基础路径 */
export function getExtraBasePath(): string {
  return _config?.extraBasePath || DEFAULTS.extraBasePath;
}
