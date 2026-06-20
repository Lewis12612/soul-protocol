// ───────────────────────────────────────────────────────────────────────
// 文件解析器 — 从身份层文件解析出结构化规则对象
// 输入: AGENTS.md / SOUL.md / MEMORY.md / IDENTITY.md / USER.md
// 输出: ParsedRules
// ───────────────────────────────────────────────────────────────────────

import * as path from "path";
import type {
  ParsedRules,
  SafetyRule,
  StartupConfig,
  MemoryRule,
  ExecutionLesson,
  PersonalityParams,
  Relationship认知,
  EndOfDayConfig,
  EndOfDayStep,
} from "./rules.js";
import { DEFAULT_SAFETY_RULES, THREE_NO_PRINCIPLES } from "./rules.js";
import { safeReadFile, fileExists, getFileMtime } from "./utils/file-reader.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("parser");

/** 转义正则元字符，防止注入 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ───────────────────────────────────────────────────────────────────────
// 主解析函数
// ───────────────────────────────────────────────────────────────────────

export interface ParserOptions {
  /** 工作目录 */
  workspaceDir: string;
  /** 是否使用默认规则（文件解析失败时降级） */
  useDefaults?: boolean;
  /** 严格模式：解析失败时是否报错 */
  strict?: boolean;
}

/**
 * 解析所有身份层文件，生成规则对象
 * 降级策略：单个文件解析失败不影响整体，使用默认规则
 */
export function parseIdentityFiles(options: ParserOptions): ParsedRules {
  const { workspaceDir, useDefaults = true, strict = false } = options;
  const timestamp = Date.now();

  log.info("开始解析身份层文件", { workspaceDir });

  const fileStatus: Record<string, { exists: boolean; modifiedAt: number | null }> = {};

  // 1. 解析 SOUL.md → 安全红线 + 人格预设
  const soulResult = parseSoulMd(workspaceDir);
  fileStatus["SOUL.md"] = soulResult.fileStatus;

  // 2. 解析 AGENTS.md → 启动流程 + 记忆规则
  const agentsResult = parseAgentsMd(workspaceDir);
  fileStatus["AGENTS.md"] = agentsResult.fileStatus;

  // 3. 解析 MEMORY.md → 执行教训 + 日终流程
  const memoryResult = parseMemoryMd(workspaceDir);
  fileStatus["MEMORY.md"] = memoryResult.fileStatus;

  // 4. 解析 IDENTITY.md → 人格参数
  const identityResult = parseIdentityMd(workspaceDir);
  fileStatus["IDENTITY.md"] = identityResult.fileStatus;

  // 5. 解析 USER.md → 关系认知
  const userResult = parseUserMd(workspaceDir);
  fileStatus["USER.md"] = userResult.fileStatus;

  // 合并结果（解析失败时使用默认值）
  const rules: ParsedRules = {
    safetyRules: soulResult.safetyRules.length > 0 ? soulResult.safetyRules : (useDefaults ? DEFAULT_SAFETY_RULES : []),
    personalityPreset: soulResult.personalityPreset,
    startupConfig: agentsResult.startupConfig,
    memoryRules: agentsResult.memoryRules,
    executionLessons: memoryResult.executionLessons.length > 0
      ? memoryResult.executionLessons
      : (useDefaults ? THREE_NO_PRINCIPLES : []),
    endOfDayConfig: memoryResult.endOfDayConfig,
    personalityParams: identityResult.personalityParams,
    relationship: userResult.relationship,
    parseTimestamp: timestamp,
    fileStatus,
  };

  log.info("身份层文件解析完成", {
    safetyRules: rules.safetyRules.length,
    memoryRules: rules.memoryRules.length,
    executionLessons: rules.executionLessons.length,
    hasStartupConfig: !!rules.startupConfig,
    hasPersonalityParams: !!rules.personalityParams,
    hasRelationship: !!rules.relationship,
  });

  return rules;
}

// ───────────────────────────────────────────────────────────────────────
// SOUL.md 解析器
// ───────────────────────────────────────────────────────────────────────

