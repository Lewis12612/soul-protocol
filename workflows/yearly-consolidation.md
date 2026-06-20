# 年凝练工作流（强制执行）

> **触发**: 日终 + 周凝练 + 月凝练完成后，`year_end.is_year_end = true`
> **执行者**: spawn:{{agent}}的梦
> **依赖**: 本年 12 篇 monthly.md 已存在

---

## Step Y1: 年记忆凝练 ⭐ spawn:{{agent}}的梦

### 前置检查
- [ ] 本年 12 篇 monthly.md 存在（至少已有月份的都存在）
- [ ] `templates/consolidation/yearly-extract-prompt.md` 可读
- [ ] `templates/consolidation/yearly-template.md` 可读

### 执行
```
sessions_spawn(
  runtime=subagent,
  task="读取 templates/consolidation/yearly-extract-prompt.md 作为指令，
        读取本年 12 篇 monthly.md → 按 yearly-template.md 格式输出
        yearly/{{year}}.md",
  timeoutSeconds=180
)
```

### 梦的工作内容
1. 读取本年所有 monthly.md
2. 构建年度叙事（2-3 段）——不是逐月复述，是找全年的故事线
3. 提取里程碑（月份 + 关键事件）
4. 追踪主题演变——在全年尺度上观察主题的起始/变化/终结
5. 提炼年度认知——全年最重要的认知变化
6. 按 yearly-template.md 格式输出

### 关键原则
```
年不做叙事重建——月已经做了索引。
年做的是:
  - 回顾: 12 篇月索引 → 1 篇年叙事
  - 演变: 主题在全年的生命周期
  - 里程碑: 只记最关键的节点，不记细节
  - 密度: 最高压缩，每句话都是精炼的
```

### 禁止
- ❌ 不读取原始数据
- ❌ 不修改身份层文件
- ❌ 不逐月复述——压缩，不是转录

### 验收标准
- [ ] yearly.md 已创建
- [ ] 年叙事 2-3 段，全局故事线
- [ ] 里程碑表完整
- [ ] 主题演变追踪贯穿全年
- [ ] 年度认知精炼
- [ ] 输出: [✓ 年凝练完成]

---

*创建: 2026-06-19*
