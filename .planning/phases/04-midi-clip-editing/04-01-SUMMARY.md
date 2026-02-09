---
phase: 04-midi-clip-editing
plan: 01
subsystem: midi-clip-editing
tags: [midi, clip, notes, osc, ableton, loop]
requires:
  - 01-foundation (OSC client, TIMEOUTS)
  - 02-mcp-server (domain module pattern, registry)
  - 03-core-controllers (helpers.js, shared.js, scene.js routing)
provides:
  - MIDI clip creation/deletion (MIDI-01)
  - Note add/remove/read with validation and serialization (MIDI-02, MIDI-03)
  - Loop property control with constraint-safe ordering (MIDI-04)
  - Clip property querying with note count (MIDI-03, MIDI-04)
  - Note serialization helpers (structured JSON <-> flat OSC array)
affects:
  - 06-device-control (may need clip context for device parameter automation)
  - 07-real-time (clip state listeners)
tech-stack:
  added: []
  patterns:
    - "Flat OSC array serialization (5 values per note: pitch, start_time, duration, velocity, mute)"
    - "Response prefix handling ([track_index, clip_index, ...value] destructuring)"
    - "Large batch chunking (100 notes per OSC message)"
    - "Constraint-safe loop point ordering (expand first, then shrink)"
key-files:
  created:
    - src/tools/clip.js
  modified:
    - src/tools/helpers.js
    - src/tools/registry.js
key-decisions:
  - "8 tools in clip module (clip_create, clip_delete, clip_get, clip_set_name, clip_add_notes, clip_remove_notes, clip_get_notes, clip_set_loop)"
  - "clip.js returns null for clip_launch/clip_stop to avoid conflict with scene.js"
  - "Note batches >100 are chunked into separate OSC messages"
  - "clip_remove_notes with no filter params removes all notes (explicit warning in description)"
  - "All write operations return full clip snapshot for state context"
  - "buildClipSnapshot added to helpers.js (shared with all clip tools)"
duration: 3 min
completed: 2026-02-06
---

# Phase 4 Plan 1: MIDI Clip Editing Summary

Complete MIDI clip editing module with 8 tools, note serialization/validation helpers, and registry wiring -- delivers all four MIDI requirements (MIDI-01 through MIDI-04).

## Performance

| Metric | Value |
|--------|-------|
| Duration | 3 min |
| Start | 2026-02-06T01:09:33Z |
| End | 2026-02-06T01:12:08Z |
| Tasks | 3/3 |
| Files created | 1 |
| Files modified | 2 |
| Total tools added | 8 |
| Total tools in registry | 44 |

## Accomplishments

1. **Note serialization helpers** -- `notesToFlatArray` and `flatArrayToNotes` convert between structured JSON note objects and AbletonOSC's flat 5-value-per-note array format. Round-trips correctly.

2. **Note validation** -- `validateNote` and `validateNotes` enforce pitch (0-127 integer), start_time (>= 0), duration (> 0), and velocity (1-127 if provided) constraints with descriptive error messages including note index.

3. **Clip snapshot builder** -- `buildClipSnapshot` queries 7 clip properties via OSC (name, length, loop_start, loop_end, looping, is_midi, note_count), correctly handling the [track_index, clip_index, value] response prefix.

4. **clip_create** -- Creates empty MIDI clips with MIDI track validation and empty slot check. Optionally sets clip name.

5. **clip_delete** -- Removes clips from clip slots.

6. **clip_get / clip_set_name** -- Read clip properties and rename clips.

7. **clip_add_notes** -- Adds validated notes with automatic chunking for batches >100 notes. Notes add to existing content (do not replace).

8. **clip_remove_notes** -- Removes notes by pitch range and/or time range filters. Explicit warning about removing all notes when no filters specified.

9. **clip_get_notes** -- Reads notes as structured JSON objects with optional pitch/time filtering.

10. **clip_set_loop** -- Controls loop_start, loop_end, and looping toggle. Handles loop point ordering automatically (expands range before shrinking to avoid Ableton constraint violations).

11. **Registry wiring** -- Clip module added after scene in modules array. 44 total tools, 0 duplicates. clip_launch/clip_stop correctly dispatched to scene.js.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add note serialization, validation, and clip snapshot helpers | 68c0f9f | src/tools/helpers.js |
| 2 | Create clip.js domain module with all MIDI clip tools | 893a646 | src/tools/clip.js |
| 3 | Wire clip module into registry | b5b21a4 | src/tools/registry.js |

## Files Created

- `src/tools/clip.js` -- 398 lines, 8 MCP tool definitions + async handle function

## Files Modified

- `src/tools/helpers.js` -- Added TIMEOUTS import, notesToFlatArray, flatArrayToNotes, validateNote, validateNotes, buildClipSnapshot (+95 lines)
- `src/tools/registry.js` -- Added clip import and module registration (+2 lines, -1 line)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 8 tools (not 7) | clip_set_name added as separate tool for naming flexibility beyond clip_create |
| clip.js returns null for clip_launch/clip_stop | Scene.js handles these; null return signals "not my tool" in registry dispatch |
| Chunk notes at 100 per message | Prevents UDP packet size issues with large note batches |
| clip_remove_notes removes all when no filters | Matches AbletonOSC behavior; explicit warning in tool description |
| Loop point ordering: expand first | Setting loop_end before loop_start when expanding avoids Ableton's loop_start < loop_end constraint violation |
| buildClipSnapshot in helpers.js not clip.js | Reusable across modules (consistent with buildTransportSnapshot, buildTrackSnapshot) |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

Phase 4 is a single-plan phase. All MIDI requirements delivered:
- **MIDI-01**: clip_create, clip_delete, clip_set_name
- **MIDI-02**: clip_add_notes, clip_remove_notes
- **MIDI-03**: clip_get_notes, clip_get
- **MIDI-04**: clip_set_loop

Ready for Phase 5 (Sample Indexer) or Phase 6 (Device Control).

## Self-Check: PASSED