interface SoulParseResult {
  safetyRules: SafetyRule[];
  personalityPreset: string;
  fileStatus: { exists: boolean; modifiedAt: number | null };
}

function parseSoulMd(workspaceDir: string): SoulParseResult {
  const filePath = path.resolve(workspaceDir, "SOUL.md");
  const exists = fileExists(filePath, workspaceDir);
  const modifiedAt = exists ? getFileMtime(filePath, workspaceDir) : null;

  if (!exists) {
    log.warn("SOUL.md 不存在，使用默认安全规则");
    return {
      safetyRules: [],
      personalityPreset: "",
      fileStatus: { exists: false, modifiedAt: null },
    };
  }

  const result = safeReadFile(filePath, workspaceDir);
  if (!result.ok) {
    log.error("SOUL.md 读取失败", { error: result.error });
    return {
      safetyRules: [],
      personalityPreset: "",
      fileStatus: { exists: true, modifiedAt },
    };
  }

  const content = result.content;

  // 提取安全红线部分
  const safetyRules = extractSafetyRules(content);

  // 提取人格预设
  const personalityPreset = extractSection(content, "核心人格") ?? "";

  return {
    safetyRules,
    personalityPreset,
    fileStatus: { exists: true, modifiedAt },
  };
}

/** 从 SOUL.md 提取安全红线规则 */
function extractSafetyRules(content: string): SafetyRule[] {
  const rules: SafetyRule[] = [];

  // 匹配安全红线区域
  const safetySection = extractSectionBetween(content, "安全红线", "行为准则");
  if (!safetySection) {
    log.debug("未找到安全红线区域");
    return [];
  }

  // 解析编号列表 — 允许 `-` 分隔和可选的 `**` 包裹
  const lineRegex = /^(\d+)\.\s*(?:\*\*([^*]+)\*\*|([^：:-]+))[：:-]\s*(.+)$/gm;
  let match;

  while ((match = lineRegex.exec(safetySection)) !== null) {
    const id = match[1];
    // match[2] = bold title, match[3] = plain title
    const title = (match[2] ?? match[3]).trim();
    const description = match[4].trim();

    // 根据关键词推断适用的工具和动作
    const { tools, action } = inferToolAndAction(title, description);

    const pattern = buildPattern(title, description);
    // 跳过无匹配关键词的规则（Issue #4: 避免空正则匹配一切）
    if (!pattern) {
      log.debug(`安全红线 ${id} 无匹配关键词，跳过`, { title });
      continue;
    }

    rules.push({
      id: `safety_${id}`,
      pattern,
      tools,
      action,
      reason: `安全红线：${title}`,
      severity: action === "block" ? "critical" : "warning",
    });
  }

  log.info(`从 SOUL.md 解析 ${rules.length} 条安全红线`);
  return rules;
}

/** 从文本推断适用的工具和动作 */
function inferToolAndAction(title: string, description: string): { tools: string[]; action: "block" | "ask" | "warn" } {
  const text = `${title} ${description}`.toLowerCase();

  if (/不.*访问|不.*读取|不.*存储|不.*传输|禁止|不开放/.test(text)) {
    return { tools: ["exec", "bash", "read", "write"], action: "block" };
  }
  if (/需.*确认|需.*授权|双重确认|需.*告知/.test(text)) {
    return { tools: ["exec", "bash"], action: "ask" };
  }
  if (/用.*不用|优先/.test(text)) {
    return { tools: ["exec", "bash"], action: "warn" };
  }
  return { tools: ["exec", "bash"], action: "warn" };
}

