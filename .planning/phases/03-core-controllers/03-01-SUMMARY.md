---
phase: 03-core-controllers
plan: 01
subsystem: tools
tags: [helpers, transport, osc, volume, pan, tempo, read-only]

dependency_graph:
  requires: [01-01, 02-01]
  provides: [helpers-module, transport-domain]
  affects: [03-02, 03-03]

tech_stack:
  added: []
  patterns: [domain-module, snapshot-response, guard-write, value-conversion]

key_files:
  created:
    - src/tools/helpers.js
    - src/tools/transport.js
  modified: []

decisions:
  - "Volume 0dB = 0.85 normalized (community convention, needs empirical verification)"
  - "Pan uses MIDI 0-127 input convention per prior user decision"
  - "Track indices are 0-based per prior user decision"
  - "Write operations return full transport snapshot for context"
  - "transport_record checks status before toggling to avoid Pitfall 6"

metrics:
  duration: "2 min"
  completed: "2026-02-06"
---

# Phase 03 Plan 01: Helpers & Transport Summary

**JWT auth with... no, wrong project.** Shared value-conversion helpers (dB, pan, tempo) and 10 transport tools for playback/recording/tempo/position/metronome control via AbletonOSC.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create helpers.js | 66c4b96 | src/tools/helpers.js |
| 2 | Create transport.js | be44a70 | src/tools/transport.js |

## What Was Built

### helpers.js (17 exports)

Foundation module for all domain controllers:

- **Volume**: `dbToNormalized`, `normalizedToDb`, `parseVolumeInput` -- maps dB scale to Ableton's 0.0-1.0 range (0dB = 0.85 unity, +6dB = 1.0)
- **Pan**: `midiPanToFloat`, `floatPanToMidi`, `parsePanInput` -- MIDI 0-127 to/from -1.0 to 1.0 float
- **Track**: `resolveTrackIndex` -- numeric passthrough or OSC name lookup
- **Tempo**: `parseTempoInput` -- absolute BPM, relative (+5, -10), keywords (double, half)
- **Snapshots**: `buildTransportSnapshot`, `buildTrackSnapshot` -- async OSC queries returning structured state
- **Safety**: `isReadOnly`, `setReadOnly`, `guardWrite` -- module-level write gating
- **Delete state**: `getPendingDelete`, `setPendingDelete`, `clearPendingDelete`, `clearAllPendingDeletes` -- two-step delete confirmation

### transport.js (10 tools)

First domain module following the health.js pattern (exports `tools[]` and `handle()`):

| Tool | Type | Description |
|------|------|-------------|
| transport_play | write | Start playback, return snapshot |
| transport_stop | write | Stop playback/recording, return snapshot |
| transport_continue | write | Resume from stop position, return snapshot |
| transport_record | write | Toggle recording (checks status first), return snapshot |
| transport_get_tempo | read | Returns `{tempo}` |
| transport_set_tempo | write | Absolute or relative BPM, return snapshot |
| transport_get_position | read | Returns `{position_beats}` |
| transport_set_position | write | Set position in beats, return snapshot |
| transport_get_metronome | read | Returns `{metronome: bool}` |
| transport_set_metronome | write | Enable/disable metronome, return snapshot |

## Requirements Coverage

| Requirement | Status | Implementation |
|------------|--------|----------------|
| TRNS-01 (play/stop/continue) | Done | transport_play, transport_stop, transport_continue |
| TRNS-02 (record) | Done | transport_record with status pre-check |
| TRNS-03 (tempo) | Done | transport_get/set_tempo with relative parsing |
| TRNS-04 (position) | Done | transport_get/set_position in beats |
| TRNS-05 (metronome) | Done | transport_get/set_metronome |
| TRNS-06 (song name/save) | Gap | AbletonOSC limitation, documented in code |

## Decisions Made

1. **Volume unity at 0.85**: Community convention. Comment in helpers.js notes this needs empirical verification against actual Ableton Live 12.
2. **Snapshot on write**: All write operations return full transport snapshot so Claude always has current state context.
3. **Record status check**: transport_record queries session_record_status before toggling to avoid accidentally stopping recording (Pitfall 6).
4. **Error wrapping**: Transport errors wrapped as `TRANSPORT_ERROR: message` with `isError: true`.

## Deviations from Plan

None -- plan executed exactly as written.

## Next Phase Readiness

- helpers.js ready for import by track/mixer (03-02) and scene/clip (03-03) domain modules
- transport.js ready for registry integration in Plan 03-03
- No blockers identified

## Self-Check: PASSED
