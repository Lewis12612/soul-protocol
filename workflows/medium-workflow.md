# Medium Workflow — V3.8.6

> **触发**: heartbeat 场景中 `medium_due === true`（距上次 Medium > 2h）
> **执行者**: soul-protocol 插件（自动）
> **频率**: 约每 2 小时

---

## 自动执行流程

```
heartbeat 场景
  ↓
determineCheckType()
  ↓ medium_due?
  ├─ 是
  │   ↓
  │   executeCheckScriptWithLog("check-medium.sh")
  │   ↓
  │   buildProtocol("medium", result)
  │   ↓
  │   required_actions:
  │     - update_l2_incremental → LLM 需执行
  │   ↓
  │   prependSystemContext 注入
  ├─ 否 → Light 路径
```

## 注入内容

| 内容 | 来源 | 注入位置 |
|------|------|----------|
| Medium 协议 | check-medium.sh 输出 → protocol.ts | prependSystemContext |
| L2 最近记忆 | memory/（同 Light） | appendSystemContext |
| INDEX 更新 | hardcoded 模块 | 自动 |

## LLM 职责

收到 Medium 协议后，需检查 `required_actions`：

| Action | 说明 |
|--------|------|
| update_l2_incremental | 将当前对话增量写入今日 L2 |

Medium 协议透传 `required_actions`，但**不含详细 operation_guide**（因为 L2 增量更新的含义是自解释的：日记忆 = 记录今天发生的事）。

## 与 Light 的区别

| 维度 | Light | Medium |
|------|-------|--------|
| 检查脚本 | check-light.sh | check-medium.sh |
| 执行频率 | ~30s | ~2h |
| LLM 参与 | 无（全自动） | 有（L2 增量写入） |
| 协议内容 | 状态更新 | 状态更新 + L2 增量指导 |
