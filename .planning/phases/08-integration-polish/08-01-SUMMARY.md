---
phase: 08-integration-polish
plan: 01
subsystem: error-recovery
tags: [logging, reconnection, health-check, exponential-backoff]
dependency_graph:
  requires: [01-osc-client-foundation, 02-mcp-server-shell]
  provides: [structured-logging, auto-reconnection, connection-health-check]
  affects: [08-02, 08-03]
tech_stack:
  added: []
  patterns: [structured-json-logging, promise-lock, exponential-backoff, singleton-with-state]
key_files:
  created:
    - src/logger.js
  modified:
    - src/osc-client.js
    - src/tools/shared.js
    - src/tools/health.js
    - test/health.test.js
    - test/device.test.js
    - test/session.test.js
decisions:
  - id: INT-01
    decision: "Logger writes to stderr via process.stderr.write(), never stdout"
    reason: "stdout is MCP JSON-RPC transport; any non-protocol output breaks communication"
  - id: INT-02
    decision: "health.js bypasses shared.ensureConnected auto-reconnect, uses getOscClient directly"
    reason: "ableton_status is a diagnostic tool that should report specific error types (TIMEOUT, PORT_CONFLICT) rather than masking them behind CONNECTION_LOST"
  - id: INT-03
    decision: "Test mocks updated with ensureConnected/reconnect/close interface"
    reason: "shared.js now calls client.ensureConnected() and client.reconnect() -- all mock clients across test files need these methods"
metrics:
  duration: 5 min
  completed: 2026-02-07
---

# Phase 8 Plan 1: Structured Logging, Health Check, and Reconnection Summary

**One-liner:** Structured JSON logger to stderr with level filtering, auto health check on first tool call with promise-lock deduplication, and exponential backoff reconnection (500ms/1s/2s, cap 5s, 3 retries)

## What Was Done

### Task 1: Structured JSON Logger and OscClient Reconnect
- Created `src/logger.js` -- 10-line structured JSON logger
  - Levels: error (0), warn (1), info (2), debug (3)
  - LOG_LEVEL env var controls verbosity (default: info)
  - Output: `{"ts":"ISO-8601","level":"info","msg":"message",...data}\n`
  - Writes to `process.stderr.write()` -- never stdout
- Added `reconnect(maxRetries=3)` to OscClient class
  - Exponential backoff: 500ms -> 1000ms -> 2000ms (capped at 5000ms)
  - Each attempt: close port, create new UDPPort, re-bind handlers, open, healthCheck
  - Returns true on success, false after all retries exhausted
- Replaced all `console.error` calls in osc-client.js with `log()` calls
- Replaced unhandled message comment with `log('debug', 'Unhandled OSC message', { address })`

### Task 2: Auto Health Check with Promise Lock and Reconnection Wiring
- Enhanced `shared.js` `ensureConnected()`:
  - First call per session runs `client.ensureConnected()` (health check)
  - Promise-lock pattern: concurrent first-calls share one health check (no race condition)
  - Connection errors caught and routed to `attemptReconnect()`
- Added `attemptReconnect()` (internal, not exported):
  - Calls `client.reconnect()` -- on success, resets connection state and returns client
  - On failure, calls `resetClient()` and throws CONNECTION_LOST with troubleshooting steps
- Exported `resetConnectionState()` for error handlers to force re-verification
- Updated `health.js` to use `getOscClient()` directly for diagnostic status checks
  - Preserves specific error type reporting (TIMEOUT, PORT_CONFLICT, CONNECTION_FAILED)
  - Does not trigger auto-reconnect for status tool (diagnostic, not recovery)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Structured JSON logger and reconnect() | cc4fcbc | src/logger.js, src/osc-client.js |
| 2 | Auto health check with promise lock | eb3d366 | src/tools/shared.js, src/tools/health.js, test/*.test.js |

## Decisions Made

| ID | Decision | Reason |
|----|----------|--------|
| INT-01 | Logger writes to stderr only | stdout is MCP JSON-RPC transport |
| INT-02 | health.js bypasses auto-reconnect | Diagnostic tool should report specific error types |
| INT-03 | Test mocks updated with new interface | shared.js calls client.ensureConnected() and client.reconnect() |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock clients missing ensureConnected/reconnect/close methods**
- **Found during:** Task 2
- **Issue:** shared.js now calls client.ensureConnected() and client.reconnect() -- mock clients in health.test.js, device.test.js, and session.test.js lacked these methods, causing "not a function" errors
- **Fix:** Added ensureConnected(), reconnect(), and close() to all mock client factories; added resetConnectionState() calls in test beforeEach/afterEach blocks
- **Files modified:** test/health.test.js, test/device.test.js, test/session.test.js
- **Commit:** eb3d366

**2. [Rule 1 - Bug] health.js error classification broken by auto-reconnect**
- **Found during:** Task 2
- **Issue:** health.js called shared.ensureConnected() which now auto-reconnects on failure, masking specific error types (TIMEOUT, PORT_CONFLICT) behind generic CONNECTION_LOST
- **Fix:** Changed health.js to use getOscClient() directly for diagnostic purposes, preserving original error classification behavior
- **Files modified:** src/tools/health.js
- **Commit:** eb3d366

## Verification Results

- All 123 tests pass across 6 test files (0 failures)
- LOG_LEVEL=debug shows all 3 message levels on stderr
- LOG_LEVEL=error shows only error messages
- shared.js exports: ensureConnected, getOscClient, resetClient, resetConnectionState, setOscClient
- Zero console.log() calls in src/ directory

## Next Phase Readiness

Plan 08-01 provides the error recovery foundation for plans 08-02 (error normalization) and 08-03 (final integration testing). The logger, reconnection, and health check infrastructure are ready for use across all tool modules.

## Self-Check: PASSED
