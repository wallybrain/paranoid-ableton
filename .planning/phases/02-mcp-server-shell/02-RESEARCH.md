# Phase 2: MCP Server Shell - Research

**Researched:** 2026-02-05
**Domain:** MCP SDK server implementation, tool registration framework, error propagation
**Confidence:** HIGH

## Summary

Phase 2 bridges Claude Code to Ableton via the Phase 1 OSC client by building an MCP server shell. The user has three existing MCP servers (epistemic-mcp, n8n-mcp-server, sqlite-mcp-server) all using the same low-level `Server` class pattern from `@modelcontextprotocol/sdk`. The n8n-mcp-server is on SDK v1.25.3 while epistemic-mcp is on v0.5.0 -- both use identical import paths and API patterns, confirming backward compatibility.

The MCP SDK v1.x introduces a high-level `McpServer` class (with `registerTool()`) and marks the low-level `Server` class as deprecated. However, the user's established pattern uses the low-level `Server` + `setRequestHandler(CallToolRequestSchema, ...)` approach consistently across all servers. The recommendation is to stay with this proven pattern for consistency, since it works identically in v1.x and matches what the user already maintains.

The key architecture challenge is designing a tool registration pattern that scales from 1 test tool (Phase 2) to 30+ tools across Phases 3-8. The recommendation is domain-based controller modules (transport.js, tracks.js, mixer.js, etc.) that each export tool definitions and handlers, with a central registry that aggregates them.

**Primary recommendation:** Use the low-level `Server` + `setRequestHandler` pattern matching the user's existing servers, with domain-based controller modules and a lazy-initialized singleton OscClient.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Lazy OSC connection -- connect on first tool call, not on server startup. Server must start in Claude Code even if Ableton is not running yet.
- Explicit health/status tool -- `ableton_status` or similar that Claude can call to check connectivity.
- Short error codes with concise context, not verbose troubleshooting guides. Example style: `CONNECTION_FAILED: Ableton not reachable on port 11001`. NOT multi-line troubleshooting steps.
- Unit tests required -- same node:test approach as Phase 1.
- Follow user's established pattern from n8n-mcp, sqlite-mcp, epistemic-mcp servers.

### Claude's Discretion
- Tool code organization and registration pattern
- OSC address mapping strategy (inline vs central config)
- Tool granularity (per-action vs grouped-by-domain)
- Validation infrastructure level (MCP schema only vs light helpers)
- MCP error response strategy (isError flag vs error-in-content)
- Error severity classification (recoverable vs fatal)
- OSC address exposure in errors
- Health check frequency/caching strategy
- Health tool response detail level
- Test tool scope and permanence (health tool may serve double duty)
- Test mock boundary (mock OscClient vs mock UDP layer)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.25.3 | MCP server framework | Official SDK, used by all user's MCP servers |
| `osc` | ^2.4.5 | OSC over UDP | Already installed from Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` | built-in | Unit testing | All tests (Phase 1 established pattern) |
| `node:assert/strict` | built-in | Assertions | All test assertions |
| `node:events` | built-in | EventEmitter for mocks | Test infrastructure |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Low-level `Server` | High-level `McpServer` | McpServer has nicer API (`registerTool()`) but user's 3 servers all use low-level pattern; consistency wins |
| SDK ^0.5.0 | SDK ^1.25.3 | v1.x has same API surface for Server class, plus new features; n8n-mcp already on v1.25.3 |
| zod (for validation) | JSON Schema only | SDK v1.x uses zod internally, but the user's servers all use raw JSON Schema for inputSchema; stay consistent |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@^1.25.3
```

**Confidence:** HIGH -- verified by examining user's installed SDKs, import paths, and API surfaces in both v0.5.0 and v1.25.3.

## Architecture Patterns

### Recommended Project Structure
```
src/
  index.js              # MCP server entry point (stdio transport, handler wiring)
  osc-client.js         # Phase 1 OSC client (already exists)
  tools/
    registry.js         # Aggregates all tool definitions and handlers
    health.js           # ableton_status tool (Phase 2)
    transport.js        # Phase 3: play, stop, tempo, metronome
    tracks.js           # Phase 3: track CRUD, arm, rename
    mixer.js            # Phase 3: volume, pan, sends, mute/solo
    scenes.js           # Phase 3: scene/clip management
    midi.js             # Phase 4: MIDI clip editing
    devices.js          # Phase 6: device control
    session.js          # Phase 7: session state snapshots
test/
  osc-client.test.js    # Phase 1 tests (already exists)
  server.test.js        # Phase 2: server startup, tool registration
  health.test.js        # Phase 2: health tool tests
```

