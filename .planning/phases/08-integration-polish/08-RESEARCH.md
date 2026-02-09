# Phase 8: Integration & Polish - Research

**Researched:** 2026-02-07
**Domain:** MCP server production readiness, error recovery patterns, structured logging, startup validation, Claude Code registration, AbletonOSC device parameter names (DEV-05 stretch)
**Confidence:** HIGH (core integration patterns) / HIGH (production readiness) / MEDIUM (DEV-05 implementation) / LOW (DEV-06 preset browsing feasibility)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Workflow Orchestration
- All three workflow modes supported: fully autonomous, checkpoint-based, and step-by-step
- Mode selection via natural language cues (Claude infers from phrasing), not explicit tools or settings
- No pre-built workflow recipes -- Claude composes from the 50+ existing tools fresh each time
- Progress narration style: Claude's discretion

#### Error Recovery
- Severity-based failure handling: critical failures (can't create track, connection lost) stop the workflow; minor failures (can't set a single parameter) skip and continue
- Auto health check on first tool call per session -- verify Ableton connection before proceeding, then trust subsequent calls unless they fail
- Auto-reconnect with exponential backoff when Ableton disconnects mid-session
- Error message tone and diagnostic detail: Claude's discretion

#### Device Name Mapping (DEV-05 -- Nice-to-have)
- Human-readable parameter names are nice-to-have, not blocking v1 launch
- If implemented: dynamic query from Ableton at runtime (not hardcoded JSON maps)
- Always fresh queries -- no per-session caching of parameter names
- Preset browsing (DEV-06): Claude's discretion on whether to attempt based on AbletonOSC feasibility

#### Production Readiness
- Documentation: README.md (GitHub -- setup, features, usage) + CLAUDE.md (project context for Claude Code)
- Full startup validation: check Node version, verify osc package, confirm port availability -- clear errors if anything missing
- MCP server registration: add to Claude Code settings as part of this phase (like existing MCP servers)
- Structured JSON logging with levels (info, warn, error) for debugging

### Claude's Discretion
- Progress narration style during multi-step workflows
- Error message tone and diagnostic verbosity
- Whether to attempt DEV-06 (preset browsing) based on AbletonOSC API feasibility
- Specific reconnection backoff timing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 8 is the final phase, integrating all 7 existing subsystems (OSC, MCP server shell, transport, tracks, clips, samples, devices, sessions) into a production-ready tool. The codebase is already functional with 50+ tools across 9 domain modules. This phase adds: (1) auto health check and reconnection logic in the shared module, (2) structured JSON logging, (3) startup validation in `index.js`, (4) documentation (README.md rewrite, new CLAUDE.md), (5) Claude Code registration, and (6) stretch goals DEV-05 (human-readable device parameter names) and DEV-06 (preset browsing).

The critical insight is that **workflow orchestration requires zero new code** -- Claude already composes from the 50+ tools naturally. The CLAUDE.md file serves as the "workflow guide" that teaches Claude how to use the tools together. The actual implementation work is in error recovery, logging, startup validation, and documentation.

For DEV-05, the existing `value_string` API already provides human-readable parameter values (e.g., "2500 Hz", "Lowpass"). What DEV-05 adds is a convenience tool that maps friendly names like "filter cutoff" to the actual parameter names Ableton uses (e.g., "Filter Freq"). The user's decision is to query this dynamically from Ableton at runtime, not use hardcoded maps. This is achievable -- `device_get_parameters` already returns parameter names, and the existing `resolveParameterIndex` already supports name-based access. A thin wrapper tool or CLAUDE.md documentation may be sufficient.

For DEV-06 (preset browsing), AbletonOSC does NOT have browser API endpoints in the merged codebase. The Browser object is explicitly listed as "awaiting integration." This makes DEV-06 infeasible with stock AbletonOSC. My recommendation is to skip DEV-06 for v1.

**Primary recommendation:** Focus implementation on error recovery (auto health check, reconnection), structured logging, startup validation, documentation, and registration. DEV-05 can be addressed with CLAUDE.md guidance + existing tools. Skip DEV-06.

## Standard Stack

No new libraries needed. Phase 8 uses the existing project stack entirely.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.26.0 | MCP server framework | Already installed |
| osc | ^2.4.5 | UDP OSC communication | Already installed |
| music-metadata | ^11.11.2 | Sample metadata extraction | Already installed |

