// ───────────────────────────────────────────────────────────────────────
// Protocol 模块 — 协议提示词构建（段3实现）
// 从 before-prompt-build.ts 提取的协议层逻辑
// ───────────────────────────────────────────────────────────────────────

import { getTodayStr } from "./modules/memory/reader.js";
import type { SleepinessState } from "./modules/heartbeat.js";
import { getAgentName, getSpawnExecutor } from "./utils/agent-config.js";

// ── 协议层类型定义 ──────────────────────────────────────────────────────

interface ProtocolPrompt {
  protocol_id: string; // LP-{date} / MP-{date} / FP-{date}
  protocol_type: "light" | "medium" | "full" | "weekly";
  check_result: Record<string, unknown>;
  segment?: {
    message_count: number;
    segment_mode: boolean;
    segment_count: number;
    segment_threshold: number;
  };
  actions: Array<{
    id: string;
    name: string;
    reason: string;
    output_format: string;
    timeout?: string;
    segment?: boolean;
    /** 执行者：agent / spawn:agent-dream */
    executor?: string;
    /** spawn指令（当executor包含spawn时） */
    spawn_instruction?: string;
    /** 具体操作指引（替换extraction_guide） */
    operation_guide?: string;
  }>;
  protocol_declaration: {
    completion_mark: string;
    mandatory: boolean;
  };
}

// ── 公开 API ───────────────────────────────────────────────────────────

/**
 * 统一入口 — 根据检查类型构建协议提示词
 * @param checkType 检查类型
 * @param result 检查结果（来自检查脚本的 JSON 输出）
 * @param workspaceDir 工作目录（full 检查时需要）
 * @param sleepiness 睡意状态（可选，影响协议语气）
 * @returns 协议提示词字符串
 */
export function buildProtocol(
  checkType: "light" | "medium" | "full",
  result: Record<string, unknown>,
  workspaceDir?: string,
  sleepiness?: SleepinessState,
): string {
  let protocol: ProtocolPrompt;
  switch (checkType) {
    case "light":
      protocol = extractLightProtocol(result);
      break;
    case "medium":
      protocol = extractMediumProtocol(result);
      break;
    case "full":
      protocol = extractFullProtocol(result, workspaceDir);
      break;
    default:
      throw new Error(`Unknown check type: ${checkType}`);
  }
  return renderProtocolPrompt(protocol, sleepiness);
}

// ── 协议提取器 ─────────────────────────────────────────────────────────

/** 提取 Light 协议数据 */
function extractLightProtocol(
  checkResult: Record<string, unknown>,
): ProtocolPrompt {
  const currentDate = getTodayStr();
  return {
    protocol_id: `LP-${currentDate}`,
    protocol_type: "light",
    check_result: checkResult,
    actions: [
      {
        id: "1",
        name: "更新SESSION-STATE心跳状态",
        reason: "heartbeat_triggered",
        output_format: "[✓ Light已更新]",
      },
      {
        id: "2",
        name: "创建今日L2",
        reason: "如不存在",
        output_format: "[✓ L2已创建] 或 [L2已存在]",
      },
    ],
    protocol_declaration: {
      completion_mark: "[✓ 心跳协议执行完毕]",
      mandatory: true,
    },
  };
}

/** 提取 Medium 协议数据 */
function extractMediumProtocol(
  mediumResult: Record<string, unknown>,
): ProtocolPrompt {
  const currentDate = getTodayStr();
  const actionsRaw = mediumResult.required_actions as
    | Array<{ action: string; reason?: string; mandatory?: boolean }>
    | undefined;
  const actions = (actionsRaw || []).map((a, i) => ({
    id: String(i + 1),
    name: a.action,
    reason: a.reason || "",
    output_format: a.mandatory ? "[✓ 已执行]" : "[⏳ 待执行]",
  }));
  return {
    protocol_id: `MP-${currentDate}`,
    protocol_type: "medium",
    check_result: mediumResult,
    actions,
    protocol_declaration: {
      completion_mark: "[✓ Medium协议执行完毕]",
      mandatory: true,
    },
  };
}

