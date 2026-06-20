// ───────────────────────────────────────────────────────────────────────
// Intent Resolver — 三角因子指令解析
//
// 运行在 before-prompt-build 钩子中（conversation 路径）
// 关键词 + 状态因子 → action 判定
// llm_intent 由 tool 调用行为体现，不在本模块计算
// ───────────────────────────────────────────────────────────────────────

export interface IntentResult {
  /** 关键词是否匹配 (0 or 1) */
  keyword: 0 | 1;
  /** 匹配到的协议类型，无匹配为 null */
  protocol: ProtocolType | null;
  /** 状态因子评分 0-1 */
  stateRelevance: number;
  /** 决策动作 */
  action: "direct" | "inquire" | "pass";
  /** action=inquire 时注入的询问提示词 */
  inquirePrompt?: string;
}

export type ProtocolType =
  | "full"
  | "medium"
  | "weekly"
  | "monthly"
  | "yearly"
  | "sleepiness_query"
  | "create_l2";

/** 关键词映射条目 */
export interface KeywordEntry {
  protocol: ProtocolType;
  keywords: string[];       // 精确匹配
  fuzzyPatterns: RegExp[];  // 模糊匹配 → keyword=1
}

/** 状态因子判定参数 */
export interface StateParams {
  sleepinessScore: number;
  hoursSinceLastEod: number;
  hoursSinceLastMedium: number;
  l2Exists: boolean;
  weeklyFileExists: boolean;
  monthlyFileExists: boolean;
  yearlyFileExists: boolean;
  isWeekend: boolean;
  isMonthEnd: boolean;
  isYearEnd: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. 关键词映射表（7组 — 按优先级排列）
// ═══════════════════════════════════════════════════════════════════════

const KEYWORD_TABLE: KeywordEntry[] = [
  {
    protocol: "full",
    keywords: ["日终", "做日终", "归档", "睡觉了"],
    fuzzyPatterns: [/(日终|归档|睡觉)/],
  },
  {
    protocol: "medium",
    keywords: ["检查状态", "中等检查", "更新记忆"],
    fuzzyPatterns: [/(检查状态|中等检查|更新记忆)/],
  },
  {
    protocol: "weekly",
    keywords: ["周终", "周凝练", "周总结"],
    fuzzyPatterns: [/(这周|周(终|总结|凝练))/],
  },
  {
    protocol: "monthly",
    keywords: ["月终", "月凝练", "月总结"],
    fuzzyPatterns: [/(这月|月(终|总结|凝练))/],
  },
  {
    protocol: "yearly",
    keywords: ["年终", "年凝练", "年总结"],
    fuzzyPatterns: [/(今年|年(终|总结|凝练))/],
  },
  {
    protocol: "sleepiness_query",
    keywords: ["睡意", "困不困", "状态", "困了"],
    fuzzyPatterns: [/(睡意|困)/],
  },
  {
    protocol: "create_l2",
    keywords: ["创建L2", "新建日记"],
    fuzzyPatterns: [/(创建L2|新建.*日记)/],
  },
];

const PROTOCOL_NAMES: Record<ProtocolType, string> = {
  full: "日终归档",
  medium: "中等检查",
  weekly: "周凝练",
  monthly: "月凝练",
  yearly: "年凝练",
  sleepiness_query: "睡意查询",
  create_l2: "创建日记",
};

// ═══════════════════════════════════════════════════════════════════════
// 2. 关键词匹配
// ═══════════════════════════════════════════════════════════════════════

/**
 * 扫描用户消息，返回第一个匹配的协议类型。
 * 匹配条件：任意精确关键词包含于消息中，或任意模糊正则匹配。
 * 按 KEYWORD_TABLE 顺序返回首个命中。
 */
function matchKeyword(msg: string): ProtocolType | null {
  for (const entry of KEYWORD_TABLE) {
    const exactHit = entry.keywords.some((kw) => msg.includes(kw));
    if (exactHit) return entry.protocol;

    const fuzzyHit = entry.fuzzyPatterns.some((pat) => pat.test(msg));
    if (fuzzyHit) return entry.protocol;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. stateRelevance 计算
// ═══════════════════════════════════════════════════════════════════════

/**
 * 计算指定协议的 stateRelevance (0-1)。
 *
 * ┌───────────────┬──────────────────────────┬─────────────────────────────┐
 * │ 协议          │ state=1 条件             │ 递减规则                    │
 * ├───────────────┼──────────────────────────┼─────────────────────────────┤
 * │ full          │ 睡意≥0.5 OR 距日终≥8h   │ 睡意<0.5→线性0; 距日终<2h  │
 * │               │                          │ → ≤0.3                      │
 * │ medium        │ 距上次Medium≥2h          │ <2h → 线性至0               │
 * │ weekly        │ 周末 AND 周文件不存在    │ 非周末→0, 文件存在→0        │
 * │ monthly       │ 月末 AND 月文件不存在    │ 非月末→0, 文件存在→0        │
 * │ yearly        │ 年末 AND 年文件不存在    │ 非年末→0, 文件存在→0        │
 * │ sleepiness_q  │ 始终=0.5                 │ 查询类不阻断                │
 * │ create_l2     │ L2不存在                 │ L2存在→0                    │
 * └───────────────┴──────────────────────────┴─────────────────────────────┘
 */
function computeStateRelevance(protocol: ProtocolType, p: StateParams): number {
  switch (protocol) {
    // ── full ──────────────────────────────────────────────
    case "full": {
      // 睡意因子：≥0.5 → 1，低于则线性降至 0
      const sleepinessFactor = Math.min(1, p.sleepinessScore / 0.5);

      // 时间因子：距上次日终
      let timeFactor: number;
      if (p.hoursSinceLastEod >= 8) {
        timeFactor = 1;
      } else if (p.hoursSinceLastEod < 2) {
        // <2h → 线性 0..0.3
        timeFactor = (p.hoursSinceLastEod / 2) * 0.3;
      } else {
        // 2..8h → 线性 0.3..1
        timeFactor = 0.3 + ((p.hoursSinceLastEod - 2) / 6) * 0.7;
      }

      return Math.max(sleepinessFactor, timeFactor);
    }

    // ── medium ────────────────────────────────────────────
    case "medium":
      return Math.min(1, p.hoursSinceLastMedium / 2);

    // ── weekly ────────────────────────────────────────────
    case "weekly":
      return p.isWeekend && !p.weeklyFileExists ? 1 : 0;

    // ── monthly ───────────────────────────────────────────
    case "monthly":
      return p.isMonthEnd && !p.monthlyFileExists ? 1 : 0;

    // ── yearly ────────────────────────────────────────────
    case "yearly":
      return p.isYearEnd && !p.yearlyFileExists ? 1 : 0;

    // ── sleepiness_query ──────────────────────────────────
    case "sleepiness_query":
      return 0.5;

    // ── create_l2 ─────────────────────────────────────────
    case "create_l2":
      return p.l2Exists ? 0 : 1;
  }
}

/**
 * 对所有协议计算 stateRelevance，返回映射表。
 */
function computeAllStateRelevances(p: StateParams): Record<ProtocolType, number> {
  const result: Partial<Record<ProtocolType, number>> = {};
  for (const entry of KEYWORD_TABLE) {
    result[entry.protocol] = computeStateRelevance(entry.protocol, p);
  }
  return result as Record<ProtocolType, number>;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. 决策逻辑
// ═══════════════════════════════════════════════════════════════════════

/**
 * 生成 inquire 提示词（轻量中文询问文本）。
 */
function generateInquirePrompt(
  keyword: 0 | 1,
  protocol: ProtocolType | null,
  stateRelevance: number,
  allSR: Record<ProtocolType, number>,
): string {
  const pct = (stateRelevance * 100).toFixed(0);

  // 情况 A: 关键词命中但状态不充分
  if (keyword === 1 && protocol) {
    const name = PROTOCOL_NAMES[protocol];
    return `检测到疑似「${name}」指令，但当前状态条件不足（状态评分 ${pct}%），是否仍要执行？`;
  }

  // 情况 B: 关键词未命中但状态强烈（取 ≥0.7 的协议名）
  const highProtocols = (Object.entries(allSR) as [ProtocolType, number][])
    .filter(([, sr]) => sr >= 0.7)
    .sort(([, a], [, b]) => b - a)
    .map(([pt]) => PROTOCOL_NAMES[pt]);

  const names = highProtocols.join("、");
  return `未检测到明确指令，但「${names}」状态提示可能需要操作（评分 ≥ 70%），是否执行？`;
}

/**
 * 三角因子决策：
 *
 *   keyword=1 + stateRelevance ≥ 0.5  →  direct   （条件充分，直接执行）
 *   keyword=1 + stateRelevance < 0.5  →  inquire  （有关键词但状态不足）
 *   keyword=0 + stateRelevance ≥ 0.7  →  inquire  （没关键词但状态强烈）
 *   otherwise                         →  pass
 */
function decide(
  keyword: 0 | 1,
  stateRelevance: number,
  protocol: ProtocolType | null,
  allSR: Record<ProtocolType, number>,
): { action: "direct" | "inquire" | "pass"; inquirePrompt?: string } {
  if (keyword === 1 && stateRelevance >= 0.5) {
    return { action: "direct" };
  }
  if (keyword === 1 && stateRelevance < 0.5) {
    return {
      action: "inquire",
      inquirePrompt: generateInquirePrompt(keyword, protocol, stateRelevance, allSR),
    };
  }
  if (keyword === 0 && stateRelevance >= 0.7) {
    return {
      action: "inquire",
      inquirePrompt: generateInquirePrompt(keyword, null, stateRelevance, allSR),
    };
  }
  return { action: "pass" };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. 公开 API
// ═══════════════════════════════════════════════════════════════════════

/**
 * 解析用户消息中的协议指令意图。
 *
 * @param userMessage  用户原始消息文本
 * @param stateParams  状态因子参数（由 heartbeat.ts 传入）
 * @returns IntentResult — keyword, protocol, stateRelevance, action, inquirePrompt
 */
export function resolveIntent(userMessage: string, stateParams: StateParams): IntentResult {
  // ── Step 1: 关键词匹配 ──
  const matchedProtocol = matchKeyword(userMessage);
  const keyword: 0 | 1 = matchedProtocol !== null ? 1 : 0;

  // ── Step 2: 状态因子计算 ──
  const allSR = computeAllStateRelevances(stateParams);

  let stateRelevance: number;
  if (matchedProtocol !== null) {
    // 有关键词匹配 → 使用对应协议的 stateRelevance
    stateRelevance = allSR[matchedProtocol];
  } else {
    // 无关键词匹配 → 取所有协议中的最大值
    stateRelevance = Math.max(0, ...Object.values(allSR));
  }

  // 四舍五入到小数点后两位，避免浮点噪音
  const rounded = Math.round(stateRelevance * 100) / 100;

  // ── Step 3: 决策 ──
  const decision = decide(keyword, rounded, matchedProtocol, allSR);

  return {
    keyword,
    protocol: matchedProtocol,
    stateRelevance: rounded,
    action: decision.action,
    inquirePrompt: decision.inquirePrompt,
  };
}
