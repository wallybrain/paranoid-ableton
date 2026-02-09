---
phase: 01-osc-client-foundation
plan: 01
subsystem: api
tags: [osc, udp, networking, node.js, es-modules]

# Dependency graph
requires:
  - phase: none
    provides: "Initial project setup"
provides:
  - "OscClient class for bidirectional OSC communication with AbletonOSC"
  - "Request-response correlation via OSC address patterns"
  - "Per-address request queuing to prevent concurrent query conflicts"
  - "Context-aware timeout constants for different operation types"
  - "Structured error classification (PORT_NOT_READY, TIMEOUT, PORT_IN_USE, UNKNOWN)"
  - "Health check mechanism via /live/test endpoint"
affects: [02-mcp-server-scaffold, 03-track-control, 04-clip-control, 05-sample-indexer, 06-device-control, 07-listeners, 08-midi-editing]

# Tech tracking
tech-stack:
  added: ["osc@2.4.5"]
  patterns:
    - "ES module configuration (type: module in package.json)"
    - "Promise-based async OSC communication with timeout handling"
    - "Request correlation via Map-based pending request tracking"
    - "Per-address queuing using promise chains to serialize concurrent queries"
    - "Metadata extraction to return plain values instead of {type, value} objects"

key-files:
  created:
    - package.json
    - src/osc-client.js
    - .gitignore
    - .env.example
  modified: []

key-decisions:
  - "Use per-address request queuing instead of throwing on concurrent queries (transparent to callers)"
  - "Return plain values from query() instead of metadata objects (simplifies downstream code)"
  - "Enable metadata:true on UDPPort for type-safe message parsing"
  - "Support environment variables for port configuration (OSC_SEND_PORT, OSC_RECEIVE_PORT, OSC_HOST)"
  - "Use Node.js v20 built-in test runner instead of external test framework"

patterns-established:
  - "TIMEOUTS constant with context-aware durations: QUERY:5s, COMMAND:7s, LOAD:10s, HEALTH:3s"
  - "Error classification via classifyError() returning {type, message, recoverable}"
  - "Health check pattern via /live/test endpoint returning 'ok'"
  - "Request queuing per address using this.requestQueues Map storing promise chains"

# Metrics
duration: 2min
completed: 2026-02-05
---

# Phase 1 Plan 01: OSC Client Foundation Summary

**Bidirectional OSC client with request-response correlation, per-address queuing, context-aware timeouts, and structured error classification for AbletonOSC communication**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-05T22:13:09Z
- **Completed:** 2026-02-05T22:15:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Node.js ES module project initialized with osc@2.4.5 dependency
- OscClient class implements bidirectional UDP communication on ports 11000/11001
- Request-response correlation via OSC address pattern matching
- Per-address request queuing prevents concurrent query conflicts (transparent to callers)
- Context-aware timeouts for different operation types (query, command, load operations, health checks)
- Structured error classification distinguishes PORT_NOT_READY, TIMEOUT, PORT_IN_USE, and UNKNOWN errors
- Health check mechanism via /live/test endpoint
- Environment variable support for port configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize project scaffolding** - `e2cabde` (chore)
   - Set up paranoid-ableton project with ES module configuration
   - Install osc@2.4.5 for OSC communication
   - Create .gitignore with standard Node.js exclusions
   - Add .env.example with OSC port configuration (11000/11001)
   - Create src/, test/, scripts/ directory structure

2. **Task 2: Implement OscClient class** - `1e31992` (feat)
   - UDP communication with AbletonOSC (send:11001, receive:11000)
   - Request-response correlation via OSC address patterns
   - Per-address request queuing to prevent concurrent query conflicts
   - Context-aware timeouts (QUERY:5s, COMMAND:7s, LOAD:10s, HEALTH:3s)
   - Structured error classification (PORT_NOT_READY, TIMEOUT, PORT_IN_USE, UNKNOWN)
   - Health check via /live/test endpoint
   - metadata:true on UDPPort for type-safe message parsing
   - Returns plain values from query(), not metadata objects
   - Environment variable support for port configuration

## Files Created/Modified

**Created:**
- `package.json` - Node.js project manifest with ES module config and osc@2.4.5 dependency
- `src/osc-client.js` - OscClient class (325 lines) with query, open, close, healthCheck, classifyError, ensureConnected methods
- `.gitignore` - Standard Node.js exclusions (node_modules, .env, logs)
- `.env.example` - OSC port configuration template (11000/11001)

## Decisions Made

1. **Per-address request queuing:** Concurrent queries to the same OSC address are automatically queued instead of throwing errors. This makes the API transparent to callers - they don't need retry logic.

2. **Plain values from query():** The query() method extracts plain values from OSC metadata objects before returning. Callers receive `[120.0]` instead of `[{type:'f', value:120.0}]`, simplifying all downstream code.

3. **metadata:true on UDPPort:** Critical for type-safe message parsing. Without this, the osc package returns ambiguous raw values instead of {type, value} objects.

4. **Context-aware timeouts:** Different operation types have different timeout durations based on expected response times:
   - QUERY: 5000ms (standard queries)
   - COMMAND: 7000ms (commands that trigger processing)
   - LOAD_DEVICE/LOAD_SAMPLE: 10000ms (slower I/O operations)
   - HEALTH_CHECK: 3000ms (fast connectivity check)

5. **Environment variable support:** Port numbers respect process.env.OSC_SEND_PORT, OSC_RECEIVE_PORT, OSC_HOST with sensible defaults (11001, 11000, 127.0.0.1).

6. **Node.js built-in test runner:** Using node:test and node:assert instead of external test framework keeps dependencies minimal.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly. All verification checks passed:
- Syntax validation via `node --check`
- Export verification (OscClient class and TIMEOUTS constant)
- Construction test (OscClient instantiates without errors)
- TIMEOUTS has all 5 required keys with correct values
- package.json has type:module and osc@2.4.5
- .gitignore and .env.example exist with correct content

## User Setup Required

None - no external service configuration required.

This phase establishes the foundational OSC client. AbletonOSC installation and Ableton Live 12 setup will be addressed in Phase 2 when the MCP server scaffold includes smoke tests that actually communicate with Ableton.

## Next Phase Readiness

**Ready for Phase 2 (MCP Server Scaffold):**
- OscClient class fully implemented and verified
- All required methods exist (open, close, query, healthCheck, ensureConnected, classifyError)
- Error handling and timeout management in place
- Environment variable configuration established

**No blockers.**

**Phase 2 can now:**
- Import OscClient and instantiate with configuration
- Implement MCP server boilerplate
- Add smoke test that validates AbletonOSC connectivity
- Begin exposing OSC operations as MCP tools

---
*Phase: 01-osc-client-foundation*
*Completed: 2026-02-05*

## Self-Check: PASSED

All files verified:
- package.json ✓
- src/osc-client.js ✓
- .gitignore ✓
- .env.example ✓

All commits verified:
- e2cabde ✓
- 1e31992 ✓
