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
