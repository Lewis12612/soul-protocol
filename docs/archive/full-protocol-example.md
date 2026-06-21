# Full协议输出示例（V3.8.6-patch3）

> **修改日期**: 2026-05-15
> **修改内容**: 执行者改为your-agent + 删除INDEX更新 + L3从EXTRA提取 + 日记自由表达

---

## 修复后的协议输出

```markdown
【🌙 梦境整理】
系统归档 → 今日记忆系统性整理，梦将执行深层归档

【三我分层归档】
本我层(deep) → 原始欲望、深层冲动、自我认知
超我层(work) → 道德约束、理想自我、方法论
自我层(daily) → 现实适应、日常行为、人格温度

【心跳检查结果】
检查类型: full
检查时间: 2026-05-15T22:30:00+08:00

需执行行动:
execute_today (today_has_session)

【⚡ 强制行动清单】
以下行动必须在本轮心跳完成：

[1] L2跨日交接 【your-agent】
  → 操作: 读取昨日L2末尾跨日交接 → 更新今日L2末尾固定结构
  → 输出: [✓ L2已更新]

[2] daily归档 【spawn】
  → spawn指令: sessions_spawn(runtime=subagent, task="从EXTRA分段提取今日对话→daily-template格式", timeoutSeconds=120)
  → 操作: 按消息单元切分EXTRA当日对话，阈值≤500行/段，输出到daily-dialogue/YYYY/MM/YYYY-MM-DD-daily.md
  → 输出: [✓ daily归档完成]

[3] 创建日记 【your-agent】
  → 操作: 写入memory/memory-core/diary/YYYY/MM/YYYY-MM-DD.md（自由主观表达，无固定格式）
  → 输出: [✓ 日记已创建]

[4] deep归档 【spawn】
  → spawn指令: sessions_spawn(runtime=subagent, task="从EXTRA提取深度对话（概念辨析/顿悟/人格形成）→deep-dialogue格式", timeoutSeconds=120)
  → 操作: 从EXTRA原始对话提取深度内容（概念辨析/顿悟/人格形成），输出到deep-dialogue/YYYY/MM/YYYY-MM-DD.md
  → 输出: [✓ deep归档完成]

[5] work归档 【spawn】
  → spawn指令: sessions_spawn(runtime=subagent, task="从EXTRA提取工作经验（错误修正/方法论）→work-dialogue格式", timeoutSeconds=120)
  → 操作: 从EXTRA原始对话提取工作经验（错误修正/方法论），输出到work-dialogue/YYYY/MM/YYYY-MM-DD.md
  → 输出: [✓ work归档完成]

[6] EXTRA归档验证 【spawn】
  → spawn指令: sessions_spawn(runtime=subagent, task="验证守护进程归档状态", timeoutSeconds=60)
  → 操作: 检查守护进程是否正常归档EXTRA层对话
  → 输出: [✓ EXTRA归档验证通过]

[7] 清理SESSION-STATE 【spawn】
  → spawn指令: sessions_spawn(runtime=subagent, task="迁移未完成任务→清空SESSION-STATE", timeoutSeconds=60)
  → 操作: 迁移未完成任务到L2跨日交接 → 清空SESSION-STATE.md
  → 输出: [✓ SESSION-STATE已清理]

【协议声明】
完成所有行动后输出: [✓ 日终协议执行完毕]
任一行动失败输出: [✗ 协议失败: <原因>]

【⚡ SESSION-STATE强制验证】
本轮心跳必须验证以下内容：
[1] 活跃任务状态 → 输出: [✓ 任务: XXX / 状态: XXX]
[2] 关键发现/进展 → 输出: [✓ 发现: XXX] 或 [无变更]
[3] 超短期记忆 → 输出: [✓ 已记录] 或 [无需记录]

⚠️ 必须执行验证，无变更也需输出验证标记
完成验证后输出: [✓ SESSION-STATE验证完毕]
```

---

## V3.8 设计原则

| 原则 | 说明 |
|------|------|
| **钩子自动执行** | 检查+注入由钩子自动完成，LLM只执行驱动行动 |
| **L3从EXTRA提取** | deep/work/daily归档都从EXTRA原始对话提取，不从L2检测 |
| **INDEX自动更新** | 钩子自动更新INDEX，不需要LLM手动更新 |
| **日记自由表达** | 日记是主观表达，无固定格式模板 |
| **执行者=your-agent** | 协议执行者是your-agent，不是your-agent |

---

## 修复对比

| 维度 | 修复前（V3.7污染） | 修复后（V3.8） |
|------|-------------------|----------------|
| **执行者** | ❌ your-agent / spawn:your-agent的梦 | ✅ your-agent / spawn:your-agent的梦 |
| **INDEX更新** | ❌ LLM手动执行 | ✅ 钩子自动更新，已删除 |
| **L3归档来源** | ❌ 检测L2内容 | ✅ 从EXTRA原始对话提取 |
| **日记格式** | ❌ 当日摘要+思考+金句 | ✅ 自由主观表达，无固定格式 |
| **deep/work执行者** | ❌ your-agent手动判断 | ✅ spawn:your-agent的梦从EXTRA提取 |

---

*创建: 2026-05-15 22:37*
*编译验证: ✅ 通过*
