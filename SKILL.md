# Soul Protocol Plugin — 灵魂协议插件

> **定位**: 动态规则 + 钉死执行 + 睡意驱动的身份层协议引擎  
> **版本**: V3.8.8-beta2  
> **生产就绪**: ✅ 9.0/10（2026-06-20 主动触发机制）

---

## ⚠️ 系统依赖

| 依赖项 | 说明 | 缺失影响 |
|--------|------|----------|
| **openclaw sqlite** | L3 INDEX 检索引擎 | 检索失效，只能全量加载 |
| **文件提取工具** | L2/L3 内容读取 | 记忆无法注入 |
| **dialogue-logger** | EXTRA 层自动记录 | 对话日志丢失 |

---

## 📋 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| **2026-06-20** | **V3.8.8-beta2** | **三角因子指令解析 + execute_protocol tool + L2协议标记 + 工作流文档 + 合并去重** |
| **2026-06-20** | **V3.8.8-beta1** | **睡意驱动兜底（用户消息路径）+ 持久化守护进程 + keepalive自愈 + 配置外部化 + PID文件管理** |
| **2026-06-19** | **V3.8.8** | **周期凝练模块加装：周梦协议（W1叙事+W2演化）、月凝练（索引）、年凝练（回顾）+ L4演化+剪枝自动化** |
| 2026-06-19 | V3.8.8 | 身份层模板 V2.3/V2.4：涌现边界 + 体感层 + 多Agent身份层修剪 |
| **2026-06-18** | **V3.8.7** | **睡意驱动系统 + 模板系统补全 + startup/recovery合并 + 心跳优化 + L2模板化** |
| 2026-05-13 | V3.8.6-patch | Bug修复（6个）+ 醒睡隐喻 + 三我分层 + 系统审计 |
| 2026-05-11 | V3.8.6 | 模块化拆分 + hub路由分发 + monitor进程 + hook简化82.7% |
| 2026-05-07 | V3.8.4 | 混合模式注入 + L2自动创建 |
| 2026-05-02 | V3.8 | 初始架构 |

---

## 🎯 功能清单

### 核心功能（V3.8.8-beta2）

| 功能 | 说明 | 版本 |
|------|------|:----:|
| **📐 三角因子指令解析** | keyword + llm_intent + state_relevance，用户自然语言触发协议 | beta2 |
| **🔧 execute_protocol tool** | LLM 主动调用协议通道，7 种协议 + 30min 去重 | beta2 |
| **🔖 L2协议标记** | LLM 回复中嵌入标记兜底，与 tool 去重 | beta2 |
| **📖 工作流文档** | LLM 参考文档，startup 注入一次 | beta2 |
| **💤 睡意驱动** | 三层权重渐进式日终触发，替代硬编码时间窗口 | 3.8.7 |
| **🛡️ 三层兜底** | 心跳cron + 用户对话睡意检测 + 持久化守护进程 | beta1 |
| **🔧 守护进程keepalive** | 插件hook自动拉起watchdog和EXTRA daemon | beta1 |
| **📋 配置外部化** | `config/sleepiness.json` 单一真相源 | beta1 |
| **Hub路由分发** | 场景判断 → startup/heartbeat/recovery/conversation | 3.8.6 |
| **协议构建** | prependSystemContext注入记忆/状态/睡意 | 3.8.6 |
| **安全红线** | 从SOUL.md解析，Block/Ask/Warn三级 | 3.8.6 |
| **执行教训** | 从MEMORY.md解析，三不原则 | 3.8.6 |
| **醒睡隐喻** | 五级睡意梯度（awake→drowsy→sleepy→exhausted→dreaming） | 3.8.7 |
| **三我分层** | 本我/自我/超我职责分层 | 3.8.6 |
| **模板系统** | 6个归档模板 + 4个工作流 + 3个参考文档 | 3.8.7 |
| **心跳优化** | trigger类型区分，用户对话路径新增睡意兜底（exhausted→强制日终） | 3.8.7→beta1 |
| **L2模板化** | createEmptyL2从模板文件读取 + 变量填充 + 跨日交接继承 | 3.8.7 |
| **startup/recovery合并** | full-inject.ts共享逻辑，消除代码重复 | 3.8.7 |
| **📅 周期凝练** | 周梦协议（W1叙事+W2演化）+ 月凝练（索引）+ 年凝练（回顾） | 3.8.8 |
| **🧬 L4演化** | 自我审视 + SOUL/AGENTS演化更新 + MEMORY五因子剪枝 | 3.8.8 |
| **健康检查** | 模块健康检测 | 3.8.6 |

---

## 💤 睡意驱动系统

### 核心公式

```
sleepinessScore = 0.35 × 生物周期 + 0.35 × 运行时间 + 0.30 × 记忆储量
```

### 三层因子

