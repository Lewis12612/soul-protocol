# Startup Workflow — V3.8.6

> **触发**: `before_prompt_build` 钩子检测到 `determineScenario() === "startup"`
> **条件**: `msgCount ≤ 2` 或 `state.lastMessageCount === -1`（首次运行）
> **执行者**: soul-protocol 插件（自动） + LLM（状态验证）

---

## 自动执行流程

```
before_prompt_build 钩子触发
  ↓
determineScenario(trigger, msgCount, state)
  ↓ startup?
  ↓
state.hasDoneStartup = true
  ↓
dispatch({ scenario: "startup" })
  ↓
startupScenario.execute()
  ↓
  1. readL3Index()        → L3 全量索引
  2. readRecentL2()       → 最近 2 个 L2
  3. readSessionState()   → 活跃任务 + 暂停任务
  4. verifyState()        → EXTRA路径/今日L2/心跳状态
  5. createEmptyL2()      → 创建今日 L2（如不存在）
  ↓
输出 → prependSystemContext
```

## 注入内容

| 内容 | 函数 | 说明 |
|------|------|------|
| L3 INDEX | `readL3Index()` | 全量记忆索引（P0-P4 优先级） |
| L2 最近记忆 | `readRecentL2()` | 最近 2 个日记忆文件 |
| SESSION-STATE | `readSessionState()` | 活跃任务 + 暂挂任务 |
| 状态验证提醒 | `verifyState()` | EXTRA 路径 + 今日 L2 + 心跳状态 |

## LLM 职责

收到启动注入后，必须执行 AGENTS.md 定义的 **启动读取顺序**：

```
SOUL.md → USER.md → MEMORY.md → L3 INDEX → L2 最近 → SESSION-STATE
```

然后执行 **状态验证（STEP 6）**：
- 验证 EXTRA 路径可访问
- 验证今日 L2 存在
- 验证心跳状态不超过 2 小时

## 与 Recovery 的区别

| 维度 | Startup | Recovery |
|------|---------|----------|
| 触发 | 首次 / msgCount ≤ 2 | 消息数骤降 > 50%（compact 后） |
| L2 创建 | ✅ createEmptyL2() | ❌ 不创建（已存在） |
| 其他注入 | 完全相同 | 完全相同 |

> ⚠️ startup.ts 和 recovery.ts 代码几乎完全相同（仅 createEmptyL2 差异），
>   建议合并为 `fullInjectScenario({ createL2: boolean })`。
