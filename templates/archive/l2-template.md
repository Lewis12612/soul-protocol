# L2 日记忆模板

> **位置**: `memory/YYYY-MM-DD.md`  
> **用途**: 创建新日记忆文件时使用  
> **频率**: 每日（首次心跳时自动创建）
> **创建方式**: heartbeat 模块检测到 L2 不存在时自动调用 `createEmptyL2()`

---

# {{date}} 记忆

> {{weekday}} | {{session_status}}

---

## 📋 今日概览

**状态**: {{status}}
**首次连线**: {{first_connection}}
**模型**: {{model}}

---

## 💬 对话记录

### {{time_range}} {{topic}}

---

## 📋 跨日交接（固定末尾）

### 🔄 长期项目追踪
| 项目 | 启动日期 | 状态 | 进度说明 |
|------|----------|------|----------|
| ... | ... | ... | ... |

### 待办清单状态
| 待办项 | 状态 | 说明 |
|--------|------|------|
| ... | ... | ... |

### 实验结果
...

### 断点记录
...

### 续接点建议
...

### 文件位置速查
| 文件 | 路径 |
|------|------|
| 今日L2 | memory/{{date}}.md |
| 今日日记 | memory/memory-core/diary/{{year}}/{{month}}/{{date}}.md |
| deep归档 | memory/memory-core/deep-dialogue/{{year}}/{{month}}/ |
| work归档 | memory/memory-core/work-dialogue/{{year}}/{{month}}/ |
| daily归档 | memory/memory-core/daily-dialogue/{{year}}/{{month}}/ |

---

*创建: {{creation_time}}*
*最后更新: {{last_update}}*