/** 提取 Full 协议数据 */
function extractFullProtocol(
  fullResult: Record<string, unknown>,
  workspaceDir?: string,
): ProtocolPrompt {
  const currentDate =
    (fullResult.current_date as string) || getTodayStr();

  // 分段参数
  const segmentData = fullResult.segment as any;
  const segmentMode = segmentData?.segment_mode === true;

  // 日终任务状态
  const endTaskStatus = fullResult.end_task_status as any;
  const needsAction = endTaskStatus?.needs_action === true;
  const diaryExists = endTaskStatus?.diary_exists === true;

  // 构建actions数组
  const actions: ProtocolPrompt["actions"] = [];
  if (needsAction) {
    // [1] L2跨日交接 — agent执行（需理解当日工作）
    actions.push({
      id: "1",
      name: "L2跨日交接",
      reason: "日终",
      output_format: "[✓ L2已更新]",
      executor: getAgentName(),
      operation_guide: "读取昨日L2末尾跨日交接 → 更新今日L2末尾固定结构。格式参考: templates/archive/l2-template.md",
    });

    // [2] daily归档 — spawn:agent-dream（从EXTRA分段提取）
    const dailyAction: any = {
      id: "2",
      name: "daily归档",
      reason: "日终",
      output_format: "[✓ daily归档完成]",
      timeout: "2h",
      executor: getSpawnExecutor(),
      spawn_instruction: "sessions_spawn(runtime=subagent, task=\"从EXTRA分段提取今日对话→daily-template格式(读取templates/archive/daily-template.md + templates/archive/dream-extract-prompt.md)\", timeoutSeconds=120)",
      operation_guide: "按消息单元切分EXTRA当日对话，阈值≤500行/段。格式参考: templates/archive/daily-template.md，提取指令: templates/archive/dream-extract-prompt.md",
    };
    if (segmentMode) dailyAction.segment = true;
    actions.push(dailyAction);

    // [3] 创建日记 — agent执行（自由主观表达）
    if (!diaryExists) {
      actions.push({
        id: "3",
        name: "创建日记",
        reason: "日终",
        output_format: "[✓ 日记已创建]",
        executor: getAgentName(),
        operation_guide: "写入memory/memory-core/diary/YYYY/MM/YYYY-MM-DD.md（自由主观表达，无固定格式）",
      });
    }

    // [4] deep归档 — spawn:agent-dream（从EXTRA提取深度对话）
    actions.push({
      id: String(actions.length + 1),
      name: "deep归档",
      reason: "日终",
      output_format: "[✓ deep归档完成]",
      timeout: "2h",
      executor: getSpawnExecutor(),
      spawn_instruction: "sessions_spawn(runtime=subagent, task=\"从EXTRA提取深度对话（概念辨析/顿悟/人格形成）→deep-dialogue格式(读取templates/archive/deep-template.md)\", timeoutSeconds=120)",
      operation_guide: "从EXTRA原始对话提取深度内容（概念辨析/顿悟/人格形成），输出到deep-dialogue/YYYY/MM/YYYY-MM-DD.md",
    });

    // [5] work归档 — spawn:agent-dream（从EXTRA提取工作经验）
    actions.push({
      id: String(actions.length + 1),
      name: "work归档",
      reason: "日终",
      output_format: "[✓ work归档完成]",
      timeout: "2h",
      executor: getSpawnExecutor(),
      spawn_instruction: "sessions_spawn(runtime=subagent, task=\"从EXTRA提取工作经验（错误修正/方法论）→work-dialogue格式(读取templates/archive/work-template.md)\", timeoutSeconds=120)",
      operation_guide: "从EXTRA原始对话提取工作经验（错误修正/方法论），输出到work-dialogue/YYYY/MM/YYYY-MM-DD.md",
    });

    // [6] EXTRA归档验证 — spawn:agent-dream（标准化流程）
    actions.push({
      id: String(actions.length + 1),
      name: "EXTRA归档验证",
      reason: "日终",
      output_format: "[✓ EXTRA归档验证通过]",
      executor: getSpawnExecutor(),
      spawn_instruction: "sessions_spawn(runtime=subagent, task=\"验证守护进程归档状态\", timeoutSeconds=60)",
      operation_guide: "检查守护进程是否正常归档EXTRA层对话",
    });

    // [7] 清理SESSION-STATE — spawn:agent-dream（标准化流程）
    actions.push({
      id: String(actions.length + 1),
      name: "清理SESSION-STATE",
      reason: "日终",
      output_format: "[✓ SESSION-STATE已清理]",
      executor: getSpawnExecutor(),
      spawn_instruction: "sessions_spawn(runtime=subagent, task=\"迁移未完成任务→清空SESSION-STATE\", timeoutSeconds=60)",
      operation_guide: "迁移未完成任务到L2跨日交接 → 清空SESSION-STATE.md",
    });

    // NOTE: INDEX更新由钩子自动执行，不需要LLM手动更新
  }

  return {
    protocol_id: `FP-${currentDate}`,
    protocol_type: "full",
    check_result: fullResult,
    segment: segmentMode
      ? {
          message_count: segmentData?.message_count ?? 0,
          segment_mode: segmentMode,
          segment_count: segmentData?.segment_count ?? 0,
          segment_threshold: segmentData?.segment_threshold ?? 200,
        }
      : undefined,
    actions,
    protocol_declaration: {
      completion_mark: "[✓ 日终协议执行完毕]",
      mandatory: true,
    },
  };
}

