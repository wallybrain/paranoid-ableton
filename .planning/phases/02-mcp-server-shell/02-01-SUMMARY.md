---
phase: 02-mcp-server-shell
plan: 01
subsystem: mcp-server
tags: [mcp-sdk, stdio, osc, tool-registry, health-check]

requires:
  - phase: 01-osc-client
    provides: OscClient with query/healthCheck/classifyError methods
provides:
  - MCP server entry point with stdio transport
  - Tool registry with domain-module aggregation pattern
  - Lazy OscClient singleton (server starts without Ableton)
  - ableton_status health tool with error code mapping
affects: [03-transport-tools, 04-track-mixer, 05-sample-indexer, 06-device-control, 07-real-time, 08-creative-tools]

tech-stack:
  added: [@modelcontextprotocol/sdk]
  patterns: [low-level Server + setRequestHandler, domain-module registry, lazy singleton]

key-files:
  created:
    - src/index.js
    - src/tools/registry.js
    - src/tools/shared.js
    - src/tools/health.js
  modified:
    - package.json

key-decisions:
  - "Follow user's established low-level Server + setRequestHandler pattern (matching epistemic-mcp)"
  - "Domain-module registry: each module exports tools[] and handle() -- Phase 3+ just adds to modules array"
  - "Lazy OscClient singleton: created on first tool call, not at import time"
  - "Error codes: short ERROR_CODE: context format (CONNECTION_FAILED, TIMEOUT, PORT_CONFLICT, INTERNAL_ERROR)"

patterns-established:
  - "Domain module pattern: export tools[] for definitions, handle(name, args) returning null if not handled"
  - "Registry aggregation: flatMap modules for definitions, iterate for dispatch"
  - "Lazy singleton: getOscClient() creates on first call, ensureConnected() opens if needed"
  - "Error format: isError:true with 'ERROR_CODE: concise context' text"

duration: 1min
completed: 2026-02-05
---

# Phase 2 Plan 1: MCP Server Shell Summary

**MCP server with stdio transport, domain-module tool registry, lazy OscClient singleton, and ableton_status health tool**

## Performance

- **Duration:** 1 min 28 sec
- **Started:** 2026-02-05T23:12:27Z
- **Completed:** 2026-02-05T23:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- MCP server entry point following user's established low-level Server + setRequestHandler pattern
- Tool registry with domain-module aggregation ready for Phase 3+ additions (just append to modules array)
- Lazy OscClient singleton ensuring server starts cleanly without Ableton running
- ableton_status health tool mapping OscClient error types to short MCP error codes

## Task Commits

Each task was committed atomically:

1. **Task 1: Install MCP SDK and create server entry point with tool registry** - `0585456` (feat)
2. **Task 2: Create lazy OscClient singleton and ableton_status health tool** - `9a94192` (feat)

## Files Created/Modified
- `src/index.js` - MCP server entry point with stdio transport and request handlers
- `src/tools/registry.js` - Tool aggregation from domain modules with duplicate detection
- `src/tools/shared.js` - Lazy OscClient singleton (getOscClient, ensureConnected, resetClient)
- `src/tools/health.js` - ableton_status tool definition and handler with error classification
- `package.json` - Added @modelcontextprotocol/sdk dependency and start script

## Decisions Made
- Followed user's established low-level Server + setRequestHandler pattern (matching epistemic-mcp) rather than using higher-level SDK abstractions
- Domain-module registry pattern: each module exports `tools[]` array and `handle(name, args)` function, registry aggregates via flatMap/iterate
- Lazy OscClient singleton: OscClient created on first `getOscClient()` call, not at module import time -- ensures MCP server starts without Ableton
- Error responses use short `ERROR_CODE: context` format per user's locked decision (not verbose troubleshooting guides)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server framework complete and ready for Phase 3+ domain tool additions
- Adding new tool domains requires: create `src/tools/<domain>.js` with `tools[]` and `handle()` exports, add to `modules` array in `registry.js`
- Server starts cleanly via `npm start` even without Ableton running
- No blockers for Phase 2 Plan 2 or Phase 3

## Self-Check: PASSED

---
*Phase: 02-mcp-server-shell*
*Completed: 2026-02-05*
