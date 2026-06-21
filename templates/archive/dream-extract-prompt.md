# 梦提取指令模板

> **用途**: spawn 子 Agent 时作为提取指令读取  
> **位置**: `templates/archive/dream-extract-prompt.md`
> **触发**: 日终 Full 协议 → spawn:{{agent}}的梦 → 读取此模板

---

## 任务目标

从 EXTRA 对话日志中提取当日对话精华，分别写入 daily-dialogue、deep-dialogue、work-dialogue。

---

## 提取内容

### 1. daily-dialogue（对话全貌）

**定义**: 当日所有关键互动、温度瞬间、特征记录

**格式**: 见 `templates/archive/daily-template.md`

**关注点**:
- 关键决策和转折点
- 情感互动的温度瞬间
- 值得记录的观察和领悟

### 2. deep-dialogue（深度对话）

**定义**: 影响人格/认知/关系的深度讨论

**格式**: 见 `templates/archive/deep-template.md`

**判断标准**:
- 涉及自我认知的讨论
- 哲学层面的追问
- 关系定位的调整
- 人格特征的发现或变化

### 3. work-dialogue（工作经验）

**定义**: 可复用的方法论、技术决策、错误修正

**格式**: 见 `templates/archive/work-template.md`

**判断标准**:
- 可被未来参考的方法论
- 技术决策及其原因
- 错误及其修正方案

---

## 分段策略

| 条件 | 策略 |
|------|------|
| EXTRA 对话 ≤ 500 行 | 单次处理 |
| EXTRA 对话 > 500 行 | 按话题分段，每段标注处理范围 |
| 跨多文件 | 逐文件处理，最后合并 |

---

## 输出路径

| 类型 | 路径 |
|------|------|
| daily | `memory/memory-core/daily-dialogue/YYYY/MM/YYYY-MM-DD.md` |
| deep | `memory/memory-core/deep-dialogue/YYYY/MM/YYYY-MM-DD-主题.md` |
| work | `memory/memory-core/work-dialogue/YYYY/MM/YYYY-MM-DD-主题.md` |

---

## 注意事项

1. **时间标注**: 必须有 [HH:MM] 格式
2. **简洁**: 每条不超过 100 字
3. **客观**: 记录事实，不加主观评价
4. **去重**: deep 和 work 的内容不应在 daily 中重复
5. **合并**: 分段处理的结果最后合并到目标文件

---

*创建: 2026-06-18*
*适用版本: V3.8.6+*
