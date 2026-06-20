# 月凝练工作流（强制执行）

> **触发**: 日终 + 周凝练完成后，`month_end.is_month_end = true`
> **执行者**: spawn:{{agent}}的梦
> **依赖**: 本月所有 weekly.md 已存在

---

## Step M1: 月记忆凝练 ⭐ spawn:{{agent}}的梦

### 前置检查
- [ ] 本月 4-5 篇 weekly.md 存在
- [ ] `templates/consolidation/monthly-extract-prompt.md` 可读
- [ ] `templates/consolidation/monthly-template.md` 可读

### 执行
```
sessions_spawn(
  runtime=subagent,
  task="读取 templates/consolidation/monthly-extract-prompt.md 作为指令，
        读取本月 4-5 篇 weekly.md → 按 monthly-template.md 格式输出
        monthly/{{year}}/{{year}}-{{month}}.md",
  timeoutSeconds=120
)
```

### 梦的工作内容
1. 读取本月所有 weekly.md
2. 提取各周叙事主线 → 串联为月叙事（1-2 段）
3. 建立关键事件时间线表
4. 提取所有主题 → 建立主题索引（标注新/延续/转折）
5. 跨月关联（读取上月 monthly.md，如有）
6. 认知汇总去重
7. 按 monthly-template.md 格式输出

### 关键原则
```
月不做叙事重建——周已经做了叙事。
月做的是:
  - 压缩: 4-5 篇周摘要 → 1 篇月索引
  - 关联: 跨周主题发现
  - 索引: 可快速检索的月级摘要
```

### 禁止
- ❌ 不读取原始 EXTRA/L2/L3（周已经做了）
- ❌ 不重建叙事弧（周已经做了）
- ❌ 不修改身份层文件

### 验收标准
- [ ] monthly.md 已创建
- [ ] 月叙事 1-2 段，串联各周主线
- [ ] 关键事件时间线完整
- [ ] 主题索引标注了新/延续/转折
- [ ] 认知汇总去重完成
- [ ] 输出: [✓ 月凝练完成]

---

*创建: 2026-06-19*