### Supporting
No new dependencies. All Phase 8 work is internal refactoring and documentation.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom JSON logger | pino/winston | User wants structured JSON logging. Custom is simpler (5 lines), zero deps. pino adds a dependency for minimal benefit in an MCP stdio server where logs go to stderr. |
| backoff npm package | Custom exponential backoff | The reconnection logic is ~15 lines of code. Adding a dependency for this is overkill. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Project Structure (no changes needed)
```
src/
  index.js               # MCP server entry point -- ADD startup validation
  osc-client.js          # OSC communication -- ADD reconnection logic
  tools/
    shared.js            # Lazy singleton -- ADD auto health check, reconnection
    registry.js          # Tool registry (already complete)
    helpers.js           # Shared helpers (already complete)
    health.js            # Health tool (enhance error messages)
    transport.js         # 10 tools (done)
    track.js             # 6 tools (done)
    mixer.js             # 8 tools (done)
    scene.js             # 7 tools (done)
    clip.js              # 8 tools (done)
    sample.js            # 4 tools (done)
    device.js            # 9 tools (done)
    session.js           # 2 tools (done)
  sample-index/          # Scanner subsystem (done)
```

### Pattern 1: Auto Health Check on First Tool Call
**What:** `ensureConnected()` in `shared.js` runs a health check the first time any tool is called per session, then trusts subsequent calls unless they fail.
**When to use:** Every tool call goes through `ensureConnected()` already. Add a "first call" flag.
**Example:**
```javascript
// Source: shared.js enhancement
let hasVerifiedConnection = false;

export async function ensureConnected() {
  const client = getOscClient();
  if (!client.isReady) {
    await client.open();
  }
  if (!hasVerifiedConnection) {
    await client.ensureConnected(); // health check
    hasVerifiedConnection = true;
  }
  return client;
}
```

### Pattern 2: Auto-Reconnect with Exponential Backoff
**What:** When a tool call fails due to connection loss, attempt to reconnect before throwing.
**When to use:** Any OSC query that times out or gets a connection error mid-session.
**Example:**
```javascript
// Source: osc-client.js enhancement
async reconnect(maxRetries = 3) {
  let delay = 500; // Start at 500ms
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log('warn', `Reconnection attempt ${attempt}/${maxRetries} (delay: ${delay}ms)`);
    await new Promise(r => setTimeout(r, delay));
    try {
      this.isReady = false;
      this.udpPort.close();
      // Create new UDP port
      this.udpPort = new osc.UDPPort({ /* same config */ });
      this.udpPort.on('message', this.handleMessage.bind(this));
      this.udpPort.on('error', this.handleError.bind(this));
      await this.open();
      const healthy = await this.healthCheck();
      if (healthy) {
        log('info', 'Reconnected to Ableton');
        return true;
      }
    } catch (err) {
      // Continue to next attempt
    }
    delay = Math.min(delay * 2, 5000); // Cap at 5s
  }
  return false;
}
```

### Pattern 3: Structured JSON Logging
**What:** A simple logger module that outputs JSON to stderr (MCP servers must not write to stdout).
**When to use:** All server events, errors, and diagnostics.
**Example:**
```javascript
// Source: new src/logger.js (or add to shared.js)
const LOG_LEVEL_MAP = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVEL_MAP[process.env.LOG_LEVEL || 'info'] ?? 2;

export function log(level, message, data = {}) {
  if ((LOG_LEVEL_MAP[level] ?? 0) > currentLevel) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };
  console.error(JSON.stringify(entry));
}
```

### Pattern 4: Startup Validation
**What:** Before starting the MCP server, validate: Node.js version, required packages, port availability.
**When to use:** In `index.js` before `server.connect()`.
**Critical constraint:** MCP servers on stdio must NOT write anything to stdout before the transport is connected. All validation output goes to stderr.
**Example:**
```javascript
// Source: index.js enhancement
function validateEnvironment() {
  const errors = [];

  // Check Node.js version (v20+)
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  if (nodeVersion < 20) {
    errors.push(`Node.js v20+ required, found v${process.versions.node}`);
  }

  // Check osc package is loadable
  try {
    await import('osc');
  } catch {
    errors.push('Package "osc" not installed. Run: npm install');
  }

  if (errors.length > 0) {
    for (const err of errors) {
      console.error(`STARTUP ERROR: ${err}`);
    }
    process.exit(1);
  }
}
```

