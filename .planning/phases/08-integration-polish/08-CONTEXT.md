# Phase 8: Integration & Polish - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete workflows combining all 7 subsystems (OSC, MCP, transport, tracks, clips, samples, devices, sessions) into a cohesive production tool. Production-ready error handling, startup validation, documentation, and Claude Code registration. Stretch goals: human-readable device parameter names (DEV-05) and preset browsing (DEV-06).

</domain>

<decisions>
## Implementation Decisions

### Workflow Orchestration
- All three workflow modes supported: fully autonomous, checkpoint-based, and step-by-step
- Mode selection via natural language cues (Claude infers from phrasing), not explicit tools or settings
- No pre-built workflow recipes — Claude composes from the 50+ existing tools fresh each time
- Progress narration style: Claude's discretion

### Error Recovery
- Severity-based failure handling: critical failures (can't create track, connection lost) stop the workflow; minor failures (can't set a single parameter) skip and continue
- Auto health check on first tool call per session — verify Ableton connection before proceeding, then trust subsequent calls unless they fail
- Auto-reconnect with exponential backoff when Ableton disconnects mid-session
- Error message tone and diagnostic detail: Claude's discretion

### Device Name Mapping (DEV-05 — Nice-to-have)
- Human-readable parameter names are nice-to-have, not blocking v1 launch
- If implemented: dynamic query from Ableton at runtime (not hardcoded JSON maps)
- Always fresh queries — no per-session caching of parameter names
- Preset browsing (DEV-06): Claude's discretion on whether to attempt based on AbletonOSC feasibility

### Production Readiness
- Documentation: README.md (GitHub — setup, features, usage) + CLAUDE.md (project context for Claude Code)
- Full startup validation: check Node version, verify osc package, confirm port availability — clear errors if anything missing
- MCP server registration: add to Claude Code settings as part of this phase (like existing MCP servers)
- Structured JSON logging with levels (info, warn, error) for debugging

### Claude's Discretion
- Progress narration style during multi-step workflows
- Error message tone and diagnostic verbosity
- Whether to attempt DEV-06 (preset browsing) based on AbletonOSC API feasibility
- Specific reconnection backoff timing

</decisions>

<specifics>
## Specific Ideas

- Workflow mode should feel natural — "make me a beat" = autonomous, "help me build a beat" = collaborative, "walk me through making a beat" = step-by-step
- Server should behave like the user's other MCP servers (n8n, ollama, sqlite, epistemic) — same registration pattern, same feel

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-integration-polish*
*Context gathered: 2026-02-07*
