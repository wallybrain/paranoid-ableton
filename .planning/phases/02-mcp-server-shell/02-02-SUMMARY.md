---
phase: 02-mcp-server-shell
plan: 02
subsystem: testing
tags: [node-test, mocking, mcp-tools, health-check, error-codes]
dependency-graph:
  requires: [02-01]
  provides: [mcp-server-tests, health-tool-tests, error-code-validation]
  affects: [03, 04]
tech-stack:
  added: []
  patterns: [mock-injection-via-setOscClient, boundary-mocking-at-OscClient]
key-files:
  created:
    - test/server.test.js
    - test/health.test.js
  modified:
    - src/tools/shared.js
    - src/tools/health.js
decisions:
  - id: 02-02-01
    decision: "Added setOscClient() to shared.js for test mock injection"
    rationale: "resetClient() alone insufficient -- tests need to inject mock OscClient without triggering real UDP port binding"
  - id: 02-02-02
    decision: "Fixed health.js catch block to retrieve client via getOscClient() fallback"
    rationale: "When ensureConnected() throws during open(), client variable is undefined in catch; getOscClient() returns the singleton that was already created"
metrics:
  duration: 2 min
  completed: 2026-02-05
---

# Phase 2 Plan 2: Testing & Validation Summary

Unit tests for MCP server framework and health tool, proving full pipeline with mocked OscClient.

## One-Liner

53 tests across 3 files: registry registration/dispatch, health tool success/failure/timeout/port-conflict paths, all mocked at OscClient boundary.

## What Was Done

### Task 1: Unit tests for tool registry and server wiring

Created `test/server.test.js` (50 lines) covering:
- `getToolDefinitions()` returns array including `ableton_status`
- `ableton_status` tool has name, description, inputSchema with type "object"
- `handleToolCall('nonexistent_tool')` returns `isError:true` with `UNKNOWN_TOOL`
- UNKNOWN_TOOL response includes the tool name for debugging

**Commit:** ae4f428

### Task 2: Unit tests for ableton_status health tool

Created `test/health.test.js` (191 lines) covering:
- **Success path:** `connected:true`, host/port info, valid JSON, content type "text"
- **Health check fails:** `healthCheck()` returns false -> `CONNECTION_FAILED`
- **Connection not established:** `open()` throws -> `CONNECTION_FAILED` (PORT_NOT_READY)
- **Timeout:** `healthCheck()` throws timeout error -> `TIMEOUT`
- **Port conflict:** `open()` throws EADDRINUSE -> `PORT_CONFLICT`
- **Internal error:** Unknown exceptions -> `INTERNAL_ERROR`
- **Routing:** `handle('other_tool')` returns `null`

Mock strategy: `createMockOscClient()` factory with controllable overrides, injected via `setOscClient()`.

**Commit:** f3e59e5

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed error classification when ensureConnected() throws**

- **Found during:** Task 2
- **Issue:** In health.js, when `ensureConnected()` throws (e.g., `open()` fails with EADDRINUSE), the `client` variable in the catch block is `undefined` because the async assignment never completed. This caused all connection errors to fall through to `INTERNAL_ERROR` instead of being properly classified as `CONNECTION_FAILED`, `TIMEOUT`, or `PORT_CONFLICT`.
- **Fix:** Added fallback in catch block: `if (!client) { try { client = getOscClient(); } catch {} }` to retrieve the singleton that was already created by `ensureConnected()` before it threw.
- **Files modified:** src/tools/health.js
- **Commit:** f3e59e5

**2. [Rule 2 - Missing Critical] Added setOscClient() to shared.js**

- **Found during:** Task 2
- **Issue:** `resetClient()` clears the singleton but provides no way to inject a mock. Tests would trigger real OscClient construction (with UDP port binding).
- **Fix:** Added `export function setOscClient(client) { oscClient = client; }` -- minimal test-support export.
- **Files modified:** src/tools/shared.js
- **Commit:** f3e59e5

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Unit tests for tool registry and server wiring | ae4f428 | test/server.test.js |
| 2 | Unit tests for ableton_status health tool | f3e59e5 | test/health.test.js, src/tools/shared.js, src/tools/health.js |

## Verification Results

| Check | Result |
|-------|--------|
| `node --test test/server.test.js` | 7/7 pass |
| `node --test test/health.test.js` | 16/16 pass |
| `npm test` (all 3 files) | 53/53 pass |
| No real UDP port binding | Confirmed |
| Error codes exercised | CONNECTION_FAILED, TIMEOUT, PORT_CONFLICT, UNKNOWN_TOOL, INTERNAL_ERROR |

## Decisions Made

1. **setOscClient() for testing** -- Added minimal export to shared.js rather than complex module mocking. The singleton pattern with reset+set provides clean test isolation.
2. **Mock classifyError order** -- Mock checks EADDRINUSE before isReady (unlike real OscClient), testing health.js mapping logic rather than OscClient classification precedence.

## Next Phase Readiness

Phase 2 complete. All server framework and health tool tests pass. Ready for Phase 3 (Session Query Tools).

**No blockers.** The test infrastructure (mock factory, setOscClient injection) is established for future tool modules.

## Self-Check: PASSED
