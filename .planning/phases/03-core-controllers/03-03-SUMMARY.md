---
phase: 03-core-controllers
plan: 03
subsystem: scene-clip-registry
tags: [scene, clip, utility, registry, batch, undo, read-only]

dependency-graph:
  requires: ["03-01", "03-02"]
  provides: ["scene-clip-control", "utility-tools", "full-registry"]
  affects: ["04-*", "06-*", "07-*"]

tech-stack:
  added: []
  patterns: ["utility-tools-in-registry", "batch-command-dispatch", "recursion-guard"]

key-files:
  created:
    - src/tools/scene.js
  modified:
    - src/tools/registry.js

decisions:
  - id: "UTIL-REGISTRY"
    decision: "Utility tools (undo, redo, set_read_only, batch_commands) handled directly in registry rather than a separate module"
    rationale: "These are cross-cutting concerns that don't belong to any single domain module"
  - id: "BATCH-RECURSION"
    decision: "batch_commands prevents nested batch_commands calls"
    rationale: "Prevents infinite recursion and simplifies error handling"

metrics:
  duration: "2min"
  completed: "2026-02-06"
---

# Phase 3 Plan 3: Scene/Clip Module, Utility Tools & Registry Wiring Summary

**Scene/clip domain module with 7 tools, 4 utility tools, and full registry wiring for all 36 MCP tools.**

## What Was Done

### Task 1: Created scene.js domain module (7 tools)

Created `src/tools/scene.js` following the established domain module pattern with `tools[]` and `handle()` exports.

**Scene tools:**
- `scene_list` -- Lists all scenes with optional clip slot population info
- `scene_launch` -- Launches a scene by index (fires all clips in row)
- `scene_stop` -- Stops all playing clips in session
- `scene_create` -- Creates new empty scene at position or end
- `scene_rename` -- Renames a scene by index

**Clip tools:**
- `clip_launch` -- Launches a specific clip by track + scene position
- `clip_stop` -- Stops a specific clip by track + scene position

Both scene_ and clip_ prefixes handled in the prefix check. All write operations gated by `guardWrite`. Track references resolved via `resolveTrackIndex` for name-or-index flexibility.

### Task 2: Updated registry.js with all modules and utility tools

**Registry now imports 5 domain modules:**
- health (1 tool)
- transport (10 tools)
- track (6 tools)
- mixer (8 tools)
- scene (7 tools)

**4 utility tools added directly in registry:**
- `undo` -- Undo last Ableton action (write-guarded)
- `redo` -- Redo last undone action (write-guarded)
- `set_read_only` -- Toggle read-only mode for safe exploration
- `batch_commands` -- Execute multiple tool calls in sequence with recursion prevention

**Total: 36 tools registered, zero duplicates.**

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | scene.js domain module | de71cdb | src/tools/scene.js |
| 2 | Registry wiring + utility tools | d87f9c5 | src/tools/registry.js |

## Verification Results

| Check | Result |
|-------|--------|
| scene.js exports 7 tools + handle | PASS |
| Total tools: 36 | PASS |
| No duplicate tool names | PASS |
| Unknown tool fallback | PASS |
| set_read_only toggle | PASS |
| batch_commands recursion blocked | PASS |
| MCP server starts | PASS |

## Complete Tool Registry (36 tools)

| Module | Tools | Count |
|--------|-------|-------|
| health | ableton_status | 1 |
| transport | transport_play, transport_stop, transport_continue, transport_record, transport_get_tempo, transport_set_tempo, transport_get_position, transport_set_position, transport_get_metronome, transport_set_metronome | 10 |
| track | track_list, track_create, track_delete, track_select, track_set_arm, track_rename | 6 |
| mixer | mixer_get_volume, mixer_set_volume, mixer_get_pan, mixer_set_pan, mixer_set_mute, mixer_set_solo, mixer_get_send, mixer_set_send | 8 |
| scene | scene_list, scene_launch, scene_stop, clip_launch, clip_stop, scene_create, scene_rename | 7 |
| utility | undo, redo, set_read_only, batch_commands | 4 |

## Decisions Made

1. **Utility tools in registry** -- undo, redo, set_read_only, and batch_commands are cross-cutting concerns handled directly in the registry switch statement rather than a separate domain module. They don't map to a single OSC domain.

2. **Batch recursion guard** -- batch_commands explicitly rejects nested batch_commands calls with a BATCH_RECURSION error to prevent infinite loops.

## Deviations from Plan

None -- plan executed exactly as written.

## Phase 3 Completion

This plan completes Phase 3 (Core Controllers). All success criteria met:
- Claude can start/stop playback, control tempo, toggle metronome (transport module)
- Claude can create MIDI/audio tracks, rename, arm for recording (track module)
- Claude can adjust volume, pan, sends, mute/solo any track (mixer module)
- Claude can list scenes/clips, launch scenes, stop playback (scene module)
- Claude can create and name new scenes (scene module)
- 36 tools registered and callable via MCP

## Next Phase Readiness

Phase 4 (MIDI Clip Editing) can begin. All track infrastructure is in place.
No blockers identified for Phase 4.

## Self-Check: PASSED