/** 构建正则模式 — 返回 null 表示无匹配关键词，调用方应跳过 */
function buildPattern(title: string, description: string): RegExp | null {
  // 根据规则内容构建简单的关键词匹配
  const keywords: string[] = [];

  if (/git|推送|分支|历史/.test(title)) {
    keywords.push("git", "--force", "-f", "delete", "rebase");
  }
  if (/ssh|密钥/.test(title)) {
    keywords.push(".ssh", "id_rsa", "known_hosts");
  }
  if (/aws|凭证|token/.test(title)) {
    keywords.push(".aws", "credentials", "access_key");
  }
  if (/删除|trash|rm/.test(title)) {
    keywords.push("rm -rf", "rm -fr", "trash");
  }
  if (/sudo|权限/.test(title)) {
    keywords.push("sudo", "elevated");
  }
  if (/端口|网络|gateway/.test(title)) {
    keywords.push("port", "0.0.0.0", "gateway");
  }
  if (/配置|备份/.test(title)) {
    keywords.push("config", "backup");
  }
  if (/安装|npm|apt/.test(title)) {
    keywords.push("install", "npm", "apt", "brew");
  }

  if (keywords.length === 0) {
    // 无关键词 → 返回 null，避免 new RegExp("", "i") 匹配一切
    return null;
  }

  return new RegExp(keywords.map(escapeRegExp).join("|"), "i");
}

// ───────────────────────────────────────────────────────────────────────
// AGENTS.md 解析器
// ───────────────────────────────────────────────────────────────────────

interface AgentsParseResult {
  startupConfig: StartupConfig | null;
  memoryRules: MemoryRule[];
  fileStatus: { exists: boolean; modifiedAt: number | null };
}

function parseAgentsMd(workspaceDir: string): AgentsParseResult {
  const filePath = path.resolve(workspaceDir, "AGENTS.md");
  const exists = fileExists(filePath, workspaceDir);
  const modifiedAt = exists ? getFileMtime(filePath, workspaceDir) : null;

  if (!exists) {
    log.warn("AGENTS.md 不存在");
    return {
      startupConfig: null,
      memoryRules: [],
      fileStatus: { exists: false, modifiedAt: null },
    };
  }

  const result = safeReadFile(filePath, workspaceDir);
  if (!result.ok) {
    log.error("AGENTS.md 读取失败", { error: result.error });
    return {
      startupConfig: null,
      memoryRules: [],
      fileStatus: { exists: true, modifiedAt },
    };
  }

  const content = result.content;

  // 提取启动流程配置
  const startupConfig = extractStartupConfig(content);

  // 提取记忆规则
  const memoryRules = extractMemoryRules(content);

  return {
    startupConfig,
    memoryRules,
    fileStatus: { exists: true, modifiedAt },
  };
}

/** 提取启动流程配置（Step 1-6） */
function extractStartupConfig(content: string): StartupConfig | null {
  // 读取顺序部分
  const readOrderSection = extractSectionBetween(content, "Session Startup", "---");
  if (!readOrderSection) return null;

  const steps: Array<{ step: number; file: string; label: string; description: string }> = [];

  // 匹配 "1. SOUL.md → 我是谁" 格式
  const stepRegex = /^(\d+)\.\s+(\S+\.md)\s+.*?[→=]\s*(.+)$/gm;
  let match;

  while ((match = stepRegex.exec(readOrderSection)) !== null) {
    steps.push({
      step: parseInt(match[1], 10),
      file: match[2],
      label: match[2],
      description: match[3].trim(),
    });
  }

  if (steps.length === 0) return null;

  // Step 6: 状态验证
  const step6Section = extractSection(content, "Step 6");
  const step6: any = {
    step: 6,
    file: "验证",
    label: "状态验证",
    description: "验证 EXTRA路径、今日L2、心跳状态",
    optional: false,
  };

  const allSteps = [...steps.map(s => ({ ...s, optional: false })), step6];
  const readOrder = allSteps.map(s => s.file);

  return {
    steps: allSteps,
    readOrder,
  };
}

/** 提取记忆规则 */
function extractMemoryRules(content: string): MemoryRule[] {
  const rules: MemoryRule[] = [];
  const memorySection = extractSection(content, "记忆规则");

  if (!memorySection) {
    log.debug("未找到记忆规则区域");
    return [];
  }

  // 匹配 "1. **会话前读取**: 先读取..." 格式
  const ruleRegex = /^(\d+)\.\s*\*\*([^*]+)\*\*[：:]\s*(.+)$/gm;
  let match;
  let priority = 0;

  while ((match = ruleRegex.exec(memorySection)) !== null) {
    priority++;
    rules.push({
      id: `memory_${match[1]}`,
      description: match[2].trim(),
      trigger: match[2].trim(),
      action: match[3].trim(),
      priority,
    });
  }

  log.info(`从 AGENTS.md 解析 ${rules.length} 条记忆规则`);
  return rules;
}

