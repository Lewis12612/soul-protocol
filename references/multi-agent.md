# 多 Agent 协作架构

> **版本**: V3.8.6
> **Agent**: your-agent（主）+ your-agent的梦（spawn）

---

## Agent 角色

| Agent | 角色 | Gateway | workspace |
|-------|------|---------|-----------|
| your-agent | 主 Agent（对话/决策） | 19000 | ~/your-openclaw-instance/workspace |
| your-agent的梦 | spawn 子 Agent（归档/清理） | 继承 | 继承 |

## Spawn 机制

日终 Full 协议中定义 spawn 任务：

```typescript
sessions_spawn({
  task: "从 EXTRA 分段提取今日对话 → daily-template 格式",
  runtime: "subagent",
  mode: "run",
  timeoutSeconds: 120,
})
```

### Spawn 任务分配

| 任务 | Executor | 原因 |
|------|----------|------|
| daily-dialogue 归档 | spawn:梦 | 大量文本提取，独立上下文 |
| deep-dialogue 归档 | spawn:梦 | 需要专注的语义提取 |
| work-dialogue 归档 | spawn:梦 | 方法论提取 |
| L2 跨日交接 | 主 Agent | 需要对话上下文 |
| 写日记 | 主 Agent | 主观表达 |
| SESSION-STATE 清理 | 主 Agent | 状态管理 |

### Spawn 模板引用

子 Agent 需要格式参考时，读取 `templates/` 目录下的模板文件。Spawn 指令中必须包含模板文件路径。

## 跨 Agent 通信

| 方式 | 用途 |
|------|------|
| 共享文件系统 | EXTRA 对话日志、记忆文件 |
| sessions_spawn task | 子 Agent 任务描述 |
| spawn result | 子 Agent 完成后返回结果 |

## 部署要求

要部署到另一个 Agent（如your-agent），需要：
1. 修改路径硬编码（EXTRA、openclaw.json、skills 路径）
2. 修改协议中的 Agent 名称
3. 独立配置 pluginConfig（workspaceDir、eod 窗口等）