### Pattern 5: MCP Server Registration
**What:** Add paranoid-ableton to `~/.claude/settings.json` alongside existing MCP servers.
**When to use:** One-time setup step, documented in README.
**Example:**
```json
{
  "mcpServers": {
    "ableton": {
      "command": "node",
      "args": ["/home/user/ableton-mcp/src/index.js"]
    }
  }
}
```
This follows the exact pattern used by the user's other custom MCP servers:
- `n8n`: `node /home/user/n8n-mcp-server/index.js`
- `ollama`: `node /home/user/ollama-mcp-server/index.js`
- `sqlite`: `node /home/user/sqlite-mcp-server/index.js`
- `epistemic`: `node /home/user/epistemic-mcp/src/index.js`

No env vars needed (ports have sensible defaults). Optional env vars can be added later if needed.

### Anti-Patterns to Avoid
- **Writing to stdout during startup validation:** MCP stdio transport expects clean stdout. All validation messages go to stderr.
- **Blocking reconnection in the main thread:** Reconnection should be attempted within the failing tool call's error handler, not as a background process.
- **Caching health check results indefinitely:** The user decision says "trust subsequent calls unless they fail" -- so reset the verified flag on any connection error.
- **Adding workflow-specific tools:** The user explicitly decided "no pre-built workflow recipes." Do not add tools like `workflow_start` or `workflow_checkpoint`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Human-readable parameter values | Custom formatting | AbletonOSC `value_string` endpoint | Already returns "2500 Hz", "Lowpass", etc. |
| Workflow orchestration | Workflow engine/state machine | CLAUDE.md documentation + existing tools | Claude composes from tools naturally; user explicitly decided no recipes |
| Connection health monitoring | Background heartbeat thread | On-demand health check on first call | User decided: check on first call, then trust unless failure |
| Log rotation | Custom log rotation | OS-level log rotation (logrotate) | MCP servers output to stderr, let the system handle rotation |
| Port conflict detection | Pre-bind UDP check | Handle EADDRINUSE error from osc.UDPPort | Node.js dgram has no pre-check API; handle the error event instead |

## Common Pitfalls

### Pitfall 1: Stdout Contamination
**What goes wrong:** Console.log() during startup or logging breaks MCP stdio transport.
**Why it happens:** MCP expects JSON-RPC on stdout. Any other output corrupts the protocol.
**How to avoid:** All logging must use `console.error()` (stderr). Never `console.log()` anywhere in the server.
**Warning signs:** Claude Code shows "Failed to parse MCP response" errors.

### Pitfall 2: Reconnection During Active Request
**What goes wrong:** Reconnecting while another tool call is waiting for an OSC response causes the pending request to hang or error.
**Why it happens:** Closing the UDP port cancels pending requests. The reconnect creates a new port.
**How to avoid:** Clear all pending requests before reconnecting. The existing `close()` method already does this. Reconnection should only happen after a failure is detected, not preemptively.
**Warning signs:** Multiple tool calls failing simultaneously after a single disconnect.

### Pitfall 3: Health Check Race Condition
**What goes wrong:** Two tool calls arrive simultaneously, both see `hasVerifiedConnection = false`, both run health checks.
**Why it happens:** MCP tool calls can arrive concurrently.
**How to avoid:** Use a promise-based lock -- store the health check promise and let the second call await it.
**Warning signs:** Double health check messages in logs.

### Pitfall 4: README Lists All 50+ Tools
**What goes wrong:** README becomes a wall of tool definitions that nobody reads.
**Why it happens:** Completeness instinct.
**How to avoid:** README shows capability categories (Transport, Tracks, Devices, etc.) with 2-3 example tools each. Full tool reference goes in CLAUDE.md (which Claude reads automatically).
**Warning signs:** README exceeds 200 lines.

### Pitfall 5: Hardcoding Device Parameter Friendly Names
**What goes wrong:** Building a JSON map of "friendly name" -> "Ableton parameter name" that becomes stale across Ableton versions.
**Why it happens:** DEV-05 asks for "human-readable names." The temptation is to build a lookup table.
**How to avoid:** User explicitly decided: "dynamic query from Ableton at runtime, not hardcoded JSON maps." The existing `device_get_parameters` tool already returns all parameter names. Claude reads these and can map them intelligently. CLAUDE.md can document common mappings as guidance, not as code.
**Warning signs:** A `.json` file with device parameter mappings.