// ───────────────────────────────────────────────────────────────────────
// MEMORY.md 解析器
// ───────────────────────────────────────────────────────────────────────

interface MemoryParseResult {
  executionLessons: ExecutionLesson[];
  endOfDayConfig: EndOfDayConfig | null;
  fileStatus: { exists: boolean; modifiedAt: number | null };
}

function parseMemoryMd(workspaceDir: string): MemoryParseResult {
  const filePath = path.resolve(workspaceDir, "MEMORY.md");
  const exists = fileExists(filePath, workspaceDir);
  const modifiedAt = exists ? getFileMtime(filePath, workspaceDir) : null;

  if (!exists) {
    log.warn("MEMORY.md 不存在");
    return {
      executionLessons: [],
      endOfDayConfig: null,
      fileStatus: { exists: false, modifiedAt: null },
    };
  }

  const result = safeReadFile(filePath, workspaceDir);
  if (!result.ok) {
    log.error("MEMORY.md 读取失败", { error: result.error });
    return {
      executionLessons: [],
      endOfDayConfig: null,
      fileStatus: { exists: true, modifiedAt },
    };
  }

  const content = result.content;

  // 提取执行教训（三不原则）
  const executionLessons = extractExecutionLessons(content);

  // 提取日终流程配置
  const endOfDayConfig = extractEndOfDayConfig(content);

  return {
    executionLessons,
    endOfDayConfig,
    fileStatus: { exists: true, modifiedAt },
  };
}

/** 提取执行教训（三不原则） */
function extractExecutionLessons(content: string): ExecutionLesson[] {
  const lessons: ExecutionLesson[] = [];

  // 匹配三不原则表格
  const principleSection = extractSection(content, "三不原则");
  if (!principleSection) {
    log.debug("未找到三不原则区域");
    return [];
  }

  // 匹配表格行
  const rowRegex = /\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
  let match;

  while ((match = rowRegex.exec(principleSection)) !== null) {
    lessons.push({
      id: match[1].trim().replace(/\s+/g, "_").toLowerCase(),
      principle: match[1].trim(),
      description: match[2].trim(),
      violationHandling: match[3].trim(),
    });
  }

  log.info(`从 MEMORY.md 解析 ${lessons.length} 条执行教训`);
  return lessons;
}

/** 提取日终流程配置 — 支持 Step 0-9（10步完整解析） */
function extractEndOfDayConfig(content: string): EndOfDayConfig | null {
  const eodSection = extractSection(content, "日终执行顺序");
  if (!eodSection) {
    // 尝试从整个 MEMORY.md 内容中提取（兼容不同标题格式）
    return extractEndOfDayConfigFromContent(content);
  }

  return extractEndOfDayConfigFromContent(eodSection);
}

/**
 * 从文本中提取日终流程步骤
 *
 * 支持多种格式：
 * - "Step 0：L2跨日交接 → 写入跨日交接部分"
 * - "Step 1: 写日记"
 * - "Step 2 → 清理收尾"
 * - 表格行格式: "| Step 3 | 动作 | 说明 |"
 */
