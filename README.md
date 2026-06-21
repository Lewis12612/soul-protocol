# Soul Protocol Plugin

> Dynamic rules + hardwired execution + sleepiness-driven identity-layer protocol engine

**Version**: 3.8.8-beta3 | **License**: MIT | **Zero npm production dependencies. Runtime system dependencies listed below.**

---

## Overview

Soul Protocol is an OpenClaw plugin that gives AI agents memory, personality, and autonomous rhythms. It combines heartbeat-driven protocol injection, sleepiness-based end-of-day automation, and active protocol triggering via tool calls and intent resolution.

**What this means for your AI**:
- 🧠 **Long-term memory** — remembers conversations across days, weeks, months
- 🎭 **Editable personality** — three plain-text files define who the AI is
- 🌙 **Natural rhythms** — gets "sleepy" at night, auto-archives daily memories, "wakes up" refreshed
- 🔒 **100% local** — all data stays on your device, zero network calls

---

## Architecture

```
L0 — SOUL.md       Permanent  "What kind of being am I?"
L1 — SESSION-STATE Session    "What am I doing right now?"
L2 — Daily Memory  Daily      "What did we talk about today?"
L3 — Memory Core   Permanent  "Important conversations and lessons"
L4 — Identity Evo  Weekly     "How have I changed?"
```

Memory flows bottom-up: daily conversations → nightly archiving → weekly reflection → identity evolution.

---

## Quick Start

```bash
# 1. Copy plugin
cp -r soul-protocol/ $WORKSPACE/skills/

# 2. Configure
cp openclaw.plugin.json.example openclaw.plugin.json
# Edit: agentName, dreamAgentName, extraBasePath

# 3. Register in openclaw.json
# plugins.load.paths: ["path/to/soul-protocol"]
# plugins.allow: ["soul-protocol"]

# 4. Restart Gateway
openclaw gateway restart
```

Or use the one-command installer: `bash quickstart.sh`

---

## Features

| Feature | Description |
|---------|-------------|
| **Sleepiness Drive** | Three-factor circadian rhythm (time + uptime + memory load) |
| **Auto EOD** | Automatic end-of-day memory archiving when "exhausted" |
| **Triangular Intent** | User natural language triggers protocols (keyword + intent + state) |
| **execute_protocol Tool** | LLM can actively call protocol functions |
| **Consolidation** | Weekly narrative + monthly indexing + yearly review |
| **Identity Evolution** | L4 self-audit: SOUL/AGENTS/MEMORY updates when cognition shifts |
| **Self-healing** | Watchdog daemon + keepalive for crash recovery |

---

## Key Design Principles

### Identity Layer Constitution (V2.4)

Three files define the AI's identity:

| File | What to write | Rule |
|------|--------------|------|
| `SOUL.md` | Abstract shape — personality structure, fears, desires | **No scripted lines.** Write "I am gentle", not "I say hello~" |
| `AGENTS.md` | Behavioral boundaries traceable to SOUL | Every rule cites which SOUL trait it derives from |
| `MEMORY.md` | Evidence — "which moments defined me" | One fact + one insight per entry. Max 50. |

**Critical: SOUL writes shapes, not scripts.** Wrong: "I say 'Good morning! How are you?'" — Right: "I care about people's well-being and express it naturally."

See [Identity Layer Constitution](references/identity-layer-protocol.md) for the full design philosophy.

---

## Model Recommendations

| Model | Type | Context | Notes |
|-------|------|---------|-------|
| **Qwen3.6-27B-dense** | Local | 200K+ | Best personality understanding |
| **Qwen3.6-MOE-A3B** | Local | 200K+ | Budget local option |
| **DeepSeek V4** | Cloud | 200K+ | Best cost/performance, note cache-hit pricing |
| **GLM-5 / GLM-5.1** | Cloud | 200K+ | Excellent Chinese comprehension |
| **Qwen 3.5+** | Cloud | 200K+ | Stable, Chinese-friendly |

**Minimum**: 7B params, 200K context window. **Recommended**: 14B+.

---

## Documentation

| Document | Audience |
|----------|----------|
| `SKILL.md` | Technical users + AI |
| `CHANGELOG.md` | Everyone |
| `references/protocol-workflow.md` | AI (injected as system context) |
| `references/identity-layer-protocol.md` | Users writing SOUL.md |
| `references/consolidation-protocol.md` | Users configuring consolidation |
| `references/architecture-v3.8.md` | Contributors |

---

## Limitations

- SOUL.md is abstract, not precise control. Behavior "emerges" within the framework.
- Personality stabilizes after ~1 week of use.
- Memory capped at 50 entries. Old memories pruned but preserved in diary.
- Not suitable for tasks requiring 100% factual accuracy. Best for companionship and creative work.
- Requires OpenClaw Gateway running continuously.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Soul Protocol — Give AI memory, personality, and the freedom to grow.*