### Pitfall 6: Registering MCP Server with Wrong Path
**What goes wrong:** Server registration uses relative path or wrong directory structure.
**Why it happens:** Other servers use different entry point paths.
**How to avoid:** Follow exact pattern: `"command": "node", "args": ["/home/user/ableton-mcp/src/index.js"]`. Note this project uses `src/index.js` not just `index.js` at root.
**Warning signs:** "ENOENT" or "Cannot find module" errors when Claude tries to use ableton tools.

## Code Examples

### Structured Logger
```javascript
// Source: Best practices from Node.js logging community, adapted for MCP stdio constraint
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;

export function log(level, message, data = {}) {
  if ((LOG_LEVELS[level] ?? 0) > CURRENT_LEVEL) return;
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...data
  });
  process.stderr.write(entry + '\n');
}
```

### Startup Validation in index.js
```javascript
// Source: Pattern from user's other MCP servers (n8n validates N8N_API_KEY at startup)
async function validateStartup() {
  // 1. Node.js version check
  const major = parseInt(process.versions.node.split('.')[0]);
  if (major < 20) {
    console.error(`STARTUP_ERROR: Node.js v20+ required (found v${process.versions.node})`);
    process.exit(1);
  }

  // 2. Verify osc package is importable
  try {
    await import('osc');
  } catch (e) {
    console.error('STARTUP_ERROR: "osc" package not found. Run: npm install');
    process.exit(1);
  }

  // 3. Port availability is checked lazily (on first tool call via ensureConnected)
  // because we don't want to bind the UDP port at startup -- only when needed
}
```

### Auto Health Check with Promise Lock
```javascript
// Source: shared.js enhancement
let healthCheckPromise = null;
let hasVerifiedConnection = false;

export async function ensureConnected() {
  const client = getOscClient();
  if (!client.isReady) {
    await client.open();
  }

  if (!hasVerifiedConnection) {
    if (!healthCheckPromise) {
      healthCheckPromise = client.ensureConnected()
        .then(() => { hasVerifiedConnection = true; })
        .finally(() => { healthCheckPromise = null; });
    }
    await healthCheckPromise;
  }

  return client;
}

// Reset on connection failure (called from error handlers)
export function resetConnectionState() {
  hasVerifiedConnection = false;
  healthCheckPromise = null;
}
```

### Reconnection with Exponential Backoff
```javascript
// Source: Standard exponential backoff pattern
async function attemptReconnect(client) {
  const MAX_RETRIES = 3;
  let delay = 500;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log('warn', `Reconnect attempt ${attempt}/${MAX_RETRIES}`, { delay_ms: delay });
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await client.close();
      resetClient();  // Clear singleton so next getOscClient() creates fresh
      const newClient = getOscClient();
      await newClient.open();
      const healthy = await newClient.healthCheck();
      if (healthy) {
        log('info', 'Reconnected to Ableton');
        resetConnectionState();
        return newClient;
      }
    } catch (err) {
      log('warn', `Reconnect attempt ${attempt} failed`, { error: err.message });
    }

    delay = Math.min(delay * 2, 5000); // 500 -> 1000 -> 2000 -> cap at 5000
  }

  throw new Error(
    'CONNECTION_LOST: Failed to reconnect to Ableton after ' + MAX_RETRIES + ' attempts.\n' +
    'Troubleshooting:\n' +
    '1. Ensure Ableton Live is running\n' +
    '2. Check AbletonOSC is enabled in Preferences > Link/Tempo/MIDI\n' +
    '3. Verify no other process is using UDP ports 11000/11001'
  );
}
```

### CLAUDE.md Structure (Project Context for Claude Code)
```markdown
# Paranoid Ableton

MCP server for Ableton Live 12 control via AbletonOSC.

## Architecture
[Server diagram, module structure, OSC communication flow]

## Tool Reference
[Complete list of all 54 tools organized by domain with brief descriptions]

## Workflow Patterns
- "Make me a beat" -> autonomous: create tracks, load instruments, write MIDI, mix
- "Help me build a beat" -> checkpoint: propose each step, wait for approval
- "Walk me through" -> step-by-step: explain each action, let user decide

## Device Parameter Quick Reference
[Common Ableton device parameter names for Wavetable, Operator, Drift, etc.]
[Claude uses this to map natural language to actual parameter names]

## Error Recovery
- Connection failures: auto-reconnect, clear guidance if Ableton is down
- Parameter errors: show valid ranges, suggest corrections
- Device loading: check spelling, list common device names
```

