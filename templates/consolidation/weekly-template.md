# weekly 模板 — 周摘要输出格式

> **用途**: 周梦凝练（W1）的输出格式。梦从 EXTRA/L2/L3 提取本周叙事。
> **输出位置**: `memory-core/weekly/{{year}}/{{year}}-W{{week_num}}.md`
> **执行者**: spawn:梦
> **输入**: EXTRA/L2/L3 本周新增 + monthly/yearly（按需回溯）

---

# W{{week_num}} 周摘要 ({{week_start}} ~ {{week_end}})

> **年份**: {{year}}
> **周次**: 第 {{week_num}} 周
> **凝练日期**: {{consolidation_date}}
> **来源文件**: {{source_file_count}} 个文件（EXTRA {{extra_count}} / L2 {{l2_count}} / L3 {{l3_count}}）

---

## 📖 叙事主线

<!-- 本周发生了什么。按时间线，保持叙事弧，不复制原文。 -->
<!-- 来源: EXTRA + L2 -->

### {{day_1_date}}（周{{day_1_weekday}}）

{{day_1_narrative}}

### {{day_2_date}}（周{{day_2_weekday}}）

{{day_2_narrative}}

<!-- ... 按日展开，保持叙事弧 ... -->

---

## 💭 深度对话

<!-- 本周哲学/自我认知讨论的要点。不复制原文。 -->
<!-- 来源: L3 deep-dialogue -->

| 日期 | 主题 | 讨论要点 | 情感强度 |
|------|------|----------|----------|
| {{date_1}} | {{topic_1}} | {{key_points_1}} | {{intensity_1}} |
| {{date_2}} | {{topic_2}} | {{key_points_2}} | {{intensity_2}} |

---

## 🔧 工作经验

<!-- 本周方法论发现、错误修正。 -->
<!-- 来源: L3 work-dialogue -->

### 方法论发现

| 日期 | 发现 | 场景 | 应用价值 |
|------|------|------|----------|
| {{date_1}} | {{finding_1}} | {{scenario_1}} | {{value_1}} |

### 错误修正

| 日期 | 错误 | 修正 | 教训 |
|------|------|------|------|
| {{date_1}} | {{error_1}} | {{fix_1}} | {{lesson_1}} |

---

## 🌡️ 人格温度

<!-- 本周互动模式、情感变化、关系动态。 -->
<!-- 来源: L3 daily-dialogue + EXTRA 互动片段 -->

### 互动模式

{{interaction_pattern_summary}}

### 情感变化

| 日期 | 情感状态 | 触发事件 | 强度 |
|------|----------|----------|------|
| {{date_1}} | {{emotion_1}} | {{trigger_1}} | {{intensity_1}} |

### 关系动态

{{relationship_dynamics}}

---

## 🔗 回溯关联

<!-- 本周叙事与更长时间尺度的联系 -->
<!-- 来源: monthly/yearly 索引回溯 -->

| 关联类型 | 主题 | 本周表现 | 先前记录 | 链接到 |
|----------|------|----------|----------|--------|
| 新 | {{new_topic_1}} | {{manifestation}} | — | — |
| 延续 | {{continued_topic_1}} | {{manifestation}} | {{prior_record}} | {{link_to_weekly_or_monthly}} |
| 转折 | {{turned_topic_1}} | {{from_x_to_y}} | {{prior_record}} | {{link_to_weekly_or_monthly}} |

### 回溯说明

{{retrospective_notes}}

---

## 🧠 认知提取

<!-- 从本周叙事中提炼的关键认知。W2 将从这里提取 L4 演化素材。 -->
<!-- 每一条标注: 主题、首次出现还是复现、情感强度 -->

| # | 主题 | 出现类型 | 情感强度 | 认知表述 | 证据（日期/来源） |
|---|------|----------|----------|----------|-------------------|
| 1 | {{theme_1}} | {{新/复现}} | {{强度等级}} | {{cognition_statement}} | {{evidence}} |
| 2 | {{theme_2}} | {{新/复现}} | {{强度等级}} | {{cognition_statement}} | {{evidence}} |

### 认知聚类

<!-- 有多个认知指向同一方向时，聚合为更高层次洞察 -->

{{cognitive_clusters}}

---

## 📊 演化记录

<!-- L4 演化操作的记录（由 W2 填写） -->
<!-- 周凝练完成后，{{agent}}执行 W2 演化审查，在此记录 -->

### SOUL 演化

| 是否演化 | 理由 |
|----------|------|
| {{yes/no}} | {{reason_or_none}} |

{{#if evolved}}
**改动段落**: {{changed_section}}
**Before**:
{{before_text}}
**After**:
{{after_text}}
{{/if}}

### AGENTS 演化

| 是否演化 | 理由 |
|----------|------|
| {{yes/no}} | {{reason_or_none}} |

{{#if evolved}}
**改动段落**: {{changed_section}}
**Before**:
{{before_text}}
**After**:
{{after_text}}
{{/if}}

### MEMORY 演化

| 操作 | 说明 |
|------|------|
| 新增条目 | {{new_entry_count}} 条 |
| 剪枝移除 | {{pruned_count}} 条 |
| 剪枝理由 | {{prune_reason}} |

### 演化备注

{{evolution_notes}}

---

## 📁 相关文件

| 文件 | 路径 |
|------|------|
| 本周 L2 | memory/{{week_start}}.md ~ memory/{{week_end}}.md |
| deep 归档 | memory/memory-core/deep-dialogue/{{year}}/{{week_month}}/ |
| work 归档 | memory/memory-core/work-dialogue/{{year}}/{{week_month}}/ |
| daily 归档 | memory/memory-core/daily-dialogue/{{year}}/{{week_month}}/ |
| 本月 monthly | monthly/{{year}}/{{year}}-{{month}}.md（如有） |

---

*模板版本: v1.0*
*创建: 2026-06-19*