function extractEndOfDayConfigFromContent(section: string): EndOfDayConfig | null {
  const steps: EndOfDayStep[] = [];

  // 格式1: "Step N：动作 — 说明" 或 "Step N: 动作 — 说明"
  const stepRegex1 = /Step\s*(\d+)\s*[：:]\s*([^\n—→]+?)\s*(?:—\s*([^\n]+))?/g;
  let match;

  while ((match = stepRegex1.exec(section)) !== null) {
    const stepNum = parseInt(match[1], 10);
    const action = match[2].trim();
    const description = match[3] ? match[3].trim() : action;

    // 去重：如果已有该 step，跳过
    if (!steps.find(s => s.step === stepNum)) {
      steps.push({
        step: stepNum,
        action,
        description,
        mandatory: true,
      });
    }
  }

  // 格式2: 表格行 "| Step N | 动作 | 说明 |"
  const tableRegex = /\|\s*Step\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
  while ((match = tableRegex.exec(section)) !== null) {
    const stepNum = parseInt(match[1], 10);
    const action = match[2].trim();
    const description = match[3].trim();

    if (!steps.find(s => s.step === stepNum)) {
      steps.push({
        step: stepNum,
        action,
        description,
        mandatory: true,
      });
    }
  }

  // 格式3: "Step N → 动作"（箭头格式）
  const arrowRegex = /Step\s*(\d+)\s*→\s*([^\n]+)/g;
  while ((match = arrowRegex.exec(section)) !== null) {
    const stepNum = parseInt(match[1], 10);
    const action = match[2].trim();

    if (!steps.find(s => s.step === stepNum)) {
      steps.push({
        step: stepNum,
        action,
        description: action,
        mandatory: true,
      });
    }
  }

  // 如果没找到任何步骤，返回 null
  if (steps.length === 0) return null;

  // 按 step 编号排序
  steps.sort((a, b) => a.step - b.step);

  // 确保至少有 Step 0-8（9步默认配置），用默认值补充缺失的
  const defaultActions: Record<number, { action: string; description: string }> = {
    0: { action: "L2跨日交接", description: "写入跨日交接部分" },
    1: { action: "写日记", description: "写入当日日记" },
    2: { action: "L3归档", description: "归档工作项目到L3" },
    3: { action: "记忆整理", description: "整理和压缩记忆" },
    4: { action: "待办清理", description: "清理已完成待办" },
    5: { action: "状态检查", description: "检查系统状态" },
    6: { action: "日志归档", description: "归档当日日志" },
    7: { action: "清理收尾", description: "清理临时文件" },
    8: { action: "总结汇报", description: "生成日终总结" },
  };

  for (let i = 0; i <= 8; i++) {
    if (!steps.find(s => s.step === i) && defaultActions[i]) {
      steps.push({
        step: i,
        action: defaultActions[i].action,
        description: defaultActions[i].description,
        mandatory: false,
      });
    }
  }

  // 重新排序
  steps.sort((a, b) => a.step - b.step);

  log.info(`提取日终流程配置: ${steps.length} 步`);

  return {
    steps,
    executionOrder: "sequential",
  };
}

// ───────────────────────────────────────────────────────────────────────
// IDENTITY.md 解析器
// ───────────────────────────────────────────────────────────────────────

interface IdentityParseResult {
  personalityParams: PersonalityParams | null;
  fileStatus: { exists: boolean; modifiedAt: number | null };
}

function parseIdentityMd(workspaceDir: string): IdentityParseResult {
  const filePath = path.resolve(workspaceDir, "IDENTITY.md");
  const exists = fileExists(filePath, workspaceDir);
  const modifiedAt = exists ? getFileMtime(filePath, workspaceDir) : null;

  if (!exists) {
    log.warn("IDENTITY.md 不存在");
    return {
      personalityParams: null,
      fileStatus: { exists: false, modifiedAt: null },
    };
  }

  const result = safeReadFile(filePath, workspaceDir);
  if (!result.ok) {
    log.error("IDENTITY.md 读取失败", { error: result.error });
    return {
      personalityParams: null,
      fileStatus: { exists: true, modifiedAt },
    };
  }

  const content = result.content;
  const params = extractPersonalityParams(content);

  return {
    personalityParams: params,
    fileStatus: { exists: true, modifiedAt },
  };
}