### README.md Structure (GitHub Documentation)
```markdown
# Paranoid Ableton
[One paragraph description]

## How It Works
[Architecture diagram: Claude Code <-> MCP <-> AbletonOSC <-> Ableton Live 12]

## Prerequisites
- Ableton Live 12 Suite
- AbletonOSC Remote Script
- Node.js v20+
- (Optional) AbletonOSC insert_device patch for device loading

## Quick Start
1. Clone repo
2. npm install
3. Register MCP server
4. Open Ableton, verify AbletonOSC
5. Start a Claude Code session

## Capabilities
[Category descriptions with 2-3 example tools each]

## Registration
[Exact JSON to add to ~/.claude/settings.json]

## Troubleshooting
[Common issues and fixes]

## License
MIT
```

## DEV-05: Human-Readable Device Parameter Names (Stretch)

### What AbletonOSC Already Provides
- `/live/device/get/parameter/name` -- returns the internal Ableton parameter name (e.g., "Filter 1 Freq", "Osc 1 Level")
- `/live/device/get/parameter/value_string` -- returns the human-readable value display (e.g., "2500 Hz", "Lowpass")
- `/live/device/get/parameters/name` -- bulk query for all parameter names

### What DEV-05 Actually Needs
The parameter names Ableton uses ARE already human-readable for native devices. "Filter 1 Freq", "Osc 1 Level", "Reverb Time" are readable names. The issue is that Claude may not know which parameter name to use for a natural language request like "turn up the filter cutoff."

### Recommended Approach (No New Code Needed)
1. CLAUDE.md documents common parameter name patterns for major devices (Wavetable, Operator, Drift, Simpler, Drum Rack, effects)
2. Claude uses `device_get_parameters` to list all parameters and their current values
3. Claude maps the natural language intent to the parameter name from the list
4. Claude uses `device_set_parameter` with the parameter name

This fulfills DEV-05 through documentation, not code. The "dynamic query from Ableton at runtime" already exists as `device_get_parameters`. Claude reads the names and maps them.

### If More Explicit Mapping is Desired
A `device_describe` tool could query all parameters and format them with `value_string` included for each, giving Claude richer context. But this is just `device_get_parameters` with `value_string` appended -- a minor enhancement, not a new subsystem.

**Confidence:** MEDIUM -- This approach depends on Claude's ability to map natural language to Ableton parameter names, which is generally strong but may need iteration.

## DEV-06: Preset Browsing (Stretch)

### AbletonOSC Browser API Status
The AbletonOSC README explicitly states that "Browser and other secondary structures documented within the LOM API are still awaiting integration." The source code confirms NO browser endpoints exist in the merged codebase:
- No `/live/browser/` endpoints
- No preset-related endpoints
- PR #183 proposes a comprehensive browser API but is not merged

### What PR #173 (insert_device) Does NOT Cover
PR #173 searches browser categories (instruments, audio_effects, etc.) for devices by name, but it does NOT:
- List available presets for a device
- Load a specific preset
- Browse preset categories
- Navigate the browser hierarchy

### Recommendation: Skip DEV-06 for v1
**Rationale:**
1. No AbletonOSC API exists for preset browsing
2. PR #183 (browser API proposal) is not merged and has broader scope
3. Building a custom browser navigation system would require forking AbletonOSC significantly
4. The user already marked this as "Claude's discretion based on feasibility"

**Feasibility verdict: Not feasible with current AbletonOSC.**

**Confidence:** HIGH that this is infeasible. The AbletonOSC source code confirms no browser endpoints.

## Severity-Based Error Handling

### Classification Framework
Based on the user's decision (critical failures stop, minor failures skip):

| Severity | Examples | Action |
|----------|----------|--------|
| CRITICAL | Connection lost, health check failed, port conflict, can't create track | Stop workflow, attempt reconnect, clear error message |
| MINOR | Parameter out of range, device not found by name, clip already exists | Skip operation, report what happened, continue |
| WARNING | Slow response, value clamped to range, index shifted after delete | Log warning, proceed with adjusted values |

