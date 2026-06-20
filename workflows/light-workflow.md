# Light Workflow — V3.8.6

> **触发**: 每次 `before_prompt_build` 钩子，trigger != "heartbeat" 时跳过检查仅注入
> **执行者**: soul-protocol 插件（自动）
> **频率**: 每次心跳 poll（约 30s 间隔）

---

## 自动执行流程

```
before_prompt_build 钩子触发
  ↓
determineScenario(trigger, msgCount, state)
  ↓ trigger === "heartbeat" ?
  ├─ 是 → heartbeat 场景
  │   ↓
  │   determineCheckType()
  │   ↓ light（默认）
  │   ↓
  │   executeCheckScriptWithLog("check-light.sh")
  │   ↓
  │   required_actions:
  │     - update_session_state → 硬编码执行
  │     - create_l2 → 硬编码执行（如不存在）
  │   ↓
  │   buildProtocol("light", result) → prependSystemContext
  │   ↓
  │   readRecentL2 → appendSystemContext
  │   ↓
  │   updateIndex → 硬编码执行
  ├─ 否（用户对话）→ 仅记忆注入，不执行检查脚本
```

## 注入内容

| 内容 | 来源 | 注入位置 |
|------|------|----------|
| Light 协议 | check-light.sh 输出 → protocol.ts | prependSystemContext |
| L2 最近记忆 | memory/2026-*.md（最近2个） | appendSystemContext |

## 硬编码自动化

| 操作 | 条件 | 执行者 |
|------|------|--------|
| updateSessionState | required_actions 中有 | hardcoded 模块 |
| createEmptyL2 | L2 不存在 | hardcoded 模块 |
| updateIndex | 每次心跳 | hardcoded 模块 |

## LLM 职责

无。Light 检查完全由插件自动执行，LLM 只接收注入的协议文本作为上下文。