### Pattern 1: Low-Level Server with setRequestHandler (User's Established Pattern)

**What:** Use the `Server` class with `setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema`, exactly as in epistemic-mcp and n8n-mcp-server.
**When to use:** Always -- this is the locked pattern.
**Why:** All 3 of the user's existing MCP servers use this exact pattern. Import paths are identical in v0.5.0 and v1.25.3.

```javascript
// src/index.js - follows epistemic-mcp and n8n-mcp-server patterns exactly
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolDefinitions, handleToolCall } from './tools/registry.js';

const server = new Server(
  { name: "paranoid-ableton", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getToolDefinitions()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Paranoid Ableton MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

### Pattern 2: Domain Controller Modules with Tool Registry

**What:** Each domain (health, transport, tracks, etc.) exports a standard shape: an array of tool definitions and a handler function. The registry aggregates them.
**When to use:** This is the recommended pattern for organizing 30+ tools across 6+ domains.

```javascript
// src/tools/health.js - single domain module
import { getOscClient } from './shared.js';

export const tools = [
  {
    name: "ableton_status",
    description: "Check Ableton Live connectivity and return current status",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

export async function handle(name, args) {
  if (name !== 'ableton_status') return null; // not ours

  const client = getOscClient();
  try {
    if (!client.isReady) {
      await client.open();
    }
    const healthy = await client.healthCheck();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          connected: healthy,
          host: client.host,
          sendPort: client.sendPort,
          receivePort: client.receivePort
        })
      }]
    };
  } catch (err) {
    const classified = client.classifyError(err);
    return {
      content: [{
        type: "text",
        text: `${classified.type}: ${classified.message}`
      }],
      isError: true
    };
  }
}
```

```javascript
// src/tools/registry.js - aggregates all domain modules
import * as health from './health.js';
// Phase 3+: import * as transport from './transport.js';
// Phase 3+: import * as tracks from './tracks.js';
// etc.

const modules = [health];

export function getToolDefinitions() {
  return modules.flatMap(m => m.tools);
}

export async function handleToolCall(name, args) {
  for (const mod of modules) {
    const result = await mod.handle(name, args);
    if (result !== null) return result;
  }
  throw new Error(`Unknown tool: ${name}`);
}
```

### Pattern 3: Lazy Singleton OscClient

**What:** A shared module that lazily creates and opens the OscClient on first access. The server starts without any OSC connection; the client is initialized on the first tool call.
**When to use:** Required by locked decision -- server must start even if Ableton is not running.

```javascript
// src/tools/shared.js - lazy OscClient singleton
import { OscClient } from '../osc-client.js';

let oscClient = null;

export function getOscClient() {
  if (!oscClient) {
    oscClient = new OscClient();
  }
  return oscClient;
}

export async function ensureConnected() {
  const client = getOscClient();
  if (!client.isReady) {
    await client.open();
  }
  return client;
}
```

### Pattern 4: Error Response Pattern (isError flag)

**What:** Use the MCP `isError: true` flag for tool-level errors, with short error codes matching the user's required style.
**When to use:** All error responses from tool handlers.
**Rationale:** The n8n-mcp-server already uses `isError: true` in its catch block. This is the standard MCP way to signal errors to Claude.

```javascript
// Standard error response
return {
  content: [{ type: "text", text: `TIMEOUT: No response from Ableton on /live/test within 3000ms` }],
  isError: true
};

