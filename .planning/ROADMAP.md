# Roadmap: Paranoid Ableton

## Overview

Paranoid Ableton delivers Claude-to-Ableton bidirectional control in 8 phases. The journey starts with OSC communication foundation, establishes MCP server framework, builds core controllers (transport, tracks, mixer, scenes), adds MIDI composition capability, enables intelligent sample search, implements device control, delivers full session awareness, and culminates in integrated workflows combining all systems. Phases 1-4 form the critical path to MVP. Phase 5 (Sample Indexer) runs parallel with Phases 3-4 as it has no OSC dependency.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: OSC Client Foundation** - UDP communication to AbletonOSC with request correlation and error handling
- [x] **Phase 2: MCP Server Shell** - MCP SDK integration with tool registration framework
- [ ] **Phase 3: Core Controllers** - Transport, tracks, mixer, scenes control
- [ ] **Phase 4: MIDI Clip Editing** - Create and edit MIDI clips with note data
- [ ] **Phase 5: Sample Indexer** - Metadata-driven sample library search (parallel with 3-4)
- [ ] **Phase 6: Device Control** - Load and control instruments and effects
- [ ] **Phase 7: Session Awareness** - Full Live Object Model state snapshots
- [ ] **Phase 8: Integration & Polish** - Complete workflows and production readiness

## Phase Details

### Phase 1: OSC Client Foundation
**Goal**: Reliable OSC communication layer with request correlation, timeouts, and error handling
**Depends on**: Nothing (first phase)
**Requirements**: Infrastructure for all Ableton requirements (addresses 4/7 critical pitfalls)
**Success Criteria** (what must be TRUE):
  1. OSC client can send messages to AbletonOSC port 11000 and receive responses on port 11001
  2. Multiple simultaneous queries return correct values without response mismatching
  3. Timeout errors clearly distinguish between Ableton not running, AbletonOSC not loaded, and operation taking too long
  4. Connection health check reports current Ableton status before any operation
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding and OscClient class implementation (completed 2026-02-05, 2min)
- [x] 01-02-PLAN.md — Unit tests and integration smoke test (completed 2026-02-05, 6min)

### Phase 2: MCP Server Shell
**Goal**: MCP SDK integration with tool registration framework ready for domain-specific tools
**Depends on**: Phase 1 (OSC client)
**Requirements**: Infrastructure for all MCP tool requirements
**Success Criteria** (what must be TRUE):
  1. MCP server starts via stdio transport and registers with Claude Code
  2. Test tool can call OSC client and return results to Claude
  3. Errors from OSC layer propagate to Claude with clear messages
  4. Server follows user's established pattern from n8n-mcp, sqlite-mcp, epistemic-mcp servers
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — MCP server framework with lazy OscClient and ableton_status health tool (completed 2026-02-05, 1min)
- [x] 02-02-PLAN.md — Unit tests for server registration and health tool behavior (completed 2026-02-05, 2min)

### Phase 3: Core Controllers
**Goal**: Complete transport, track, mixer, and scene control with ~36 MCP tools across 5 domain modules
**Depends on**: Phase 2 (MCP server)
**Requirements**: TRNS-01, TRNS-02, TRNS-03, TRNS-04, TRNS-05, TRNS-06, TRCK-01, TRCK-02, TRCK-03, TRCK-04, TRCK-05, MIX-01, MIX-02, MIX-03, MIX-04, CLIP-01, CLIP-02, CLIP-03, CLIP-04
**Success Criteria** (what must be TRUE):
  1. Claude can start/stop playback, control tempo, and toggle metronome
  2. Claude can create MIDI and audio tracks, rename them, and arm for recording
  3. Claude can adjust volume, pan, sends, and mute/solo any track
  4. Claude can list all scenes and clips, launch scenes, and stop playback
  5. Claude can create and name new scenes
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Shared helpers (value conversion, snapshots, safety guards) and transport module (10 tools)
- [ ] 03-02-PLAN.md — Track management module (6 tools) and mixer module (8 tools)
- [ ] 03-03-PLAN.md — Scene/clip module (7 tools), utility tools (4), and registry wiring for all modules

### Phase 4: MIDI Clip Editing
**Goal**: Create and edit MIDI clips with note data
**Depends on**: Phase 3 (tracks must exist)
**Requirements**: MIDI-01, MIDI-02, MIDI-03, MIDI-04
**Success Criteria** (what must be TRUE):
  1. Claude can create MIDI clips on any MIDI track
  2. Claude can add and remove notes in MIDI clips with pitch, velocity, start time, and duration
  3. Claude can read existing note data from MIDI clips
  4. Claude can set loop start, loop end, and clip length
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Sample Indexer
**Goal**: Metadata-driven sample library search with intelligent filtering
**Depends on**: Nothing (no OSC dependency, can parallel with Phases 3-4)
**Requirements**: SAMP-01, SAMP-02, SAMP-03
**Success Criteria** (what must be TRUE):
  1. Claude can scan user sample directories and build metadata index (BPM, key, duration, format, instrument type)
  2. Claude can search samples by instrument type, key, BPM range, or character description
  3. Claude can load found samples into tracks or instruments
  4. Sample scanning completes asynchronously without blocking server startup
  5. Search results return in under 100ms for 10k+ indexed samples
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Device Control
**Goal**: Load and control Ableton instruments and effects with parameter access
**Depends on**: Phase 3 (tracks must exist)
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04
**Success Criteria** (what must be TRUE):
  1. Claude can list all devices on any track including device chain order
  2. Claude can toggle devices on/off
  3. Claude can get and set device parameters by index or name
  4. Claude can load Ableton native instruments and effects from browser
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Session Awareness
**Goal**: Complete Live Object Model state snapshots for context-aware decisions
**Depends on**: Phases 3, 4, 6 (all state sources: tracks, clips, devices)
**Requirements**: SESS-01, SESS-02
**Success Criteria** (what must be TRUE):
  1. Claude can get a complete session state snapshot including all tracks, clips, devices, parameters, and routing
  2. Claude can get project statistics (track counts by type, clip counts, device chain summary, tempo range)
  3. Session snapshots include both cached state (from listeners) and fresh queries (devices, clips)
  4. State queries distinguish between empty slots and populated clips in session view
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Integration & Polish
**Goal**: Complete workflows combining all systems with production-ready error handling
**Depends on**: Phases 5, 6, 7 (all major subsystems)
**Requirements**: DEV-05 (stretch), DEV-06 (stretch)
**Success Criteria** (what must be TRUE):
  1. Claude can execute complete workflow: search samples, load to track, add device, adjust parameters
  2. Ableton native device parameters use human-readable names (Wavetable, Operator, Drift, Drum Rack, Simpler, effects)
  3. Claude can browse and load presets for native devices (if AbletonOSC supports)
  4. Connection errors provide clear guidance (check Ableton running, AbletonOSC loaded, port conflicts)
  5. All error states handle gracefully without crashing server
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 5 can run parallel with Phases 3-4.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OSC Client Foundation | 2/2 | Complete | 2026-02-05 |
| 2. MCP Server Shell | 2/2 | Complete | 2026-02-05 |
| 3. Core Controllers | 0/3 | Not started | - |
| 4. MIDI Clip Editing | 0/TBD | Not started | - |
| 5. Sample Indexer | 0/TBD | Not started | - |
| 6. Device Control | 0/TBD | Not started | - |
| 7. Session Awareness | 0/TBD | Not started | - |
| 8. Integration & Polish | 0/TBD | Not started | - |
