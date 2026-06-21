// ───────────────────────────────────────────────────────────────────────
// 规则对象定义 — 从身份层文件解析出的结构化规则
// ───────────────────────────────────────────────────────────────────────

/** 安全红线规则 */
export interface SafetyRule {
  id: string;
  pattern: RegExp | null;
  tools: string[];
  action: "block" | "ask" | "warn";
  reason: string;
  severity?: "info" | "warning" | "critical";
}

/** 记忆规则 */
export interface MemoryRule {
  id: string;
  description: string;
  trigger: string;
  action: string;
  priority: number;
}

/** 启动流程步骤 */
export interface StartupStep {
  step: number;
  file: string;
  label: string;
  description: string;
  optional: boolean;
}

/** 启动流程配置 */
export interface StartupConfig {
  steps: StartupStep[];
  readOrder: string[];
}

/** 执行教训 */
export interface ExecutionLesson {
  id: string;
  principle: string;
  description: string;
  violationHandling: string;
}

/** 人格参数 */
export interface PersonalityParams {
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  surface: string;
  core: string;
  style: string;
}

/** 关系认知 */
export interface Relationship认知 {
  name: string;
  title: string;
  timezone: string;
  occupation: string;
  relationship: string;
  communicationStyle: string[];
  improvementAreas: Array<{ problem: string; feedback: string; action: string }>;
}

/** 日终流程步骤 */
export interface EndOfDayStep {
  step: number;
  action: string;
  description: string;
  mandatory: boolean;
}

/** 日终流程配置 */
export interface EndOfDayConfig {
  steps: EndOfDayStep[];
  executionOrder: string;
}

/** 心跳检查配置 */
export interface HeartbeatConfig {
  intervalMinutes: number;
  lightCheckThreshold: number; // 小时
  actions: string[];
}

/** 解析结果 — 包含所有规则对象 */
export interface ParsedRules {
  // 来自 SOUL.md
  safetyRules: SafetyRule[];
  personalityPreset: string;

  // 来自 AGENTS.md
  startupConfig: StartupConfig | null;
  memoryRules: MemoryRule[];

  // 来自 MEMORY.md
  executionLessons: ExecutionLesson[];
  endOfDayConfig: EndOfDayConfig | null;

  // 来自 IDENTITY.md
  personalityParams: PersonalityParams | null;

  // 来自 USER.md
  relationship: Relationship认知 | null;

  // 元数据
  parseTimestamp: number;
  fileStatus: Record<string, { exists: boolean; modifiedAt: number | null }>;
}

/** 安全红线预定义规则（从 SOUL.md 解析） */
export const DEFAULT_SAFETY_RULES: SafetyRule[] = [
  {
    id: "git_force",
    pattern: /git\s+.*(--force|-f)\b/,
    tools: ["exec", "bash"],
    action: "block",
    reason: "安全红线：不强制推送、不删除分支",
    severity: "critical",
  },
  {
    id: "git_delete_branch",
    pattern: /git\s+(branch|push).*(-d|--delete|:)/,
    tools: ["exec", "bash"],
    action: "block",
    reason: "安全红线：不删除分支",
    severity: "critical",
  },
  {
    id: "git_rewrite_history",
    pattern: /git\s+.*(rebase|filter-branch|reflog\s+expire)/,
    tools: ["exec", "bash"],
    action: "block",
    reason: "安全红线：不重写历史",
    severity: "critical",
  },
  {
    id: "ssh_access",
    pattern: /~\/\.ssh\//,
    tools: ["exec", "bash", "read"],
    action: "block",
    reason: "安全红线：不访问 ~/.ssh/",
    severity: "critical",
  },
  {
    id: "aws_access",
    pattern: /~\/\.aws\//,
    tools: ["exec", "bash", "read"],
    action: "block",
    reason: "安全红线：不访问 ~/.aws/",
    severity: "critical",
  },
  {
    id: "rm_command",
    pattern: /\brm\s+(-rf|-fr)\b/,
    tools: ["exec", "bash"],
    action: "ask",
    reason: "安全红线：用 trash 不用 rm，大批量删除需确认",
    severity: "warning",
  },
  {
    id: "sudo_command",
    pattern: /\bsudo\b/,
    tools: ["exec", "bash"],
    action: "ask",
    reason: "安全红线：sudo 操作需双重确认",
    severity: "warning",
  },
  {
    id: "npm_install_global",
    pattern: /npm\s+install\s+(-g|--global)/,
    tools: ["exec", "bash"],
    action: "ask",
    reason: "安全红线：安装软件需事先明确授权",
    severity: "info",
  },
];

/** 三不原则（从 MEMORY.md 解析） */
export const THREE_NO_PRINCIPLES: ExecutionLesson[] = [
  {
    id: "no_verify_no_report",
    principle: "不验证不汇报",
    description: "汇报前必须有验证证据",
    violationHandling: "报告标注'待验证'",
  },
  {
    id: "no_confirm_no_act",
    principle: "不确认不动手",
    description: "操作前确认用户意图",
    violationHandling: "暂停，询问",
  },
  {
    id: "no_source_no_config",
    principle: "不查源码不改配置",
    description: "配置修改前先查文档/源码",
    violationHandling: "先备份，再修改",
  },
];
