# Phase 2: MCP Server Shell - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

MCP SDK integration with tool registration framework. The server bridges Claude Code and Ableton via the Phase 1 OSC client: Claude sends a tool call, the server receives it via stdio transport, calls the OSC client, and returns results. Phase 3+ adds domain-specific tools (transport, tracks, mixer) — this phase builds the framework they plug into, plus a test tool to prove the pipeline works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Tool registration pattern
- Claude's discretion on code organization (controller modules vs single file vs other)
- Claude's discretion on OSC address mapping strategy (inline vs central config)
- Claude's discretion on tool granularity (one-per-action vs grouped-by-domain)
- Claude's discretion on validation approach (MCP schema only vs light helpers)
- Key constraint: whatever pattern is chosen must scale cleanly to Phases 3-8 (transport, tracks, mixer, scenes, MIDI, samples, devices, session)

### Error surfacing to Claude
- Short error codes with concise context, not verbose troubleshooting guides
  - Example style: `CONNECTION_FAILED: Ableton not reachable on port 11001`
  - NOT: multi-line troubleshooting steps baked into the error message
- Claude's discretion on MCP isError flag vs error-in-content approach
- Claude's discretion on recoverable vs fatal classification
- Claude's discretion on whether to expose raw OSC addresses in error messages

### Server startup & health
- Lazy OSC connection — connect on first tool call, not on server startup
  - Server must start in Claude Code even if Ableton isn't running yet
- Explicit health/status tool — `ableton_status` or similar that Claude can call to check connectivity
- Claude's discretion on health check strategy (per-call, cached TTL, or on-demand only)
- Claude's discretion on what the health tool returns beyond connection status

### Test tool design
- Unit tests required — same node:test approach as Phase 1
- Claude's discretion on what the proof-of-concept tool does (health tool may serve double duty)
- Claude's discretion on whether test tool is permanent or temporary scaffolding
- Claude's discretion on mock boundary (mock OscClient vs mock UDP layer)

### Claude's Discretion
- Tool code organization and registration pattern
- OSC address mapping strategy
- Tool granularity (per-action vs grouped)
- Validation infrastructure level
- MCP error response strategy (isError flag vs content)
- Error severity classification
- OSC address exposure in errors
- Health check frequency/caching
- Health tool response detail level
- Test tool scope and permanence
- Test mock boundary

</decisions>

<specifics>
## Specific Ideas

- User has existing MCP servers (n8n-mcp, sqlite-mcp, epistemic-mcp) — follow established patterns from those
- Phase 1 OSC client uses node:test with mock UDPPort via EventEmitter — maintain consistency
- Success criteria require: stdio transport, test tool calling OSC, error propagation, follows user's established MCP patterns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-mcp-server-shell*
*Context gathered: 2026-02-05*
