# Security Policy

## Supported Versions

| Version | Security Updates |
|---------|:---------------:|
| V3.8.8-beta3 | ✅ |
| V3.8.8-beta1 | ❌ (superseded) |
| < V3.8.8 | ❌ |

Security fixes are applied to the latest version only. Always upgrade to the current release.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** open a public Issue.

### Reporting Channel

Send email to the maintainer (address to be published with initial release), including:

```
**Affected Version**: V3.8.8-beta3
**Vulnerability Type**: (e.g., command injection / path traversal / information disclosure)
**Affected Module**: (e.g., execute-protocol.ts / heartbeat.ts)
**Steps to Reproduce**:
  1. ...
  2. ...
**Potential Impact**: ...
**Suggested Fix**: (optional)
```

### Response Timeline

| Window | Action |
|--------|--------|
| 0-48h | Acknowledge receipt, begin investigation |
| 48h-7d | Determine scope, develop fix |
| 7-14d | Release patched version + security advisory |
| 14d+ | CVE application (if applicable) |

Critical vulnerabilities (RCE, privilege escalation) are fast-tracked to a 72h fix window.

---

## Security Boundaries

Soul Protocol runs as a local OpenClaw plugin. Its security model is based on these assumptions:

### Trust Boundary

- **Plugin runs in a trusted environment** — the OpenClaw Gateway and file system are assumed secure
- **Config files are admin-edited** — `openclaw.plugin.json` and `config/sleepiness.json` content is trusted
- **Check scripts are admin-deployed** — `scripts/check-*.sh` are placed by the administrator, never dynamically generated

### Mitigated Risks

| Risk | Mitigation |
|------|------------|
| Command injection | `execSync`/`execAsync` script paths are constructed from config + fixed enum. No user input involved. |
| Path traversal | All file operations restricted to `workspaceDir` subtree |
| Credential exposure | `openclaw.plugin.json` excluded by `.gitignore`; `.example` uses placeholders |
| Concurrent write corruption | `last-eod.json` uses tmp+rename atomic writes |
| PID file races | `process.kill(pid, 0)` only checks process liveness, never sends termination signals |

### Not in Scope (Usage Notes)

| Scenario | Note |
|----------|------|
| Check script security | `check-*.sh` content is admin-controlled; the plugin trusts its output |
| API key management | Model API keys are managed at the OpenClaw layer, not by this plugin |
| Dialogue log privacy | EXTRA layer log paths are admin-configured; the plugin does not encrypt them |
| Multi-agent isolation | Different agent instances use separate workspaces for isolation, not mandatory sandboxing |

---

## Security Design Principles

1. **Zero Network Calls** — The plugin makes no HTTP requests, connects to no external services
2. **Zero Production Dependencies** — Node.js built-in modules only; no third-party runtime dependencies
3. **Least Privilege** — `before-tool-call` hook intercepts dangerous operations (file deletion, git force push, etc.)
4. **Safe Degradation** — Missing config / absent scripts → degrade to no-op, never expose internal state

---

## Advisories

Security advisories are published through:
- GitHub Releases
- Project CHANGELOG.md (tagged `[Security]`)

---

*Last updated: 2026-06-20 | Version: 1.0*
