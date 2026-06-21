# Execution Result Schema 设计

> **定位**: LLM执行日终任务的追踪和记录机制
> **创建**: 2026-05-14

---

## 问题背景

V3.8.6 架构中：
- 插件执行检查脚本 → 返回 `required_actions`
- 协议注入 → LLM收到 `action: execute_today`
- **断点**: 插件不知道LLM是否执行了

设计目标：让插件能够追踪和记录LLM的执行结果。

---

## 设计方案

### 方案：工具调用追踪 + 文件状态检测

| 机制 | 实现位置 | 职责 |
|------|----------|------|
| **工具调用追踪** | before_tool_call 钩子 | 实时识别日终相关工具调用 |
| **文件状态检测** | heartbeat 模块 | 下次心跳检测文件变化，验证执行结果 |
| **执行状态文件** | plugin-state.json | 持久化执行记录 |
| **日志合并** | heartbeat log | 综合检查+执行结果 |

---

## Schema 定义

### 1. ExecutionAction 类型

```typescript
type ExecutionAction = {
  action: string;           // 动作类型
  target?: string;          // 目标文件/对象
  timestamp: number;        // 执行时间（ms）
  source: "tool_call" | "file_detect";  // 来源
  success?: boolean;        // 是否成功（file_detect时推断）
};
```

**动作类型列表**：

| action | 说明 | 工具识别规则 |
|--------|------|--------------|
| `diary_created` | 创建日记 | `write` + path匹配 `diary/**/*.md` |
| `l3_archived` | L3归档 | `write` + path匹配 `deep-dialogue|work-dialogue|daily-dialogue/**/*.md` |
| `l2_updated` | L2更新 | `edit` + path匹配 `memory/YYYY-MM-DD.md` |
| `session_state_cleaned` | SESSION-STATE清理 | `edit` + path匹配 `SESSION-STATE.md` |
| `index_updated` | INDEX更新 | `write` + path匹配 `INDEX.md` |

### 2. ExecutionResult 类型

```typescript
type ExecutionResult = {
  status: "pending" | "in_progress" | "completed" | "failed";
  startTime: number;        // 协议注入时间
  endTime?: number;         // 完成时间
  tasks: ExecutionAction[]; // 执行的任务列表
  summary?: string;         // LLM输出标记（可选）
};
```

### 3. PluginState 扩展

```typescript
type PluginState = {
  // 现有字段
  stateVersion: number;
  lastMessageCount: number;
  lastHeartbeatTime: number;
  lastFullInjectTime: number;
  hasDoneStartup: boolean;
  
  // 新增字段
  pendingExecution?: ExecutionResult;  // 待执行的任务
  lastExecution?: ExecutionResult;     // 最近一次执行结果
};
```

### 4. HeartbeatLogEntry 扩展

```typescript
type HeartbeatLogEntry = {
  timestamp: string;
  checkType: "light" | "medium" | "full";
  trigger: string;
  actions: string[];
  results: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
  
  // 新增字段
  execution?: ExecutionResult;  // 执行结果（仅full检查时）
};
```

---

## 实现流程

### Phase 1: 协议注入时初始化

**位置**: `heartbeat.ts` Full检查分支

```typescript
// Full检查返回 action: execute_today 时
if (fullResult.action?.action === "execute_today") {
  // 初始化 pendingExecution
  state.pendingExecution = {
    status: "pending",
    startTime: Date.now(),
    tasks: [],
  };
  saveState(workspaceDir, state);
}
```

### Phase 2: 工具调用追踪

**位置**: `before_tool_call.ts`

```typescript
// 识别日终相关工具调用
function trackExecutionAction(toolName: string, params: Record<string, unknown>): ExecutionAction | null {
  const path = params.path || params.file_path;
  
  // diary 创建
  if (toolName === "write" && path?.includes("diary/")) {
    return { action: "diary_created", target: path, timestamp: Date.now(), source: "tool_call" };
  }
  
  // L3 归档
  if (toolName === "write" && path?.match(/deep-dialogue|work-dialogue|daily-dialogue/)) {
    return { action: "l3_archived", target: path, timestamp: Date.now(), source: "tool_call" };
  }
  
  // L2 更新
  if (toolName === "edit" && path?.match(/memory\/\d{4}-\d{2}-\d{2}/)) {
    return { action: "l2_updated", target: path, timestamp: Date.now(), source: "tool_call" };
  }
  
  return null;
}

// 在钩子中调用
const action = trackExecutionAction(toolName, params);
if (action && state.pendingExecution) {
  state.pendingExecution.tasks.push(action);
  state.pendingExecution.status = "in_progress";
  saveState(workspaceDir, state);
}
```

### Phase 3: 文件状态检测

**位置**: `heartbeat.ts` 下次心跳

```typescript
function detectExecutionResult(workspaceDir: string, state: PluginState): ExecutionResult {
  const pending = state.pendingExecution;
  if (!pending) return null;
  
  // 检测 diary 是否创建
  const diaryPath = `memory/memory-core/diary/${getTodayStr()}.md`;
  const diaryExists = fs.existsSync(path.join(workspaceDir, diaryPath));
  
  // 检测 L3 文件变化（对比上次 INDEX）
  const indexPath = path.join(workspaceDir, "memory/memory-core/INDEX.md");
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  const l3Count = countL3Files(indexContent);
  
  // 推断执行结果
  const completedTasks: ExecutionAction[] = [];
  
  if (diaryExists && !pending.tasks.some(t => t.action === "diary_created")) {
    completedTasks.push({
      action: "diary_created",
      target: diaryPath,
      timestamp: Date.now(),
      source: "file_detect",
      success: true,
    });
  }
  
  // 合并结果
  const allTasks = [...pending.tasks, ...completedTasks];
  const status = allTasks.length > 0 ? "completed" : "pending";
  
  return {
    status,
    startTime: pending.startTime,
    endTime: Date.now(),
    tasks: allTasks,
  };
}
```

### Phase 4: 日志合并

**位置**: `heartbeat.ts` Full日志写入

```typescript
// 写入心跳日志时包含执行结果
if (checkType === "full" && state.lastExecution) {
  entry.execution = state.lastExecution;
}
```

---

## LLM输出标记（可选增强）

在协议中增加输出要求：

```markdown
## 执行完毕后请输出

完成日终任务后，请输出以下标记：

[✓ 日终执行完成]
- diary: 已创建/已存在
- L3归档: 已归档X个对话
- L2更新: 已更新跨日交接
```

插件可通过解析session历史（如果OpenClaw提供API）提取此标记。

---

## 文件位置

| 文件 | 路径 |
|------|------|
| 执行状态 | `memory/.heartbeat/plugin-state.json` |
| 心跳日志 | `skills/soul-protocol/logs/soul-protocol-YYYYMMDD.log` |
| Schema文档 | `docs/execution-schema.md` |

---

## 实现优先级

| 任务 | 优先级 | 说明 |
|------|--------|------|
| PluginState 扩展 | P0 | 增加 pendingExecution/lastExecution |
| 工具调用追踪 | P0 | before_tool_call 增加日终识别 |
| 文件状态检测 | P1 | 下次心跳推断执行结果 |
| 日志合并 | P1 | heartbeat log 增加 execution 字段 |
| LLM输出标记 | P2 | 协议增加输出要求（可选） |

---

*创建: 2026-05-14*
*状态: 设计完成，待实现*