// Standard success response
return {
  content: [{ type: "text", text: JSON.stringify(result) }]
};
```

### Anti-Patterns to Avoid
- **Monolithic index.js with all tools inline:** The epistemic-mcp has all 10 tools in index.js. This works at 10 tools but will not scale to 30+. Use domain modules.
- **Eager OSC connection in server constructor:** Server must start without Ableton. OscClient.open() must be deferred to first tool call.
- **Verbose error messages with troubleshooting steps:** User explicitly decided against this. Use `TYPE: concise context` format.
- **Using McpServer high-level API:** While newer and arguably cleaner, it breaks consistency with all existing user servers. The low-level Server class is not going away (it underlies McpServer).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol handling | Custom JSON-RPC over stdio | `@modelcontextprotocol/sdk` Server class | Protocol negotiation, schema validation, transport abstraction |
| Stdio transport | Custom stdin/stdout parsing | `StdioServerTransport` | Handles buffering, framing, error handling |
| Tool input validation | Custom argument validators | MCP SDK `inputSchema` (JSON Schema) | SDK validates against schema before calling handler |
| Request correlation | Custom ID tracking | MCP SDK internal handling | SDK correlates requests/responses automatically |

**Key insight:** The MCP SDK handles all protocol-level concerns. The server code only needs to define tools (schemas + handlers) and wire up the transport.

## Common Pitfalls

### Pitfall 1: stdout Pollution
**What goes wrong:** Any `console.log()` output corrupts the MCP stdio transport, causing protocol errors.
**Why it happens:** MCP stdio uses stdout for JSON-RPC messages. Any non-protocol output breaks framing.
**How to avoid:** Use `console.error()` for all logging (it goes to stderr). The user's servers already do this. For file-based debug logging, write to a log file like epistemic-mcp does.
**Warning signs:** Claude Code fails to connect to MCP server, or gets garbled responses.

### Pitfall 2: Synchronous OscClient Initialization Blocking Server Start
**What goes wrong:** If OscClient.open() is called during server setup and Ableton is not running, the server hangs or errors before MCP transport connects.
**Why it happens:** UDP port binding can fail, or the health check timeout blocks startup.
**How to avoid:** Lazy initialization pattern. Create OscClient instance lazily, call open() on first tool call. Server.connect(transport) should complete independently of OSC state.
**Warning signs:** `mcp__paranoid-ableton__ableton_status` tool not appearing in Claude Code.

### Pitfall 3: Forgetting to Handle "Not Connected" State Gracefully
**What goes wrong:** Tool calls throw unhandled exceptions when Ableton is not running, crashing the MCP server process.
**Why it happens:** OscClient.query() throws if not ready, health check times out, errors propagate uncaught.
**How to avoid:** Every tool handler must wrap OscClient calls in try/catch and return `isError: true` responses. Never let exceptions escape the handler.
**Warning signs:** MCP server process exits unexpectedly.

### Pitfall 4: Tool Name Conflicts Across Domains
**What goes wrong:** Two domain modules accidentally define a tool with the same name.
**Why it happens:** As tools grow from 1 to 30+, names like "get_status" could collide.
**How to avoid:** Use a consistent prefix convention. Recommendation: `ableton_` prefix for all tools (e.g., `ableton_status`, `ableton_get_tempo`, `ableton_play`). The registry can validate uniqueness at startup.
**Warning signs:** Wrong handler runs for a tool call.

### Pitfall 5: MCP SDK Version Mismatch with Import Paths
**What goes wrong:** Installing a different major version of the SDK causes import resolution failures.
**Why it happens:** v0.5.0 uses `dist/server/index.js` directly; v1.x uses package.json `exports` mapping. The import path `@modelcontextprotocol/sdk/server/index.js` works with both via different mechanisms.
**How to avoid:** Pin to `^1.25.3` (matching n8n-mcp-server). Use the exact import paths from the user's working servers.
**Warning signs:** Module resolution errors on `npm start`.

### Pitfall 6: Not Using isError Flag for Error Responses
**What goes wrong:** Claude receives error text but treats it as a successful response, leading to confused behavior.
**Why it happens:** Returning error details in content without `isError: true` means Claude sees it as valid tool output.
**How to avoid:** Always set `isError: true` when the tool call failed. The n8n-mcp-server demonstrates this pattern.
**Warning signs:** Claude tries to parse error messages as if they were data.

## Code Examples

### Complete MCP Server Entry Point
```javascript
// src/index.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolDefinitions, handleToolCall } from './tools/registry.js';

