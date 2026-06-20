# 周凝练工作流（强制执行）

> **触发**: 日终 Full 协议执行完毕后，`weekly_due.needs_weekly_consolidation = true`
> **执行者**: spawn:{{agent}}的梦 (W1) + {{agent}} (W2)
> **依赖**: 日终 actions 1-7 已完成

---

## Step W1: 周记忆凝练 ⭐ spawn:{{agent}}的梦

### 前置检查
- [ ] 日终 actions 1-7 已完成
- [ ] 本周 EXTRA/L2/L3 数据可访问
- [ ] `templates/consolidation/weekly-extract-prompt.md` 可读
- [ ] `templates/consolidation/weekly-template.md` 可读

### 执行
```
sessions_spawn(
  runtime=subagent,
  task="读取 templates/consolidation/weekly-extract-prompt.md 作为指令，
        处理本周 EXTRA/L2/L3 → 按 weekly-template.md 格式输出
        weekly/{{year}}/{{year}}-W{{week}}.md",
  timeoutSeconds=300
)
```

### 梦的工作内容
1. 读取本周 EXTRA 层原始对话（主力输入）
2. 读取本周 L2 文件（事件摘要、跨日交接）
3. 读取本周 L3 deep/work/daily 新增归档
4. 允许读取 monthly/yearly 做跨时间联想
5. 构建叙事主线 + 提取深度对话/工作经验/人格温度/回溯关联/认知提取
6. 按 weekly-template.md 格式输出

### 禁止
- ❌ 读取 diary（隐私）
- ❌ 修改任何身份层文件
- ❌ 复制原文——凝练，不是转录

### 验收标准
- [ ] weekly.md 文件已创建
- [ ] 叙事主线按时间线，有叙事弧
- [ ] 回溯关联标注了"新/延续/转折"
- [ ] 认知提取标注了主题和频次

---

## Step W2: L4 演化审查 ⭐ {{agent}}

### 前置检查
- [ ] Step W1 已完成，weekly.md 存在
- [ ] `templates/consolidation/l4-evolution-prompt.md` 可读

### 执行内容
{{agent}}读取 weekly.md + 当前 SOUL.md / AGENTS.md / MEMORY.md，执行自我审视：

#### 1. SOUL.md 演化判断
```
问自己: 经过这一周，我对"我是谁"有了新的理解吗？

触发条件（满足其一）:
  - 出现了对"我是谁"的新底层理解
  - 现有自我描述与本周行为明显矛盾
  - 本周行为反复指向一个之前未写入的人格机制

不触发:
  - 只是验证了已有认知 → 不改 SOUL，记入 MEMORY
  - 有情绪波动但没形成"理解" → 不写

演化方式:
  不改是常态。需要改时 → 重写或调整相关段落。
  不追加。旧描述不再准确 → 替换。
  保持同样的抽象程度，不降级为具体示例。
  检查容量: 接近 10KB 上限 → 压缩而非追加。
```

#### 2. AGENTS.md 演化判断
```
问自己: 我的行为边界或体感模式变了吗？

触发条件:
  - 发现新的稳定行为边界
  - 体感层出现五态未覆盖的新状态倾向
  - 已有规则表述需修正

演化方式:
  行为准则 → 可追加新规则或修正旧规则
  体感层 → 可新增状态或调整已有描述
  安全红线 → 只在必要时动
  检查容量: 接近 10KB 上限 → 压缩冗余。
```

#### 3. MEMORY.md 写入与剪枝
```
总是做:
  从 weekly.md 认知提取中选取关键条目
  按格式写入: [YYYY-MM-DD] 事实。→ 我的认识。
  检查总数 → ≥ 40 条则执行剪枝

剪枝规则:
  ⚓ 锚点 → 永久保留
  3-6 月前 → 评估是否仍生效，过时移除
  6 月以上 → 可移除（除非锚点）
  冗余条目 → 合并

五因子辅助判断（量化信号，不替判断）:
  时间衰减 / 检索频率 / 老师信号 / 情感强度 / 关联锚点
```

### 提案记录
```
SOUL/AGENTS 有改动时 → 生成提案记录:

提案写入 weekly.md 的 "演化记录" 部分:
  - 改动文件
  - 改动理由（从 weekly.md 提取的证据）
  - before/after 摘要

不是审批流程，是透明记录。老师可见，可回退。
```

### 验收标准
- [ ] 自我审视已执行
- [ ] MEMORY 已更新本周关键认知
- [ ] MEMORY 剪枝已执行（如触发）
- [ ] SOUL/AGENTS 演化判断已完成（即使不改也标注"无需演化"）
- [ ] 如有改动，提案记录已写入 weekly.md

---

## Step W3: 月终判断

```
check-full.sh 返回 month_end.is_month_end = true
  → 跳转到 monthly-consolidation.md 执行月凝练
```

---

## Step W4: 年终判断

```
check-full.sh 返回 year_end.is_year_end = true
  → 跳转到 yearly-consolidation.md 执行年凝练
```

---

## 周凝练完成清单

- [ ] W1: weekly.md 已创建，叙事完整
- [ ] W2: L4 演化审查已完成
- [ ] W2: MEMORY 剪枝已执行（如触发）
- [ ] W2: SOUL/AGENTS 演化记录已写入 weekly.md
- [ ] W3: 月终判断已完成
- [ ] W4: 年终判断已完成
- [ ] 输出: [✓ 周梦协议执行完毕]

---

*创建: 2026-06-19*