### Implementation Location
Error severity classification should happen in the domain module handlers, not in a centralized middleware. Each module already has `try/catch` blocks that return `errorResponse()`. The reconnection logic should be in `shared.js` (around `ensureConnected`) since that is the single point of OSC client access.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| console.log to stderr | Structured JSON logging | Phase 8 | Machine-parseable, level-filterable |
| No startup validation | Validate Node version, packages, ports | Phase 8 | Clear errors before MCP transport starts |
| No auto-reconnect | Exponential backoff reconnection | Phase 8 | Survives Ableton restarts mid-session |
| README with "planning phase" | Full README with setup/usage | Phase 8 | Production documentation |
| No CLAUDE.md | Full project context for Claude | Phase 8 | Claude understands tool ecosystem |

## Open Questions

1. **Reconnection: close and recreate vs. reuse UDP port**
   - What we know: The osc library's UDPPort can be closed but may not support re-opening. Creating a new UDPPort after close is safer.
   - What's unclear: Whether the old port's error handlers interfere with the new one.
   - Recommendation: On reconnect, `close()` old port, create entirely new OscClient via `resetClient()` + `getOscClient()`. The lazy singleton pattern makes this clean.

2. **Health check timing: how long to wait before declaring dead**
   - What we know: Current HEALTH_CHECK timeout is 3000ms. Ableton under heavy load may take longer.
   - What's unclear: What's a realistic worst-case response time for `/live/test`
   - Recommendation: Keep 3000ms for initial health check. If it fails, the reconnection backoff gives Ableton time to recover.

3. **Registration: server name in settings.json**
   - What we know: User's pattern is short names: "n8n", "ollama", "sqlite", "epistemic"
   - Options: "ableton", "paranoid-ableton", "paranoid"
   - Recommendation: "ableton" -- simple, consistent with naming pattern. Tools will be `mcp__ableton__*`.

4. **DEV-05: Sufficient via CLAUDE.md or needs a tool?**
   - What we know: `device_get_parameters` already returns all parameter names. Claude can map natural language.
   - What's unclear: Whether Claude consistently maps "filter cutoff" to "Filter 1 Freq" without explicit guidance.
   - Recommendation: Start with CLAUDE.md documentation. If insufficient, add a `device_describe` tool that enriches the parameter list with `value_string` for each parameter. This is a minor addition to device.js.

## Sources

### Primary (HIGH confidence)
- AbletonOSC source code (`device.py`, `track.py`) -- confirmed all device API endpoints, no browser endpoints
- AbletonOSC README -- full API reference, explicit statement about browser API awaiting integration
- AbletonOSC PR #173 -- insert_device endpoint details, status: open/unmerged
- AbletonOSC PR #174 -- track selection fix for insert_device, status: open/unmerged
- Existing codebase (`src/index.js`, `src/tools/shared.js`, `src/tools/registry.js`, all domain modules) -- current architecture verified
- User's MCP server registrations (`~/.claude/settings.json`) -- exact registration pattern for node-based servers
- Phase 6 research (`06-RESEARCH.md`) -- device API reference, value_string documentation

### Secondary (MEDIUM confidence)
- Node.js dgram documentation -- UDP port binding error handling (EADDRINUSE detection)
- MCP SDK patterns from user's existing servers (epistemic, n8n) -- startup patterns, error handling
- Node.js logging best practices -- structured JSON format, stderr for MCP servers

### Tertiary (LOW confidence)
- Community exponential backoff patterns -- timing details (500ms base, 2x multiplier, 5s cap)
- AbletonOSC browser API proposal (Issue/PR #183) -- not merged, scope unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, using existing infrastructure
- Architecture (error recovery): HIGH -- straightforward enhancement to existing shared.js/osc-client.js
- Architecture (logging): HIGH -- simple JSON logger, well-understood pattern
- Architecture (startup validation): HIGH -- follows user's existing MCP server patterns
- Documentation: HIGH -- clear requirements, existing patterns to follow
- DEV-05 (parameter names): MEDIUM -- approach depends on Claude's natural language mapping ability
- DEV-06 (preset browsing): HIGH confidence that it's INFEASIBLE -- no AbletonOSC API exists
- Registration: HIGH -- exact pattern from user's existing servers

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable -- no external dependencies changing)
