# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Claude can see and manipulate an Ableton Live session as a creative co-pilot
**Current focus:** Phase 7 - Session Awareness (in progress)

## Current Position

Phase: 7 of 8 (Session Awareness)
Plan: 1 of 2
Status: In progress
Last activity: 2026-02-06 -- Completed 07-01-PLAN.md (session snapshot and stats tools)

Progress: [█████████████████████████████░] 93% (14 of 15 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 2 min
- Total execution time: 0.50 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2 | 8 min | 4 min |
| 2 | 2 | 3 min | 1.5 min |
| 3 | 3 | 6 min | 2 min |
| 4 | 1 | 3 min | 3 min |
| 5 | 3 | 6 min | 2 min |
| 6 | 2 | 3 min | 1.5 min |
| 7 | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 05-03 (2min), 06-01 (2min), 06-02 (1min), 07-01 (2min)
- Trend: Stable ~1.75min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: All phases depend on OSC client foundation addressing 4/7 critical pitfalls (UDP packet loss, request correlation, timeouts, Ableton busy state)
- Phase 5: Sample indexer has no OSC dependency, can run parallel with Phases 3-4
- Phase 8: DEV-05 and DEV-06 are stretch items (human-readable device names, preset browsing) due to research flagging AbletonOSC browser API uncertainty
- 01-01: Per-address request queuing instead of throwing on concurrent queries (transparent to callers)
- 01-01: Return plain values from query() instead of metadata objects (simplifies downstream code)
- 01-01: Context-aware timeouts (QUERY:5s, COMMAND:7s, LOAD:10s, HEALTH:3s)
- 01-01: Environment variable support for port configuration (OSC_SEND_PORT, OSC_RECEIVE_PORT, OSC_HOST)
- 01-02: Use Node.js built-in test runner (node:test) instead of external frameworks like Jest
- 01-02: Mock UDPPort by extending EventEmitter with auto-response map for deterministic tests
- 01-02: Smoke test is read-only (no session modifications) for safety
- 02-01: Low-level Server + setRequestHandler pattern (matching epistemic-mcp)
- 02-01: Domain-module registry -- each module exports tools[] and handle(), registry aggregates
- 02-01: Lazy OscClient singleton -- created on first tool call, not at import
- 02-01: Error codes: short ERROR_CODE: context format (CONNECTION_FAILED, TIMEOUT, PORT_CONFLICT, INTERNAL_ERROR)
- 02-02: setOscClient() added to shared.js for test mock injection (boundary mocking pattern)
- 02-02: Mock classifyError checks EADDRINUSE before isReady for correct PORT_CONFLICT testing
- 03-01: Volume 0dB = 0.85 normalized (community convention, needs empirical verification)
- 03-01: Write operations return full transport snapshot for state context
- 03-01: transport_record checks status before toggling to avoid Pitfall 6
- 03-02: track_delete uses two-step confirmation (preview then confirm) for safety
- 03-02: Write operations return full track snapshots (consistent with transport pattern)
- 03-02: Track property uses description instead of oneOf for index/name flexibility
- 03-03: Utility tools (undo, redo, set_read_only, batch_commands) handled directly in registry
- 03-03: batch_commands prevents nested batch_commands calls (recursion guard)
- 04-01: 8 clip tools (clip_create, clip_delete, clip_get, clip_set_name, clip_add_notes, clip_remove_notes, clip_get_notes, clip_set_loop)
- 04-01: clip.js returns null for clip_launch/clip_stop (scene.js handles those)
- 04-01: Note batches >100 chunked into separate OSC messages
- 04-01: Loop point ordering: expand first then shrink to avoid constraint violations
- 04-01: buildClipSnapshot in helpers.js for reuse across modules
- 04-01: All write operations return full clip snapshot (consistent pattern)
- 05-01: Key regex uses delimiter-aware matching instead of \b word boundaries (underscores are word chars)
- 05-01: Index store uses plain array + Map for O(1) path lookups (no classes, module-level state)
- 05-01: Embedded metadata (bpm, key) takes priority over filename heuristics
- 05-02: Sample tools are filesystem-only (no OSC/ensureConnected needed)
- 05-02: loadIndex() called idempotently at start of read handlers
- 05-02: sample_search returns hint when index empty, guiding user to run scan first
- 05-02: sample_load returns drag-and-drop instructions, track param reserved for future API
- 06-01: Device list uses track-level bulk queries with slice(1) for track-id prefix
- 06-01: Device toggle checks param 0 first, falls back to full name search for "Device On"
- 06-01: Parameter set validates min/max via bulk query before writing
- 06-01: Device load selects target track first (PR #174 fix), handles timeout with PR #173 error
- 06-02: Mock OscClient uses address:args key format for deterministic response mapping
- 06-02: Snapshot mock helper (snapshotMocks) for reusable device test setup
- 07-01: Session tools are read-only (no guardWrite needed)
- 07-01: Reuse buildTrackSnapshot as base for buildTrackDetailSnapshot
- 07-01: is_foldable returns [trackId, value] when queried directly -- use index [1]
- 07-01: Empty clip slots filtered by checking name exists and is not empty string

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 1 (complete):**
- AbletonOSC installation on Ubuntu Linux not yet verified (research validated macOS paths only) - smoke test available for validation when Ableton launches
- AbletonOSC Live 12 Suite compatibility assumed but not tested - smoke test available for validation when Ableton launches

**Phase 3 (complete, verified):**
- Volume unity point (0.85 = 0dB) is community convention -- needs empirical verification against actual Ableton Live 12
- TRNS-06 (song name/save) blocked by AbletonOSC limitation -- no API available

**Phase 5 (Sample Indexer):**
- User's sample library formats and naming conventions unknown, may require heuristic adjustments

**Phase 6 (Device Control):**
- AbletonOSC device browser and preset loading API capabilities uncertain, may need workarounds or v2 deferral for DEV-05/DEV-06

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 07-01-PLAN.md (session snapshot and stats tools). Phase 7 plan 2 (tests) next.
Resume file: None