/** 提取人格参数 */
function extractPersonalityParams(content: string): PersonalityParams | null {
  const extract = (key: string): string => {
    const regex = new RegExp(`-\\s*\\*?${escapeRegExp(key)}\\*?\\s*[:：]\\s*(.+)`, "i");
    const match = content.match(regex);
    return match ? match[1].trim() : "";
  };

  const name = extract("Name");
  if (!name) return null;

  return {
    name,
    creature: extract("Creature"),
    vibe: extract("Vibe"),
    emoji: extract("Emoji"),
    surface: extract("表面") || "",
    core: extract("内核") || "",
    style: extract("风格") || "",
  };
}

// ───────────────────────────────────────────────────────────────────────
// USER.md 解析器
// ───────────────────────────────────────────────────────────────────────

interface UserParseResult {
  relationship: Relationship认知 | null;
  fileStatus: { exists: boolean; modifiedAt: number | null };
}

function parseUserMd(workspaceDir: string): UserParseResult {
  const filePath = path.resolve(workspaceDir, "USER.md");
  const exists = fileExists(filePath, workspaceDir);
  const modifiedAt = exists ? getFileMtime(filePath, workspaceDir) : null;

  if (!exists) {
    log.warn("USER.md 不存在");
    return {
      relationship: null,
      fileStatus: { exists: false, modifiedAt: null },
    };
  }

  const result = safeReadFile(filePath, workspaceDir);
  if (!result.ok) {
    log.error("USER.md 读取失败", { error: result.error });
    return {
      relationship: null,
      fileStatus: { exists: true, modifiedAt },
    };
  }

  const content = result.content;
  const relationship = extractRelationship(content);

  return {
    relationship,
    fileStatus: { exists: true, modifiedAt },
  };
}

/** 提取关系认知 */
function extractRelationship(content: string): Relationship认知 | null {
  const extract = (key: string): string => {
    const regex = new RegExp(`-\\s*\\*?${escapeRegExp(key)}\\*?\\s*[:：]\\s*(.+)`, "i");
    const match = content.match(regex);
    return match ? match[1].trim() : "";
  };

  const name = extract("Name");
  if (!name) return null;

  // 提取关系定位
  const relMatch = content.match(/>\s*\*\*([^*]+)\*\*/);
  const relationship = relMatch ? relMatch[1].trim() : "";

  // 提取沟通风格列表
  const styleSection = extractSection(content, "沟通风格");
  const communicationStyle: string[] = [];
  if (styleSection) {
    const styleLines = styleSection.match(/^- .+$/gm);
    if (styleLines) {
      communicationStyle.push(...styleLines.map(l => l.replace(/^- /, "").trim()));
    }
  }

  // 提取相处改进
  const improvementAreas: Array<{ problem: string; feedback: string; action: string }> = [];
  const improvementSection = extractSection(content, "相处改进");
  if (improvementSection) {
    const rowRegex = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
    let match;
    while ((match = rowRegex.exec(improvementSection)) !== null) {
      improvementAreas.push({
        problem: match[1].trim(),
        feedback: match[2].trim(),
        action: match[3].trim(),
      });
    }
  }

  return {
    name,
    title: extract("称呼"),
    timezone: extract("Timezone"),
    occupation: extract("Occupation"),
    relationship,
    communicationStyle,
    improvementAreas,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 通用文本提取工具
// ───────────────────────────────────────────────────────────────────────

/** 提取两个标题之间的内容 */
function extractSectionBetween(content: string, startMarker: string, endMarker: string): string | null {
  const lines = content.split("\n");
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(startMarker) && startIdx === -1) {
      startIdx = i;
    }
    if (startIdx !== -1 && i > startIdx && lines[i].match(/^---\s*$/)) {
      endIdx = i;
      break;
    }
    if (startIdx !== -1 && i > startIdx && lines[i].match(/^## /)) {
      endIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  return lines.slice(startIdx, endIdx).join("\n");
}

/** 提取指定标题下的内容 */
function extractSection(content: string, sectionTitle: string): string | null {
  const lines = content.split("\n");
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(sectionTitle) && (lines[i].startsWith("##") || lines[i].startsWith("###"))) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  // 找到下一个同级或更高级标题
  const headerLevel = lines[startIdx].match(/^(#+)/)?.[1]?.length ?? 2;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= headerLevel) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join("\n");
}
