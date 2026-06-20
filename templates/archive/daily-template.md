# daily-dialogue 模板

> **用途**: 日终归档时创建 daily-dialogue 文件  
> **位置**: `memory/memory-core/daily-dialogue/YYYY/MM/YYYY-MM-DD.md`
> **创建方式**: spawn:{{agent}}的梦 分段提取 EXTRA → 合并写入

---

# {{date}} daily-dialogue

> **日期**: {{date}}（周{{weekday}}）
> **会话时间**: {{session_time_range}}
> **触发场景**: {{scenario}}

---

## 🎯 关键互动

### [话题名]

- [HH:MM] [对话内容]
- ...

---

## 💫 温度瞬间

### [类别名]

- [HH:MM] [互动内容]
- ...

---

## 📝 特征记录

### [维度名]

- [观察内容]
- ...

---

## ⚠️ 需调整（如有）

| 问题 | 反馈 | 应调整 |
|------|------|--------|
| ... | ... | ... |

---

## 🔗 相关文件

| 文件 | 路径 |
|------|------|
| deep归档 | deep-dialogue/YYYY/MM/YYYY-MM-DD-xxx.md |
| work归档 | work-dialogue/YYYY/MM/YYYY-MM-DD-xxx.md |
| 日记 | diary/YYYY/MM/YYYY-MM-DD.md |
| L2 | memory/YYYY-MM-DD.md |

---

*归档时间: {{archive_time}}*
*归档者: spawn:{{agent}}的梦（分段提取）*