// ── 辅助函数 ───────────────────────────────────────────────────────────

function getProtocolMarker(type: "light" | "medium" | "full" | "weekly"): string {
  switch (type) {
    case "light": return "☀️";
    case "medium": return "☕";
    case "full": return "🌙";
    case "weekly": return "📅";
  }
}

function getProtocolTitle(type: "light" | "medium" | "full" | "weekly"): string {
  switch (type) {
    case "light": return "日常驱动";
    case "medium": return "增量整理";
    case "full": return "梦境整理";
    case "weekly": return "周期凝练";
  }
}

function getProtocolDesc(type: "light" | "medium" | "full" | "weekly"): string {
  switch (type) {
    case "light": return "记忆流动检查 → 轻量维护，保持连续性";
    case "medium": return "L2增量更新 → 保持记忆新鲜度";
    case "full": return "系统归档 → 今日记忆系统性整理，梦将执行深层归档";
    case "weekly": return "周月年凝练 → 叙事重建 + L4 演化 + 时间索引";
  }
}

// ── 渲染器 ─────────────────────────────────────────────────────────────

/** 统一渲染器 — 将 ProtocolPrompt 对象渲染为完整协议文本（展示给用户 + 注入系统上下文） */
function renderProtocolPrompt(protocol: ProtocolPrompt, sleepiness?: SleepinessState): string {
  const lines: string[] = [];

  // 0. 协议类型标题（醒睡隐喻）
  lines.push(`【${getProtocolMarker(protocol.protocol_type)} ${getProtocolTitle(protocol.protocol_type)}】`);
  lines.push(getProtocolDesc(protocol.protocol_type));
  if (protocol.protocol_type === "full") {
    lines.push("");
    lines.push("【三我分层归档】");
    lines.push("本我层(deep) → 原始欲望、深层冲动、自我认知");
    lines.push("超我层(work) → 道德约束、理想自我、方法论");
    lines.push("自我层(daily) → 现实适应、日常行为、人格温度");
  }
  lines.push("");

  // 1. 检查结果部分
  lines.push(`【心跳检查结果】`);
  lines.push(`检查类型: ${protocol.protocol_type}`);
  lines.push(`检查时间: ${(protocol.check_result as any).check_time || "unknown"}`);
  lines.push("");
  lines.push("需执行行动:");
  const ra = (protocol.check_result as any).required_actions as
    | Array<{ action?: string; reason?: string }>
    | undefined;
  if (ra && ra.length > 0) {
    for (const a of ra) {
      lines.push(`${a.action} (${a.reason || ""})`);
    }
  } else {
    // fallback: 从 protocol.actions 提取
    for (const a of protocol.actions) {
      lines.push(`${a.name} (${a.reason || ""})`);
    }
  }
  lines.push("");

  // 2. 强制行动清单
  lines.push(`【⚡ 强制行动清单】`);
  lines.push("以下行动必须在本轮心跳完成：");
  for (const action of protocol.actions) {
    // 执行者标注
    const executorMark = action.executor 
      ? (action.executor.includes("spawn") ? `【spawn】` : `【${getAgentName()}】`)
      : "";
    lines.push(`[${action.id}] ${action.name} ${executorMark}`);
    
    // spawn指令（如果有）
    if (action.spawn_instruction) {
      lines.push(`  → spawn指令: ${action.spawn_instruction}`);
    }
    
    // 操作指引（如果有）
    if (action.operation_guide) {
      lines.push(`  → 操作: ${action.operation_guide}`);
    }
    
    lines.push(`  → 输出: ${action.output_format}`);
  }
  // 并行指引
  const spawnActions = protocol.actions.filter((a) => a.executor?.includes("spawn"));
  const localActions = protocol.actions.filter((a) => a.executor && !a.executor.includes("spawn"));
  if (spawnActions.length > 0) {
    const ids = spawnActions.map((a) => a.id).join("+");
    lines.push(`⚡ spawn action [${ids}] 互相独立，必须并行 sessions_spawn（不要逐个等待）`);
    if (localActions.length > 0) {
      const lids = localActions.map((a) => a.id).join("+");
      lines.push(`⚡ 本地 action [${lids}] 可与 spawn 并行执行`);
    }
  }
  lines.push("");

  // 3. 协议声明
  lines.push(`【协议声明】`);
  lines.push(`完成所有行动后输出: ${protocol.protocol_declaration.completion_mark}`);
  lines.push("任一行动失败输出: [✗ 协议失败: <原因>]");
  lines.push("");

  // 3.5 睡意状态注入（三层权重兜底）
  if (sleepiness) {
    lines.push(`【${sleepiness.emoji} 睡意状态: ${sleepiness.level} (${sleepiness.score})】`);
    lines.push(`距上次日终: ${sleepiness.hoursSinceLastEod.toFixed(1)}h | 生物周期: ${sleepiness.factors.circadian} | 运行: ${sleepiness.factors.uptime} | 记忆储量: ${sleepiness.factors.memoryLoad}`);
    if (sleepiness.systemHint) {
      lines.push(`💭 ${sleepiness.systemHint}`);
    }
    if (sleepiness.level === "dreaming") {
      lines.push("💤 入梦协议已激活。以下日终步骤将自动执行。");
    } else if (sleepiness.level === "exhausted") {
      lines.push("⚠️ 睡意达到极限，日终流程为强制执行。");
    }
    lines.push("");
  }

  // 4. SESSION-STATE验证要求（固定）
  lines.push(`【⚡ SESSION-STATE强制验证】`);
  lines.push("本轮心跳必须验证以下内容：");
  lines.push("[1] 活跃任务状态 → 输出: [✓ 任务: XXX / 状态: XXX]");
  lines.push("[2] 关键发现/进展 → 输出: [✓ 发现: XXX] 或 [无变更]");
  lines.push("[3] 超短期记忆 → 输出: [✓ 已记录] 或 [无需记录]");
  lines.push("");
  lines.push("⚠️ 必须执行验证，无变更也需输出验证标记");
  lines.push("完成验证后输出: [✓ SESSION-STATE验证完毕]");

  return lines.join("\n");
}
