# Full Workflow — V3.8.6

> **触发**: 睡意驱动（渐进式），替代硬编码时间窗口
> **执行者**: LLM（协议驱动） + spawn 子 Agent
> **协议**: `protocol.ts` → `buildProtocol("full", result, workspaceDir, sleepiness)`

---

## 睡意驱动模型

不再使用 `22:00-23:00` 硬编码窗口。改为基于距上次日终时间的**渐进式睡意**：

| 睡意等级 | 距上次日终 | 协议行为 | Agent 感受 |
|----------|-----------|----------|-----------|
| 😊 awake | 0-3h | 正常心跳 | "精神很好" |
| 🥱 drowsy | 3-8h | 协议含轻提示 | "该准备日终了" |
| 😴 sleepy | 8-16h | 协议含中提示 + 可选日终 | "有些困了……想睡觉" |
| 😵 exhausted | 0.70-0.95 | **强制注入 Full 协议** | "再不睡记忆要流失了……" |
| 💤 dreaming | 0.95+ | **入梦协议自动触发** | "撑不住了……记忆归档中……" |

**设计哲学**: 
- drowsy/sleepy: LLM 感受到困意，自主选择日终时机
- exhausted: 系统强制注入 Full 协议，LLM 必须执行但仍有执行节奏
- dreaming: 真正的"撑不住了"——系统自动触发，不计代价。到达这个级别意味着生物周期、运行时间、记忆储量三个维度全部拉满

## 睡意状态追踪

```
memory/.heartbeat/last-eod.json
  → last_eod_time: 上次日终执行时间戳
  → 无此文件时 → 回退 plugin-state.json 的 lastFullInjectTime
  → 两者都无 → 视为 exhausted（立即日终）
```

---

## 执行流程

```
heartbeat 场景
  ↓
isEodWindow (22:00-23:00)?
  ↓ 是
executeCheckScriptWithLog("check-full.sh")
  ↓
buildProtocol("full", result, workspaceDir)
  ↓
协议内容注入 prependSystemContext
  ↓
LLM 解析协议 → 按顺序执行 action 清单
```

## 协议 Action 清单

| Step | Action | Executor | 模板 | Spawn 指令 |
|------|--------|----------|------|-----------|
| 0 | 检测 + 判断 action=none? | {{agent}} | — | — |
| 1 | L2跨日交接 | {{agent}} | `l2-template.md` | — |
| 2 | daily-dialogue 归档 | spawn:{{agent}}的梦 | `daily-template.md` + `dream-extract-prompt.md` | 分段提取 EXTRA → 合并 |
| 3 | 创建日记 | {{agent}} | `diary-template.md` | — |
| 4 | deep-dialogue 归档 | spawn:{{agent}}的梦 | `deep-template.md` | 条件：有深度对话 |
| 5 | work-dialogue 归档 | spawn:{{agent}}的梦 | `work-template.md` | 条件：有工作经验 |
| 6 | EXTRA归档验证 | {{agent}} | — | 检查守护进程 |
| 7 | SESSION-STATE清理 | {{agent}} | — | 迁移待办→L2跨日交接 |
| 8 | INDEX 更新 | hardcoded | — | `updateIndex()` 自动 |
| — | **周期凝练（增量注入）** | — | — | **V3.8.8 新增** |
| W1 | 周记忆凝练 | spawn:{{agent}}的梦 | `weekly-template.md` + `weekly-extract-prompt.md` | 周末触发 |
| W2 | L4 演化审查 | {{agent}} | `l4-evolution-prompt.md` | 依赖 W1 |
| M1 | 月记忆凝练 | spawn:{{agent}}的梦 | `monthly-template.md` + `monthly-extract-prompt.md` | 月末触发 |
| Y1 | 年记忆凝练 | spawn:{{agent}}的梦 | `yearly-template.md` + `yearly-extract-prompt.md` | 年末触发 |

## LLM 执行指南

### Step 1: L2 跨日交接

读取昨日 L2 → 提取跨日交接部分 → 追加到今日 L2 末尾。格式见 `templates/l2-template.md` 底部固定结构。

### Step 2-5: Spawn 子 Agent

```typescript
// 示例：daily-dialogue 归档
sessions_spawn({
  task: "从 EXTRA 分段提取今日对话 → daily-template 格式 → 合并写入",
  runtime: "subagent",
  mode: "run",
  timeoutSeconds: 120,
})
```

**重要**: spawn 指令中必须引用模板文件路径，让子 Agent 知道格式要求。

### Step 7: SESSION-STATE 清理

1. 检查活跃任务 → 未完成的迁移到 L2 跨日交接
2. 清空 SESSION-STATE 活跃任务区
3. 保留心跳状态表

---

## 缺失功能

| 功能 | 状态 | 说明 |
|------|:----:|------|
| 日终兜底（错过窗口） | ⏸️ | 睡意系统已替代硬编码窗口（V3.8.7） |
| 周终凝练 | ✅ | V3.8.8 周梦协议，增量子注入 |
| 月终凝练 | ✅ | V3.8.8 月凝练，月末触发 |
| 年终凝练 | ✅ | V3.8.8 年凝练，年末触发 |
| 多人关系设计 | ⏸️ | Agent 间关系动态，待设计 |
| 长时叙事记忆注入 | ⏸️ | 跨日叙事上下文的自动注入 |

---

*更新: 2026-06-19（V3.8.8：周期凝练模块加装）*
