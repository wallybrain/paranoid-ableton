# Milestone v1: Paranoid Ableton

**Status:** SHIPPED 2026-02-07
**Phases:** 1-8
**Total Plans:** 19

## Overview

Paranoid Ableton delivers Claude-to-Ableton bidirectional control in 8 phases. The journey starts with OSC communication foundation, establishes MCP server framework, builds core controllers (transport, tracks, mixer, scenes), adds MIDI composition capability, enables intelligent sample search, implements device control, delivers full session awareness, and culminates in integrated workflows combining all systems. Phases 1-4 form the critical path to MVP. Phase 5 (Sample Indexer) runs parallel with Phases 3-4 as it has no OSC dependency.

## Phases

### Phase 1: OSC Client Foundation

**Goal**: Reliable OSC communication layer with request correlation, timeouts, and error handling
**Depends on**: Nothing (first phase)
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding and OscClient class implementation (completed 2026-02-05, 2min)
- [x] 01-02-PLAN.md — Unit tests and integration smoke test (completed 2026-02-05, 6min)

**Details:**
Success Criteria: OSC send/receive on correct ports, request correlation without mismatching, timeout error classification, connection health check.

### Phase 2: MCP Server Shell

**Goal**: MCP SDK integration with tool registration framework ready for domain-specific tools
**Depends on**: Phase 1 (OSC client)
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — MCP server framework with lazy OscClient and ableton_status health tool (completed 2026-02-05, 1min)
- [x] 02-02-PLAN.md — Unit tests for server registration and health tool behavior (completed 2026-02-05, 2min)

**Details:**
Success Criteria: MCP server starts via stdio, test tool calls OSC client, errors propagate with clear messages, follows user's established MCP patterns.

### Phase 3: Core Controllers

**Goal**: Complete transport, track, mixer, and scene control with ~36 MCP tools across 5 domain modules
**Depends on**: Phase 2 (MCP server)
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Shared helpers (value conversion, snapshots, safety guards) and transport module (10 tools) (completed 2026-02-06, 2min)
- [x] 03-02-PLAN.md — Track management module (6 tools) and mixer module (8 tools) (completed 2026-02-06, 2min)
- [x] 03-03-PLAN.md — Scene/clip module (7 tools), utility tools (4), and registry wiring for all modules (completed 2026-02-06, 2min)

**Details:**
Requirements: TRNS-01 through TRNS-06, TRCK-01 through TRCK-05, MIX-01 through MIX-04, CLIP-01 through CLIP-04. TRNS-06 blocked by AbletonOSC limitation.

### Phase 4: MIDI Clip Editing

**Goal**: Create and edit MIDI clips with note data
**Depends on**: Phase 3 (tracks must exist)
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Note helpers, clip domain module (8 tools), and registry wiring (completed 2026-02-06, 3min)

**Details:**
Requirements: MIDI-01 through MIDI-04. Note batches >100 chunked. Loop point ordering: expand first then shrink.

### Phase 5: Sample Indexer

**Goal**: Metadata-driven sample library search with intelligent filtering
**Depends on**: Nothing (no OSC dependency, parallel with Phases 3-4)
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Scanner engine: classifier, index store, and directory scanner with music-metadata (completed 2026-02-06, 3min)
- [x] 05-02-PLAN.md — MCP tools (sample_scan, sample_search, sample_get_stats, sample_load) and registry wiring (completed 2026-02-06, 1min)
- [x] 05-03-PLAN.md — Unit tests for classifier heuristics, index store search, and scanner guards (completed 2026-02-06, 2min)

**Details:**
Requirements: SAMP-01 through SAMP-03. 10k entry search in 1ms. Concurrent scan guard. Embedded metadata priority.

### Phase 6: Device Control

**Goal**: Load and control Ableton instruments and effects with parameter access
**Depends on**: Phase 3 (tracks must exist)
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — Device helpers, device domain module (9 tools), and registry wiring (completed 2026-02-06, 2min)
- [x] 06-02-PLAN.md — Unit tests for device helpers and tool handlers (completed 2026-02-06, 1min)

**Details:**
Requirements: DEV-01 through DEV-04. Toggle workaround (param 0 fast-path + fallback). Track selection before device insertion (PR #174 fix).

### Phase 7: Session Awareness

**Goal**: Complete Live Object Model state snapshots for context-aware decisions
**Depends on**: Phases 3, 4, 6 (all state sources: tracks, clips, devices)
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Session helpers, session.js domain module (2 tools), and registry wiring (completed 2026-02-06, 2min)
- [x] 07-02-PLAN.md — Unit tests for session helpers and tool handlers (completed 2026-02-06, 1min)

**Details:**
Requirements: SESS-01, SESS-02. Reuses buildTrackSnapshot. Empty clip slot filtering.

### Phase 8: Integration & Polish

**Goal**: Complete workflows combining all systems with production-ready error handling
**Depends on**: Phases 5, 6, 7 (all major subsystems)
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — Structured JSON logger, OscClient reconnection, auto health check with promise lock (completed 2026-02-07, 5min)
- [x] 08-02-PLAN.md — Startup validation and graceful error handling in index.js (completed 2026-02-07, 1min)
- [x] 08-03-PLAN.md — Production README.md, CLAUDE.md with tool reference and DEV-05 parameter guidance, MCP registration (completed 2026-02-07, 3min)

**Details:**
Requirements: DEV-05 (fulfilled via CLAUDE.md documentation), DEV-06 (infeasible — no AbletonOSC browser API). Structured logging to stderr. Exponential backoff reconnection. Startup validation. Process error handlers.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OSC Client Foundation | 2/2 | Complete | 2026-02-05 |
| 2. MCP Server Shell | 2/2 | Complete | 2026-02-05 |
| 3. Core Controllers | 3/3 | Complete | 2026-02-06 |
| 4. MIDI Clip Editing | 1/1 | Complete | 2026-02-06 |
| 5. Sample Indexer | 3/3 | Complete | 2026-02-06 |
| 6. Device Control | 2/2 | Complete | 2026-02-06 |
| 7. Session Awareness | 2/2 | Complete | 2026-02-06 |
| 8. Integration & Polish | 3/3 | Complete | 2026-02-07 |

## Milestone Summary

**Key Decisions:**
- AbletonOSC over custom Remote Script (proven, maintained, ~95% LOM coverage)
- Node.js over Python for MCP server (consistent with user's stack)
- Domain-module registry pattern (each module exports tools[] and handle())
- Per-address request queuing (transparent to callers)
- Volume 0dB = 0.85 normalized (community convention)
- Two-step track delete (preview then confirm)
- DEV-05 fulfilled via documentation, not code (teach Claude to fish)
- DEV-06 marked infeasible (no AbletonOSC browser API)

**Issues Resolved:**
- Console.log stdout contamination eliminated (structured JSON logger to stderr)
- Test mock interface kept in sync with OscClient changes
- Health tool error classification fixed to bypass auto-reconnect layer
- Concurrent health check race condition prevented via promise lock

**Issues Deferred:**
- TRNS-06 (song name/save) — AbletonOSC limitation, no API
- DEV-06 (preset browsing) — AbletonOSC limitation, no browser API
- Live Ableton integration testing — requires real Ableton environment

**Technical Debt:**
- device.js line 209: console.warn should be log('warn')
- Volume unity point (0.85 = 0dB) needs empirical verification
- AbletonOSC on Ubuntu Linux path not verified

---

_Archived: 2026-02-07 as part of v1 milestone completion_
_For current project status, see .planning/ROADMAP.md_
