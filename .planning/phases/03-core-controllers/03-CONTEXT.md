# Phase 3: Core Controllers - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete transport, track, mixer, and scene control via MCP tools. Claude can start/stop playback, control tempo, create and manage tracks, adjust mix parameters, and launch scenes. This phase delivers the core DAW manipulation layer — MIDI clip editing, sample search, and device control are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Tool granularity
- Claude's Discretion on grouping strategy (atomic vs domain-grouped) — pick what works best for MCP tool discovery
- Domain prefix naming convention: `transport_play`, `track_create`, `mixer_set_volume`, `scene_launch`
- Read and write operations are SEPARATE tools: `transport_get_tempo()` vs `transport_set_tempo()`
- Include a `batch_commands` tool for multi-step operations in a single call (e.g., create 4 tracks + arm them)

### Value formatting
- Volume accepts BOTH dB scale (-inf to +6) and normalized float (0.0-1.0) — server converts as needed
- Pan uses 0-127 MIDI convention (64 = center)
- Track references accept EITHER index (0-based) OR name string — server resolves
- Tempo accepts absolute BPM and relative changes ('+5', '-10', 'double', 'half')

### Response design
- Write operations return FULL track/transport snapshot after change — Claude always knows the resulting state
- Read operations (e.g., list tracks) return full state per item: name, type, index, volume, pan, mute, solo, arm, sends, device count
- Claude's Discretion on whether transport state is included in every response or only transport tool responses
- Claude's Discretion on response format (structured JSON vs human-readable text)

### Safety & confirmation
- Track deletion uses two-step confirmation: first call returns track contents as warning, second call with `confirm=true` actually deletes
- Read-only mode toggle available — prevents all write operations when active (useful for session exploration)
- Claude's Discretion on recording-stop behavior (whether to warn or just stop)
- Undo tool included — triggers Ableton's undo for safety net

</decisions>

<specifics>
## Specific Ideas

- Domain prefix naming mirrors how the user thinks about Ableton: transport, track, mixer, scene are natural groupings
- Batch tool is important for workflows where Claude sets up multiple tracks at once — reduces round-trip overhead over OSC
- Two-step delete matches the "measure twice, cut once" philosophy from the project's safety approach
- Read-only mode enables a "look but don't touch" exploration mode that's valuable when Claude is first learning a session

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-core-controllers*
*Context gathered: 2026-02-05*
