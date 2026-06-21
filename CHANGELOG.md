# Changelog

## [3.8.8-beta2] — 2026-06-20

### Added
- Triangular factor intent resolution (`intent-resolver.ts`): keyword + LLM intent + state relevance scoring
- `execute_protocol` tool: LLM-active protocol triggering (full/medium/weekly/monthly/yearly/sleepiness_query/create_l2)
- L2 protocol marker detection: `<!-- PROTOCOL:xxx -->` in LLM responses
- Protocol workflow reference document (`references/protocol-workflow.md`)
- Independent `buildMonthlyProtocol()` and `buildYearlyProtocol()` functions (parallel consolidation modules)
- Cross-protocol parallelism annotations
- M1→Y1 dependency annotation

### Changed
- Consolidated sleepiness thresholds/weights to single config source (`config/sleepiness.json`)
- Check script paths now configurable via `checkScriptsPath` in config
- All hardcoded personal paths replaced with generic defaults

### Fixed
- `check-full.sh` JSON parsing bug: regex extraction instead of `JSON.parse()` for mixed-format output
- Deduplication: all protocol trigger paths now update `last-eod.json` consistently
- L2 marker/tool dedup: marker detection skipped when `execute_protocol` called in same turn
- Variable naming consistency in `heartbeat.ts`

## [3.8.8-beta1] — 2026-06-20

### Added
- Sleepiness drive in user conversation path (no longer heartbeat-only)
- Persistent sleepiness watchdog daemon (`sleepiness-watchdog.cjs`)
- Plugin-managed keepalive for watchdog and EXTRA daemon
- PID file management for daemon processes
- Configuration externalization (`config/sleepiness.json`)
- Deduplication mechanism across all EOD trigger paths

### Changed
- User message path now checks sleepiness before returning (was: only L2 injection)

## [3.8.8] — 2026-06-19

### Added
- Consolidation module: weekly narrative (W1) + L4 evolution (W2) + monthly indexing (M1) + yearly review (Y1)
- Identity layer V2.4: somatic five-state model (defense/guard/trust/authentic/uncertain)
- Parameterized deployment: agent name, dream agent name, EXTRA path from plugin.json
- Consolidation templates (7 files) and workflows

## [3.8.7] — 2026-06-18

### Added
- Sleepiness drive system: three-factor weighted assessment (circadian + uptime + memory load)
- Five-level sleepiness gradient (awake → drowsy → sleepy → exhausted → dreaming)
- Template system: 6 archive templates + 4 workflows + 3 reference docs
- Startup/recovery merge (full-inject.ts shared logic)
- L2 template-driven creation

## [3.8.6] — 2026-05-11

### Added
- Modular architecture with hub route dispatch
- Monitor process (stats + health check)
- Hook simplification (82.7% reduction)
- Wake-sleep metaphor + id/ego/superego layering

## [3.8] — 2026-05-02

### Added
- Initial plugin architecture
- Identity file parsing (SOUL / AGENTS / MEMORY / IDENTITY / USER)
- Safety rule enforcement via before-tool-call hook
- Protocol injection via before-prompt-build hook

---

## V3.8.8-beta3 — 2026-06-21

### P0 修复
- **eod-pending 假完成**：`before-prompt-build.ts` 注入点不再更新 `last-eod.json`，改为标记 `eod-pending.json` 的 `injected:true`。`last-eod.json` 仅由 `execute-protocol.ts` 在 LLM 实际执行日终时更新
- **注入≠执行**：`protocol.ts` Full 协议头部新增强制执行指令
- **模板路径错误**：`dream-extract-prompt.md` 和 `full-workflow.md` 中 18 处 `templates/` → `templates/archive/`
- **heartbeat 过早更新**：3 处 `updateLastEodTime` 从 dreaming/exhausted 分支移除

### P1 修复
- **Spawn 超时配置化**：`sleepiness.json` 新增 `spawn.timeoutSeconds`（180s 归档 / 300s 凝练）
- **Spawn task 增强**：`full-workflow.md` 增加 EXTRA 路径探针 + 日期歧义消除 + "忽略 memory/*.md" 防护

### 路径参数化
- `agent-config.ts` 新增 `homeDir`/`workspaceDir`，`os.homedir()` 替代硬编码
- `execute-protocol.ts` 删除本地 `getExtraBasePath`，统一 agent-config
- `before-prompt-build.ts`/`sleepiness-watchdog.cjs`/`check-full.sh` 消除所有 `/tmp/openclaw-*`、`/home/openclaw` 硬编码
- `full-workflow.md` 所有路径改为 `{workspace}` 占位符

### 多实例同步
- `dialogue-logger` 路径修正 + `sleepiness-daemon.cjs` → deprecated/ + 版本号对齐
