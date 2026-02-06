---
phase: 05-sample-indexer
plan: 01
subsystem: sample-indexer
tags: [music-metadata, file-scanner, audio-classification, json-persistence]

requires:
  - phase: none
    provides: standalone module (no OSC/MCP dependency)
provides:
  - "Sample file scanner with recursive directory walking"
  - "Filename/path classifier for instrument type, BPM, key, character tags"
  - "In-memory index store with JSON persistence and multi-field search"
affects: [05-sample-indexer plan 02 (MCP tools), 05-sample-indexer plan 03 (tests)]

tech-stack:
  added: [music-metadata]
  patterns: [module-level state with exported functions, batch concurrency limiter]

key-files:
  created:
    - src/sample-index/classifier.js
    - src/sample-index/index-store.js
    - src/sample-index/scanner.js
  modified:
    - package.json

key-decisions:
  - "Key regex uses delimiter-aware matching instead of \\b word boundaries (underscores are word chars in regex)"
  - "Index store uses plain array + Map for O(1) path lookups without classes"
  - "Embedded metadata (bpm, key) takes priority over filename heuristics"

patterns-established:
  - "Batch concurrency pattern: processInBatches(items, batchSize, fn) for parallel file I/O"
  - "Module-level state guards: scanInProgress boolean with try/finally reset"
  - "Incremental scanning: mtime comparison to skip unchanged files"

duration: 3min
completed: 2026-02-06
---

# Phase 5 Plan 1: Sample Indexer Engine Summary

**Three-module sample indexer: recursive directory scanner with music-metadata extraction, path-based classifier for instrument/BPM/key/character, and in-memory index store with JSON persistence and multi-field search**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T01:43:47Z
- **Completed:** 2026-02-06T01:46:38Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Classifier correctly identifies instrument type, BPM, key, and character tags from filenames and directory paths
- Index store provides O(1) lookups, multi-field filtered search, stats aggregation, and JSON round-trip persistence
- Scanner orchestrates recursive directory walking, music-metadata extraction, classification merging, and incremental mtime-based caching with concurrency control

## Task Commits

Each task was committed atomically:

1. **Task 1: Install music-metadata and create classifier module** - `ce89165` (feat)
2. **Task 2: Create index store with search and persistence** - `ca3b0b8` (feat)
3. **Task 3: Create scanner module with async metadata extraction** - `6e37c52` (feat)

## Files Created/Modified
- `src/sample-index/classifier.js` - Filename/path heuristic classification (instrument type, BPM, key, character tags)
- `src/sample-index/index-store.js` - In-memory index with Map lookups, multi-field search, JSON persistence, stats
- `src/sample-index/scanner.js` - Directory walker, metadata extraction, scan orchestration with concurrency control
- `package.json` - Added music-metadata dependency

## Decisions Made
- Key regex uses delimiter-aware matching (`(?:^|[_\-\s.])`) instead of `\b` word boundaries because underscores are word characters in regex, causing `\b` to fail between `_` and `C` in patterns like `_Cmin_`
- Index store uses plain array + Map (no classes) -- module-level state with exported functions, consistent with project patterns
- Embedded metadata (bpm, key from audio file tags) takes priority over filename heuristics when present

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed key regex word boundary matching**
- **Found during:** Task 1 (classifier module)
- **Issue:** Plan specified `\b` word boundary in key regex, but `\b` doesn't trigger between underscore and letter (both are word chars), so `_Cmin_` in filenames was not matched
- **Fix:** Replaced `\b` with delimiter-aware lookaround `(?:^|[_\-\s.])` and `(?=[_\-\s.]|$)`
- **Files modified:** src/sample-index/classifier.js
- **Verification:** classifyFromPath('/samples/Drums/Kicks/kick_120bpm_Cmin_punchy.wav') correctly returns key: "Cmin"
- **Committed in:** ce89165

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct key extraction from typical audio filenames. No scope creep.

## Issues Encountered
None beyond the regex deviation noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three modules (scanner, classifier, index-store) are importable and self-consistent
- Ready for Plan 02: MCP tool wrappers that call these modules
- Ready for Plan 03: test suite using node:test

## Self-Check: PASSED

---
*Phase: 05-sample-indexer*
*Completed: 2026-02-06*
