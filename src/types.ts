// ───────────────────────────────────────────────────────────────────────
// 类型定义 — OpenClaw 插件钩子类型（与 OpenClaw 核心类型对齐）
// ───────────────────────────────────────────────────────────────────────

// ── 通用上下文 ────────────────────────────────────────────────────────

/** Agent 钩子通用上下文 */
export type PluginHookAgentContext = {
  runId?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
};

/** 工具钩子上下文 */
export type PluginHookToolContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
};

// ── before_prompt_build ───────────────────────────────────────────────

export type PluginHookBeforePromptBuildEvent = {
  prompt: string;
  messages: unknown[];
};

export type PluginHookBeforePromptBuildResult = {
  systemPrompt?: string;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
};

// ── before_model_resolve ──────────────────────────────────────────────

export type PluginHookBeforeModelResolveEvent = {
  prompt: string;
};

export type PluginHookBeforeModelResolveResult = {
  modelOverride?: string;
  providerOverride?: string;
};

// ── before_tool_call ──────────────────────────────────────────────────

export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
};

export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  requireApproval?: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    timeoutBehavior?: "allow" | "deny";
    pluginId?: string;
    onResolution?: (decision: string) => Promise<void> | void;
  };
};

// ── 插件 API ──────────────────────────────────────────────────────────

// ── V3.8.6 场景分发类型 ────────────────────────────────────────────────

/** 场景类型 */
export type ScenarioType = "startup" | "heartbeat" | "recovery" | "conversation";

/** 分发上下文（简化版） */
export interface DispatchContext {
  scenario: ScenarioType;
  trigger: string;
  checkType?: "light" | "medium" | "full";
  workspaceDir: string;
  result?: Record<string, unknown>;
  /** V3.8.8-beta3: 用户消息文本（conversation 场景时传入，用于 intent-resolver） */
  userMessage?: string;
}

/** 场景处理器 */
export interface ScenarioHandler {
  name: string;
  execute: (ctx: DispatchContext) => Promise<{ output?: string; data?: unknown }>;
}

// ── 插件 API ──────────────────────────────────────────────────────────

export type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: string;
  config: {
    workspace?: {
      dir?: string;
    };
    [key: string]: unknown;
  };
  pluginConfig?: Record<string, unknown>;
  logger: {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  runtime: {
    version: string;
    [key: string]: unknown;
  };
  on: <K extends string>(
    hookName: K,
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ) => void;
  registerTool: (
    tool: PluginToolDefinition | PluginToolFactory,
    opts?: PluginToolOptions,
  ) => void;
};

// ── 工具类型 ──────────────────────────────────────────────────────────

/** 工具定义（与 OpenClaw AnyAgentTool 结构兼容） */
export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  ownerOnly?: boolean;
}

/** 工具工厂函数（延迟初始化，可接收上下文） */
export type PluginToolFactory = (
  ctx: Record<string, unknown>,
) => PluginToolDefinition | PluginToolDefinition[] | null | undefined;

/** 工具注册选项 */
export interface PluginToolOptions {
  optional?: boolean;
  name?: string;
  names?: string[];
}
