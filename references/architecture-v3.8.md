# 灵魂系统 V3.8 架构参考

> **对应版本**: V3.8.6
> **技术文档**: `memory/architecture/v3.8.6-technical-document.md`
> **审计报告**: `memory/architecture/v3.8.6-audit-2026-06-18.md`

---

## 核心架构

```
┌─────────────────────────────────────────────────────┐
│                  OpenClaw 钩子框架                    │
│  before_prompt_build          before_tool_call       │
├─────────────────────────────────────────────────────┤
│  soul-protocol 插件                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ index.ts │  │  hub.ts  │  │ before-tool-call   │  │
│  │ 插件注册  │→│ 场景分发  │  │ 安全拦截           │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                   │                                  │
│     ┌─────────────┼─────────────┐                    │
│     ↓             ↓             ↓                    │
│  startup.ts  heartbeat.ts  recovery.ts              │
│  (全量注入)   (增量+检查)    (compact恢复)           │
│     │             │             │                    │
│     └─────────────┼─────────────┘                    │
│                   ↓                                  │
│         hardcoded/index.ts                           │
│         (脚本执行 + 日志 + 状态更新)                   │
│                   │                                  │
│     ┌─────────────┼─────────────┐                    │
│     ↓             ↓             ↓                    │
│  check-light   check-medium  check-full              │
│     .sh           .sh          .sh                   │
│                   │                                  │
│              protocol.ts                             │
│              (协议提示词构建)                          │
│                   │                                  │
│              LLM 执行                                 │
│              (按协议 action 清单执行)                  │
└─────────────────────────────────────────────────────┘
```

## 记忆层级

| 层级 | 位置 | 内容 | 注入方式 |
|------|------|------|----------|
| L0 | SOUL/IDENTITY/USER/MEMORY.md | 身份层 | 框架 bootstrap |
| L1 | SESSION-STATE.md | 跨对话工作交接 | startup/recovery 自动 |
| L2 | memory/YYYY-MM-DD.md | 日记忆 | startup/recovery/心跳 自动 |
| L3 | memory/memory-core/ | 深度/工作/日常归档 | 日终 spawn 归档 |
| EXTRA | /path/to/dialogue-logs/ | 原始对话日志 | 守护进程自动 |

## 场景分发

| 场景 | 触发条件 | 注入模式 | 检查脚本 |
|------|----------|----------|----------|
| startup | msgCount ≤ 2 | 全量 | 无 |
| heartbeat | trigger === "heartbeat" | 增量 + 检查 | light/medium/full |
| recovery | 消息数骤降 >50% | 全量（不创建 L2） | 无 |

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 插件注册、钩子挂载 |
| `src/hub.ts` | 场景路由分发 |
| `src/hooks/before-prompt-build.ts` | 场景判断 + 状态持久化 |
| `src/hooks/before-tool-call.ts` | 安全拦截 |
| `src/modules/startup.ts` | 启动场景 |
| `src/modules/heartbeat.ts` | 心跳场景 |
| `src/modules/recovery.ts` | Compact 恢复 |
| `src/modules/hardcoded/index.ts` | 脚本执行 + 日志 |
| `src/modules/memory/reader.ts` | 记忆文件读取 |
| `src/protocol.ts` | 协议提示词构建 |
| `src/parser.ts` | 身份层文件解析 |
| `src/monitor/` | 统计 + 健康检查 |