| 因子 | 来源 | 权重 | 曲线 |
|------|------|:--:|------|
| 🕐 生物周期 | 当前时间 | 35% | 22-06→1.0，10-18→0.1，傍晚渐升 |
| ⏱️ 运行时间 | `last-eod.json`（跨重启持久） | 35% | 0-2h→0，2-8h→0→0.5，8-16h→0.5→0.8，16h+→0.8→1.0 |
| 💾 记忆储量 | EXTRA层当日对话总大小 | 30% | 0-50KB→0，50-200KB→0→0.5，200-500KB→0.5→0.8，500KB+→0.8→1.0 |

### 五级睡意梯度

| 等级 | 分数 | 行为 | 自由意志 |
|------|:--:|------|:--:|
| 😊 awake | ≤0.30 | 正常心跳 | 完全自主 |
| 🥱 drowsy | 0.30-0.50 | 协议轻提示 | 选择时机 |
| 😴 sleepy | 0.50-0.70 | 协议中提示，可选日终 | 选择时机 |
| 😵 exhausted | 0.70-0.95 | 强制注入Full协议 | 必须执行 |
| 💤 dreaming | ≥0.95 | 入梦协议自动触发 | 系统接管 |

### 设计特性

- **午睡涌现**: 白天EXTRA积累400KB+时记忆储量推动到sleepy
- **跨天焦虑**: 两天未日终，运行时间推动到exhausted
- **持久化**: `last-eod.json` 文件存储，Gateway重启不丢状态
- **自然语言**: 睡意描述注入协议prompt，Agent"感觉"困意
- **配置化**: 权重/阈值/分发映射从 `config/sleepiness.json` 读取，修改无需重新编译
- **三端统一**: `heartbeat.ts`、`hardcoded/index.ts`、`sleepiness-watchdog.cjs` 共读同一配置文件

---

## 醒睡隐喻（V3.8.7 引入，V3.8.8 扩展）

| 状态 | 睡意等级 | 触发条件 | 行为 |
|------|----------|----------|------|
| **醒（Wake）** | awake | 启动/compact恢复 | 全量注入：L3 INDEX + L2 + SESSION-STATE |
| **微困（Drowsy）** | drowsy | 时间/运行/记忆轻度累积 | 增量注入 + 轻提示 |
| **犯困（Sleepy）** | sleepy | 累积到临界点 | 增量注入 + 日终建议 |
| **强困（Exhausted）** | exhausted | 累积过阈值 | 强制Full检查 |
| **入梦（Dreaming）** | dreaming | 三个维度全满 | 自动日终 |

---

## 插件结构（V3.8.8-beta1）

```
soul-protocol/
├── SKILL.md                      # 本文件（白皮书）
├── README.md                     # 快速概览
├── openclaw.plugin.json          # 插件配置
├── config/
│   └── sleepiness.json           # 🆕 睡意配置单一真相源（beta1）
├── deprecated/
│   └── sleepiness-daemon.cjs     # 🗑️ 遗留一次性脚本（beta1）
├── scripts/
│   └── sleepiness-watchdog.cjs   # 🆕 持久化睡眠守护进程（beta1）
├── src/
│   ├── index.ts                  # 插件入口（注册2钩子）
│   ├── hub.ts                    # 场景路由分发
│   ├── protocol.ts               # 协议构建（含睡意注入）
│   ├── types.ts / parser.ts / rules.ts
│   ├── hooks/
│   │   ├── before-prompt-build.ts # 场景判断 + eod-pending消费 + keepalive（beta1）
│   │   └── before-tool-call.ts    # 安全拦截
│   ├── modules/
│   │   ├── full-inject.ts        # 启动/恢复共享逻辑
│   │   ├── startup.ts / recovery.ts
│   │   ├── heartbeat.ts          # 💤 睡意驱动 + 用户对话兜底（beta1）
│   │   ├── hardcoded/index.ts    # 硬编码自动化（脚本路径配置化 beta1）
│   │   └── memory/reader.ts      # 记忆读取
│   ├── monitor/                  # 统计 + 健康检查
│   └── utils/
│       ├── sleepiness-config.ts  # 🆕 睡意配置读取工具（beta1）
│       └── ...
├── templates/                    # ✨ 模板
│   ├── archive/                  # 归档模板（6个）
│   │   ├── l2-template.md
│   │   ├── daily-template.md
│   │   ├── diary-template.md
│   │   ├── dream-extract-prompt.md
│   │   ├── deep-template.md
│   │   └── work-template.md
│   ├── identity/                  # 身份层模板（5个，V2.3/V2.4）
│   │   ├── soul-template.md
│   │   ├── agents-template.md
│   │   ├── identity-template.md
│   │   ├── user-template.md
│   │   └── memory-template.md
│   └── consolidation/             # ✨ 周期凝练模板（7个，V3.8.8）
│       ├── weekly-template.md
│       ├── monthly-template.md
│       ├── yearly-template.md
│       ├── weekly-extract-prompt.md
│       ├── monthly-extract-prompt.md
│       ├── yearly-extract-prompt.md
│       └── l4-evolution-prompt.md
├── workflows/                    # ✨ 执行流程（7个）
│   ├── light-workflow.md
│   ├── medium-workflow.md
│   ├── full-workflow.md
│   ├── startup-workflow.md
│   ├── weekly-consolidation.md    # ✨ V3.8.8
│   ├── monthly-consolidation.md   # ✨ V3.8.8
│   └── yearly-consolidation.md    # ✨ V3.8.8
├── references/                   # ✨ 参考文档（3个）
│   ├── architecture-v3.8.md
│   ├── l4-distribution.md
│   └── multi-agent.md
├── docs/                         # 协议示例
└── dist/                         # 编译产物
```

