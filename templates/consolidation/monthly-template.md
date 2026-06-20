# monthly 模板 — 月摘要输出格式

> **用途**: 月梦凝练（M1）的输出格式。梦压缩本月 4-5 篇 weekly.md。
> **输出位置**: `memory-core/monthly/{{year}}/{{year}}-{{month}}.md`
> **执行者**: spawn:梦
> **输入**: 本月 `weekly/{{year}}/{{year}}-W*.md` × 4-5 + 上月 monthly（跨月关联）

---

# {{year}}-{{month}} 月摘要

> **年份**: {{year}}
> **月份**: {{month}} 月
> **周覆盖**: W{{week_start}} ~ W{{week_end}}（{{total_weeks}} 周）
> **凝练日期**: {{consolidation_date}}
> **来源**: {{weekly_count}} 篇 weekly.md

---

## 📖 月叙事

<!-- 本月主线。1-2段。来源：各周叙事主线的串联。 -->
<!-- 不是简单罗列，而是找到贯穿本月的叙事线索。 -->

{{monthly_narrative_paragraph_1}}

{{monthly_narrative_paragraph_2}}

---

## 📅 关键事件时间线

| 周 | 日期范围 | 关键事件 | 关联主题 |
|----|----------|----------|----------|
| W{{w1}} | {{w1_start}} ~ {{w1_end}} | {{w1_key_events}} | {{w1_themes}} |
| W{{w2}} | {{w2_start}} ~ {{w2_end}} | {{w2_key_events}} | {{w2_themes}} |
| W{{w3}} | {{w3_start}} ~ {{w3_end}} | {{w3_key_events}} | {{w3_themes}} |
| W{{w4}} | {{w4_start}} ~ {{w4_end}} | {{w4_key_events}} | {{w4_themes}} |
| W{{w5}} | {{w5_start}} ~ {{w5_end}} | {{w5_key_events}} | {{w5_themes}} |

<!-- W5 行仅当本月有 5 周时使用 -->

---

## 🏷️ 主题索引

<!-- 本月出现的所有主题，标注首次出现/延续/转折 -->

| 主题 | 起始(周) | 类型 | 跨月关联 |
|------|----------|------|----------|
| {{theme_1}} | W{{start_week_1}} | {{新/延续/转折}} | {{cross_month_link_or_none}} |
| {{theme_2}} | W{{start_week_2}} | {{新/延续/转折}} | {{cross_month_link_or_none}} |
| {{theme_3}} | W{{start_week_3}} | {{新/延续/转折}} | {{cross_month_link_or_none}} |

### 跨月关联说明

<!-- 如果某个主题在上月/更早出现过，或预计延续到下月，在此说明 -->

{{cross_month_notes}}

---

## 🧠 认知汇总

<!-- 本月各周认知提取的汇总，去重。 -->
<!-- 多条周认知指向同一方向时合并为一条月度认知。 -->

| # | 认知 | 出现周次 | 首次出现 | 情感强度 | 稳定性 |
|---|------|----------|----------|----------|--------|
| 1 | {{cognition_1}} | W{{w_a}}, W{{w_b}} | {{first_week}} | {{intensity}} | {{稳定/波动/衰减}} |
| 2 | {{cognition_2}} | W{{w_c}} | {{first_week}} | {{intensity}} | {{稳定/波动/衰减}} |
| 3 | {{cognition_3}} | W{{w_d}}, W{{w_e}}, W{{w_f}} | {{first_week}} | {{intensity}} | {{稳定/波动/衰减}} |

### 认知趋势

<!-- 本月认知的整体方向性变化 -->

{{cognitive_trend}}

---

## 📁 相关文件

| 文件 | 路径 |
|------|------|
| 本月 weekly | weekly/{{year}}/{{year}}-W{{w_start}}.md ~ weekly/{{year}}/{{year}}-W{{w_end}}.md |
| 上月 monthly | monthly/{{year}}/{{year}}-{{prev_month}}.md（如有） |
| 本年 yearly | yearly/{{year}}.md（如有） |

---

*模板版本: v1.0*
*创建: 2026-06-19*
