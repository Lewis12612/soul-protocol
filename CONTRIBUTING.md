# Contributing to Soul Protocol

> Follow the project's modular routing philosophy: clear separation, independent modules, explicit entry points.

---

## Code of Conduct

- Focus on technical discussion. Respect different viewpoints.
- Issues and PRs in English or Chinese are both welcome.
- Be patient — this is an individually maintained open-source project.

---

## Issue Guidelines

### Bug Reports

Title format: `[Bug] module-name: one-line description`

Required content:
```
**Version**: (from package.json)
**Environment**: (Node.js version / OS / OpenClaw version)
**Steps to Reproduce**:
  1. ...
  2. ...
**Expected Behavior**: ...
**Actual Behavior**: ...
**Logs**: (relevant snippets from skills/soul-protocol/logs/)
```

### Feature Requests

Title format: `[Feature] module-name: one-line description`

Required content:
```
**Motivation**: What problem does this solve?
**Proposed Solution**: How should it work?
**Scope**: Which modules are affected? Breaking changes?
```

### Module Reference

| Module | Keywords |
|--------|----------|
| heartbeat | heartbeat, sleepiness drive |
| intent-resolver | intent resolution, triangular factor |
| execute-protocol | tool call, protocol execution |
| consolidation | weekly, monthly, yearly consolidation |
| before-prompt-build | hooks, scenario dispatch, keepalive |
| protocol | protocol rendering, Full/Medium/Light |
| watchdog | daemon process, eod-pending |
| config | sleepiness.json, configuration |
| docs | README, SKILL, documentation |

---

## PR Process

### 1. Branch Naming

```
git checkout -b feature/module-short-description
# Example: git checkout -b feature/intent-resolver-add-protocol
```

### 2. Code Style

- TypeScript strict mode (`tsconfig.json` → `strict: true`)
- Use the project's logger wrapper (`createLogger("module:xxx")`) — **no** `console.log`
- Module headers MUST include JSDoc describing purpose and responsibility
- New modules go in the appropriate directory:
  - Hook logic → `src/hooks/`
  - Protocol modules → `src/modules/`
  - Tool registration → `src/tools/`
  - Config readers → `src/utils/`
- Error handling: every `try/catch` must have `log.warn` or `log.error`. No empty catches.

### 3. Build Verification

```bash
npm run build        # tsc --noEmit + tsc
```

**Zero errors** required before submitting PR.

### 4. Commit Format

```
type(scope): short description

Detailed description (optional)
```

Types: `feat` / `fix` / `docs` / `refactor` / `chore`

Example:
```
feat(intent-resolver): add protocol sorting support
fix(heartbeat): fix conversation path dedup failure
docs(SKILL): update V3.8.8-beta2 feature list
```

### 5. PR Description

Title format: `[module] one-line description`

Required content:
```
**Type**: feat / fix / docs / refactor / chore
**Related Issue**: #xxx (if any)
**Testing**: build passed / manual test scenarios
**Scope**: which modules are affected
```

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 22
- OpenClaw Gateway (for runtime testing)
- TypeScript ≥ 5.x

### Setup

```bash
# 1. Clone
git clone <repo-url>
cd soul-protocol

# 2. Install (dev dependencies only)
npm install

# 3. Build
npm run build

# 4. Link to OpenClaw workspace
ln -s $(pwd) ~/.openclaw/workspace/skills/soul-protocol

# 5. Register plugin
# In openclaw.json → plugins.load.paths add this directory
# In plugins.allow add "soul-protocol"

# 6. Configure
cp openclaw.plugin.json.example openclaw.plugin.json
# Edit: agentName, dreamAgentName, extraBasePath

# 7. Restart Gateway
openclaw gateway restart
```

### Quick Directory Reference

```
src/
├── index.ts             # Plugin entry (hook + tool registration)
├── hub.ts               # Scenario routing
├── protocol.ts          # Protocol builders (Light/Medium/Full)
├── types.ts             # Type definitions
├── hooks/
│   ├── before-prompt-build.ts  # Main hook (scenario + injection + keepalive)
│   └── before-tool-call.ts     # Safety interception
├── modules/
│   ├── heartbeat.ts            # Heartbeat + sleepiness + conversation path
│   ├── intent-resolver.ts      # Triangular factor intent resolution
│   ├── hardcoded/index.ts      # Script execution + state updates
│   └── memory/
│       ├── reader.ts           # L2/L3 memory reader
│       └── consolidation.ts    # Weekly/monthly/yearly consolidation
├── tools/
│   └── execute-protocol.ts     # execute_protocol tool
└── utils/
    ├── agent-config.ts         # Agent name/path parameterization
    ├── sleepiness-config.ts    # Sleepiness config reader
    └── logger.ts              # Logging wrapper
config/
│   └── sleepiness.json         # Single source of truth
scripts/
│   ├── sleepiness-watchdog.cjs # Standalone daemon
│   └── check-*.sh              # Check scripts
```

---

## Design Principles (Read Before Contributing)

1. **Module Independence** — Each module has a single responsibility. Do not mix two protocol logics in one module.
2. **Protocol Injection = prependSystemContext** — All protocol text MUST be injected via `prependSystemContext`. Do not bypass through tool results.
3. **Config Externalization** — Tunable parameters go in `config/sleepiness.json`. No hardcoded values in source.
4. **Degrade, Don't Crash** — Missing config / absent script / read failure → fall back to defaults. Never throw uncaught exceptions.
5. **Explicit Deduplication** — Every new protocol trigger path MUST consider deduplication with existing paths.

---

## Communication

- Bug reports → GitHub Issues
- Feature discussions → GitHub Discussions
- Urgent security → see [SECURITY.md](SECURITY.md)

---

*Thank you for contributing. Every PR helps AI become more memorable and more personal.*
