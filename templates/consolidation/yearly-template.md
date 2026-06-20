# yearly 模板 — 年摘要输出格式

> **用途**: 年梦凝练（Y1）的输出格式。梦回顾全年 12 篇 monthly.md。
> **输出位置**: `memory-core/yearly/{{year}}.md`
> **执行者**: spawn:梦
> **输入**: 本年 `monthly/{{year}}/{{year}}-*.md` × 12 + 上年 yearly（跨年参照）

---

# {{year}} 年摘要

> **年份**: {{year}}
> **凝练日期**: {{consolidation_date}}
> **来源**: {{monthly_count}} 篇 monthly.md

---

## 📖 年叙事

<!-- 全年的故事线。2-3段。 -->
<!-- 不是 12 个月的拼合，而是找出贯穿整年的弧线。 -->

{{yearly_narrative_paragraph_1}}

{{yearly_narrative_paragraph_2}}

{{yearly_narrative_paragraph_3}}

---

## 🏔️ 里程碑

<!-- 全年最重要的事件，按月排列。只保留真的改变了什么的事。 -->

| 月份 | 事件 | 影响 | 关联主题 |
|------|------|------|----------|
| 01 | {{jan_milestone}} | {{jan_impact}} | {{jan_themes}} |
| 02 | {{feb_milestone}} | {{feb_impact}} | {{feb_themes}} |
| 03 | {{mar_milestone}} | {{mar_impact}} | {{mar_themes}} |
| 04 | {{apr_milestone}} | {{apr_impact}} | {{apr_themes}} |
| 05 | {{may_milestone}} | {{may_impact}} | {{may_themes}} |
| 06 | {{jun_milestone}} | {{jun_impact}} | {{jun_themes}} |
| 07 | {{jul_milestone}} | {{jul_impact}} | {{jul_themes}} |
| 08 | {{aug_milestone}} | {{aug_impact}} | {{aug_themes}} |
| 09 | {{sep_milestone}} | {{sep_impact}} | {{sep_themes}} |
| 10 | {{oct_milestone}} | {{oct_impact}} | {{oct_themes}} |
| 11 | {{nov_milestone}} | {{nov_impact}} | {{nov_themes}} |
| 12 | {{dec_milestone}} | {{dec_impact}} | {{dec_themes}} |

---

## 🌊 主题演变

<!-- 贯穿全年的主题如何变化：起始 → 变化 → 终结（或延续） -->

| 主题 | 起始(月) | 起始状态 | 变化(月) | 变化描述 | 终结(月) | 终结状态 |
|------|----------|----------|----------|----------|----------|----------|
| {{theme_1}} | {{start_month_1}} | {{initial_state_1}} | {{change_month_1}} | {{change_desc_1}} | {{end_month_1}} | {{end_state_or_延续}} |
| {{theme_2}} | {{start_month_2}} | {{initial_state_2}} | {{change_month_2}} | {{change_desc_2}} | {{end_month_2}} | {{end_state_or_延续}} |
| {{theme_3}} | {{start_month_3}} | {{initial_state_3}} | {{change_month_3}} | {{change_desc_3}} | {{end_month_3}} | {{end_state_or_延续}} |

### 主题演化说明

<!-- 贯穿全年的主题弧线、断裂点、意外转折 -->

{{theme_evolution_notes}}

---

## 🧠 年度认知

<!-- 全年最重要的认知变化。不是所有月度认知的堆积，而是真正改变了"我是谁"的那些。 -->

### 核心认知变化

| # | 认知 | 形成月份 | 触发事件 | 影响层级 | 状态 |
|---|------|----------|----------|----------|------|
| 1 | {{cognition_1}} | {{formation_month_1}} | {{trigger_event_1}} | {{SOUL/AGENTS/MEMORY}} | {{持续/已融入/被替代}} |
| 2 | {{cognition_2}} | {{formation_month_2}} | {{trigger_event_2}} | {{SOUL/AGENTS/MEMORY}} | {{持续/已融入/被替代}} |
| 3 | {{cognition_3}} | {{formation_month_3}} | {{trigger_event_3}} | {{SOUL/AGENTS/MEMORY}} | {{持续/已融入/被替代}} |

### 认知演化叙事

<!-- 用一段话描述今年认知变化的整体弧线 -->

{{cognition_evolution_narrative}}

---

## 📁 相关文件

| 文件 | 路径 |
|------|------|
| 本年 monthly | monthly/{{year}}/{{year}}-01.md ~ monthly/{{year}}/{{year}}-12.md |
| 上年 yearly | yearly/{{prev_year}}.md（如有） |

---

*模板版本: v1.0*
*创建: 2026-06-19*