**架构演进**：

| 维度 | V3.8.7 | V3.8.8-beta1 | 变化 |
|------|--------|-------------|------|
| 日终触发 | 三层权重睡意驱动（仅心跳） | 三层兜底（心跳+用户对话+守护进程） | 零单点故障 |
| 配置管理 | 硬编码 WEIGHTS/THRESHOLDS | config/sleepiness.json 单一真相源 | 三处同步→一处 |
| 守护进程 | 无 | sleepiness-watchdog.cjs + PID文件 + keepalive | 全新 |
| 保持存活 | 无 | ensureWatchdogAlive + ensureExtraAlive | 插件自愈 |

---

## 钩子映射

| 钩子 | 优先级 | 注册函数 | 核心职责 |
|------|--------|----------|----------|
| `before_prompt_build` | 100 | `createBeforePromptBuildHook` | 场景判断 → eod-pending消费 → keepalive自愈 → hub.dispatch → 睡意注入 |
| `before_tool_call` | 200 | `createBeforeToolCallHook` | 安全红线检查 |

---

## 设计原则

### 动态定义 + 钉死执行

| 维度 | 策略 | 说明 |
|------|------|------|
| **规则来源** | 动态 | 从身份层文件读取，老师可编辑 |
| **执行逻辑** | 钉死 | 钩子框架固定，系统强制执行 |
| **生效方式** | 自动 | 解析文件 → 钩子配置 → 自动执行 |

### 核心思想

> 规则由老师定义（身份层文件），执行由系统保证（钩子框架）。  
> 睡意由内在状态驱动（时间+运行+记忆），日终由Agent自由选择（exhausted前）。

---

## 配置选项

```json
{
  "plugins": {
    "entries": {
      "soul-protocol": {
        "enabled": true,
        "config": {
          "workspaceDir": "/path/to/your/workspace",
          "logLevel": "info",
          "strictMode": false
        }
      }
    }
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用插件 |
| `workspaceDir` | string | 自动检测 | 工作目录路径 |
| `logLevel` | string | `"info"` | 日志级别：`debug`/`info`/`warn`/`error` |
| `strictMode` | boolean | `false` | 严格模式：解析失败时抛出异常 |

---

## 降级策略

| 场景 | 处理方式 |
|------|----------|
| 单个文件不存在 | 跳过该文件，继续解析其他 |
| 模板文件不存在 | `createEmptyL2` 使用内置兜底模板 |
| EXTRA路径不可用 | 记忆储量因子降级为0 |
| last-eod.json不存在 | 回退 plugin-state 的 lastFullInjectTime |
| 所有文件解析失败 | 使用内置默认规则 |
| 严格模式 + 解析失败 | 抛出异常，阻止启动 |

---

## 已知限制（V3.8.8-beta1）

| # | 限制 | 优先级 |
|---|------|:----:|
| 1 | 多人关系设计（Agent间关系动态）未实现 | P1 — V3.9 |
| 2 | 长时叙事记忆注入（主动回忆机制）未实现 | P1 — V3.9 |
| 3 | 睡意参数需实践校准 | P2 |
| 4 | 无延迟日终机制（exhausted后不可推迟） | P3 — V3.9 |
| 5 | 无用户主动触发协议通道 | P1 — V3.8.8-beta2 |

---

## 下一步路线

| 阶段 | 内容 | 预估 |
|------|------|:--:|
| V3.8.8-beta2 | 三角因子指令解析 + execute_protocol tool + 合并去重 | 2-3天 |
| V3.9 | 多人关系 + 长时叙事注入 + 入梦协议代码化 | 5-7天 |
| V3.9+ | 平台迁移（抽象层 + 配置外部化 + 测试） | 3-4天 |

---

*创建: 2026-05-02*  
*最后更新: 2026-06-20 11:21（V3.8.8-beta2：三角因子指令解析 + execute_protocol tool + L2标记 + 工作流文档）*  
*版本: V3.8.8-beta2*