const server = new Server(
  { name: "paranoid-ableton", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getToolDefinitions()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Paranoid Ableton MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

### Tool Definition Shape (JSON Schema for inputSchema)
```javascript
// Standard tool definition matching MCP ToolSchema
{
  name: "ableton_status",
  description: "Check Ableton Live connectivity and return current status",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

### Error Response with isError Flag
```javascript
// Use isError for all tool-level failures
return {
  content: [{ type: "text", text: `CONNECTION_FAILED: Ableton not reachable on port ${client.sendPort}` }],
  isError: true
};
```

### Claude Code Registration
```json
{
  "mcpServers": {
    "ableton": {
      "type": "stdio",
      "command": "node",
      "args": ["/home/lwb3/ableton-mcp/src/index.js"],
      "env": {}
    }
  }
}
```

### Unit Test Pattern (Mocking at OscClient Level)
```javascript
// test/server.test.js - mock at OscClient boundary
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock the shared module to provide a fake OscClient
// This avoids UDP port binding in tests
const mockOscClient = {
  isReady: false,
  host: '127.0.0.1',
  sendPort: 11001,
  receivePort: 11000,
  async open() { this.isReady = true; },
  async close() { this.isReady = false; },
  async healthCheck() { return this.isReady; },
  async query(address, args, timeout) { /* mock responses */ },
  classifyError(err) {
    return { type: 'MOCK_ERROR', message: err.message, recoverable: false };
  }
};
```

## Discretionary Recommendations

### Tool Code Organization: Domain Controller Modules
**Recommendation:** Use `src/tools/` directory with one file per domain. Each file exports `tools` (array of definitions) and `handle(name, args)` (dispatcher). A `registry.js` aggregates all modules.
**Rationale:** Scales from 1 tool (Phase 2) to 30+ (Phase 8). Each phase adds new module files without modifying existing ones. Clear ownership boundaries.

### OSC Address Mapping: Inline in Controllers
**Recommendation:** Define OSC addresses inline within each controller function, not in a central config.
**Rationale:** OSC addresses are tightly coupled to their tool logic. A central config adds indirection with no benefit -- you never need the address without the surrounding logic. AbletonOSC addresses are stable strings like `/live/song/get/tempo`, not configuration that changes between environments.

### Tool Granularity: Fine-Grained Per-Action
**Recommendation:** One MCP tool per distinct Ableton action. E.g., `ableton_play`, `ableton_stop`, `ableton_get_tempo`, `ableton_set_tempo` -- not `ableton_transport` with a sub-action parameter.
**Rationale:** Claude's tool calling works best with focused, single-purpose tools. Clear names = better tool selection. Input schemas are simpler and validation is tighter. This matches the n8n-mcp-server pattern (separate tools for list, get, create, update, delete, execute).

### Validation: MCP Schema Only
**Recommendation:** Rely on MCP SDK's JSON Schema `inputSchema` validation. No additional validation helpers.
**Rationale:** The SDK validates input against the schema before calling the handler. For simple tools (most Ableton operations are 0-3 parameters), this is sufficient. Custom validation adds complexity without meaningful benefit.

### Error Strategy: isError Flag + Short Codes
**Recommendation:** Use `isError: true` on all error responses. Error text follows the pattern `ERROR_CODE: concise context`. Never include raw OSC addresses in user-facing errors (they are implementation details).
**Rationale:** `isError: true` is the standard MCP mechanism (used by n8n-mcp-server). Short codes match the user's explicit requirement. Claude can read the code and take appropriate action.

Error classification mapping from OscClient.classifyError:
| OscClient Type | MCP Error Code | Recoverable |
|----------------|---------------|-------------|
| PORT_NOT_READY | CONNECTION_FAILED | Yes (retry after open) |
| TIMEOUT | TIMEOUT | Yes (Ableton may be busy) |
| PORT_IN_USE | PORT_CONFLICT | No (another process has port) |
| UNKNOWN | INTERNAL_ERROR | No |

### Health Check: On-Demand Only via ableton_status Tool
**Recommendation:** No per-call health checking, no cached TTL. The `ableton_status` tool is the sole health check mechanism -- Claude calls it when needed.
**Rationale:** Per-call checking adds latency to every tool call. Cached TTL adds state management complexity. Claude is intelligent enough to call `ableton_status` before a session or when errors occur. The tool doubles as both the health check and the Phase 2 proof-of-concept.

### Health Tool Response: Connection Status + Port Info
**Recommendation:** `ableton_status` returns `{ connected: boolean, host, sendPort, receivePort, version? }`. On failure, returns `isError: true` with error code.
**Rationale:** Provides enough info for Claude to diagnose issues without being verbose. The `version` field (if obtainable) could be useful but is not required for Phase 2.

### Test Tool: ableton_status IS the Test Tool
**Recommendation:** The `ableton_status` health tool serves double duty as the Phase 2 proof-of-concept. It is permanent (useful in all future phases), exercises the full pipeline (MCP -> OscClient -> UDP -> AbletonOSC), and validates error propagation.
**Rationale:** No need for a separate temporary test tool. The health check proves the entire chain works. It will be useful forever -- Claude should always be able to check connectivity.

### Mock Boundary: Mock OscClient, Not UDP
**Recommendation:** Mock at the OscClient level for Phase 2 server tests. The Phase 1 tests already mock at the UDP level for OscClient unit tests. Phase 2 tests should mock the whole OscClient to avoid UDP port binding.
**Rationale:** Phase 2 tests are about the MCP server layer, not the OSC transport. Mocking OscClient gives clean tests without UDP complexity. Phase 1 already thoroughly tests the UDP layer.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Server` class (low-level) | `McpServer` class (high-level) | SDK v1.x (late 2025) | `Server` still works, marked deprecated. `McpServer` offers `registerTool()`, `registerResource()`, etc. |
| `@modelcontextprotocol/sdk` v0.5.0 | v1.25.3 | Major release 2025 | Same import paths, same Server API. New features: tool annotations, output schemas, tasks (experimental). |
| Manual inputSchema JSON | Zod-based schema with `McpServer.registerTool()` | SDK v1.x | Only relevant if using McpServer. Low-level Server still uses raw JSON Schema. |
| Protocol 2024-10-07 | Protocol 2025-11-25 | Nov 2025 | CompatibilityCallToolResultSchema bridges versions. Server class handles negotiation automatically. |

**Deprecated/outdated:**
- `McpServer.tool()` method: Deprecated in favor of `McpServer.registerTool()` (only relevant if using high-level API)
- The `Server` class itself has a `@deprecated` JSDoc suggesting `McpServer`, but it remains fully functional and is what the user's servers use

## Open Questions

1. **MCP SDK zod dependency in v1.x**
   - What we know: v1.25.3 has zod as a peer/internal dependency (`import * as z from 'zod/v4'` in types). The user's n8n-mcp-server has `"zod": "^4.3.6"` in its dependencies.
   - What's unclear: Whether installing `@modelcontextprotocol/sdk@^1.25.3` will require explicitly adding zod to this project's dependencies, or if it's bundled.
   - Recommendation: Install the SDK and check. If zod is needed, add it. For the low-level Server API with raw JSON Schema, zod may not be needed at runtime.

2. **ableton_status version reporting**
   - What we know: AbletonOSC likely has a version query endpoint, but we have not verified this.
   - What's unclear: Which OSC address returns AbletonOSC or Ableton Live version info.
   - Recommendation: Phase 2 health tool returns `connected: true/false` and ports. Version info is a nice-to-have for later phases. Do not block on this.

## Sources

### Primary (HIGH confidence)
- `/home/lwb3/n8n-mcp-server/index.js` -- User's MCP server using SDK v1.25.3 with low-level Server API, verified import paths and error handling pattern
- `/home/lwb3/epistemic-mcp/src/index.js` -- User's MCP server using SDK v0.5.0, verified same API pattern works across versions
- `/home/lwb3/n8n-mcp-server/node_modules/@modelcontextprotocol/sdk/` -- Examined v1.25.3 SDK package.json exports, Server types, McpServer types, StdioServerTransport, CallToolResultSchema
- `/home/lwb3/epistemic-mcp/node_modules/@modelcontextprotocol/sdk/` -- Examined v0.5.0 SDK structure confirming different dist layout but compatible import paths
- `/home/lwb3/ableton-mcp/src/osc-client.js` -- Phase 1 OscClient with healthCheck(), classifyError(), open(), close(), query()
- `/home/lwb3/ableton-mcp/test/osc-client.test.js` -- Phase 1 test patterns with MockUDPPort

### Secondary (MEDIUM confidence)
- `/home/lwb3/.claude.json` -- Verified Claude Code MCP server registration format for stdio servers

### Tertiary (LOW confidence)
- SDK v1.x `McpServer` deprecation and `registerTool()` API -- read from type definitions only, not verified against migration guides

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified SDK versions, import paths, and API compatibility across user's installed servers
- Architecture: HIGH -- patterns derived from user's existing working servers plus scaling analysis for 30+ tools
- Pitfalls: HIGH -- identified from real code analysis (stdout corruption, lazy init, error handling) and MCP SDK documentation
- Error handling: HIGH -- verified isError flag usage in n8n-mcp-server, CallToolResultSchema examined

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable -- MCP SDK low-level API is mature)
