# Phase 01: OSC Client Foundation - Research

**Researched:** 2026-02-05
**Domain:** OSC (Open Sound Control) UDP communication with Node.js
**Confidence:** HIGH

## Summary

This phase builds a reliable OSC communication layer for controlling Ableton Live via AbletonOSC. The core challenge is building request-response correlation over stateless UDP while handling timeouts, errors, and connection health.

The standard approach uses the `osc` npm package (v2.4.5) with UDPPort for bidirectional communication. The critical pattern is a promise queue with address-based correlation: serialize requests per OSC address pattern, match responses by address, and implement context-aware timeouts. Error classification distinguishes between "Ableton not running", "AbletonOSC not loaded", and "operation timeout".

AbletonOSC provides a well-documented protocol: send to port 11001, receive on port 11000, use `/live/[object]/[action]/[property]` address patterns. Health checks use `/live/test` which returns 'ok'. All responses echo the original address pattern with result arguments.

**Primary recommendation:** Build an `OscClient` class with a `pendingRequests` Map keyed by address pattern, wrapping each query in a Promise with timeout. Use `osc.UDPPort` with `metadata: true` for type-safe message parsing.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `osc` | `2.4.5` | OSC protocol implementation | Most actively maintained Node.js OSC library, transport-agnostic core, full OSC 1.0/1.1 spec support |
| Node.js `dgram` | built-in | UDP socket layer | Native Node.js UDP implementation, used internally by `osc` UDPPort |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wolfy87-eventemitter` | `5.2.9` | Event handling | Bundled with `osc`, used for Port event API |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `osc` (chosen) | `node-osc` | Simpler API but less maintained, callback-based only, no metadata support |
| `osc` (chosen) | `osc-js` | Adds browser/WebSocket support (unnecessary), more complex configuration |

**Installation:**
```bash
npm install osc@2.4.5
```

**No additional dependencies needed** - `osc` package bundles everything required for UDP OSC.

## Architecture Patterns

### Recommended Class Structure

```javascript
src/
├── osc-client.js         // OscClient class (this phase)
└── index.js              // MCP server entry (Phase 2)
```

### Pattern 1: Promise Queue with Address-Based Correlation

**What:** Map OSC addresses to pending promises, resolve on response, reject on timeout.

**When to use:** Every OSC query/command that expects a response.

**Why it works:** AbletonOSC responds to the same address pattern as the query. By keying promises on address, we match responses without explicit correlation IDs.

**Example:**

```javascript
// Source: Verified pattern from project research + osc.js EventEmitter API
class OscClient {
  constructor(sendPort = 11001, receivePort = 11000) {
    this.pendingRequests = new Map(); // address -> { resolve, reject, timeoutId }
    this.listeners = new Map();        // address -> callback

    this.udpPort = new osc.UDPPort({
      localAddress: "127.0.0.1",
      localPort: receivePort,      // Receive from Ableton on 11000
      remoteAddress: "127.0.0.1",
      remotePort: sendPort,         // Send to Ableton on 11001
      metadata: true                // Parse type-annotated args
    });

    this.udpPort.on("message", (msg) => this.handleMessage(msg));
    this.udpPort.on("error", (err) => this.handleError(err));
    this.udpPort.on("ready", () => this.isReady = true);
  }

  async query(address, args = [], timeout = 5000) {
    // Serialize: don't send same address twice simultaneously
    if (this.pendingRequests.has(address)) {
      throw new Error(`Query already pending for ${address}`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(address);
        reject(new Error(`OSC timeout: ${address} (${timeout}ms)`));
      }, timeout);

      this.pendingRequests.set(address, { resolve, reject, timeoutId });

      // Send OSC message
      this.udpPort.send({
        address: address,
        args: args.map(val => ({ type: this.inferType(val), value: val }))
      });
    });
  }

  handleMessage(msg) {
    const { address, args } = msg;

    // Check for pending request
    const pending = this.pendingRequests.get(address);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(address);
      pending.resolve(args);
      return;
    }

    // Check for active listener (Phase 7)
    const listener = this.listeners.get(address);
    if (listener) {
      listener(args);
    }
  }

  inferType(val) {
    if (typeof val === 'number') return Number.isInteger(val) ? 'i' : 'f';
    if (typeof val === 'string') return 's';
    if (typeof val === 'boolean') return val ? 'T' : 'F';
    return 's'; // default to string
  }

  async open() {
    this.udpPort.open();
    // Wait for 'ready' event
    await new Promise((resolve) => {
      if (this.isReady) resolve();
      else this.udpPort.once("ready", resolve);
    });
  }

  async close() {
    this.udpPort.close();
  }
}
```

### Pattern 2: Context-Aware Timeouts

**What:** Different timeout values based on operation type.

**When to use:** Operations that trigger heavy Ableton processing need longer timeouts.

**Example:**

```javascript
const TIMEOUTS = {
  QUERY: 5000,         // Simple property query: 5s
  COMMAND: 7000,       // Set property, create track: 7s
  LOAD_DEVICE: 10000,  // Load instrument/effect: 10s (plugin initialization)
  LOAD_SAMPLE: 10000,  // Load audio file: 10s (disk I/O)
  HEALTH_CHECK: 3000   // Ping test: 3s (should be fast)
};

async getTempo() {
  const result = await this.query('/live/song/get/tempo', [], TIMEOUTS.QUERY);
  return result[0].value; // First arg is tempo
}

async loadInstrument(trackIndex, deviceName) {
  await this.query(
    '/live/track/create_device',
    [trackIndex, deviceName],
    TIMEOUTS.LOAD_DEVICE
  );
}
```

### Pattern 3: Health Check via `/live/test`

**What:** Send `/live/test` on startup and periodically to verify AbletonOSC is responding.

**When to use:** Before any operation, on startup, and optionally on interval for connection monitoring.

**Example:**

```javascript
async healthCheck() {
  try {
    const result = await this.query('/live/test', [], TIMEOUTS.HEALTH_CHECK);
    // AbletonOSC responds with 'ok'
    return result[0].value === 'ok';
  } catch (err) {
    return false;
  }
}

async ensureConnected() {
  if (!await this.healthCheck()) {
    throw new Error(
      "Ableton Live is not responding. " +
      "Check that Live is running and AbletonOSC is enabled in " +
      "Preferences > Link/Tempo/MIDI > Control Surface."
    );
  }
}
```

### Pattern 4: Error Classification

**What:** Distinguish between different error conditions based on symptoms.

**Example:**

```javascript
classifyError(err) {
  if (!this.isReady) {
    return {
      type: 'PORT_NOT_READY',
      message: 'OSC port not initialized. Call open() first.',
      recoverable: true
    };
  }

  if (err.message.includes('timeout')) {
    // Could be: Ableton not running, AbletonOSC not loaded, or operation taking too long
    return {
      type: 'TIMEOUT',
      message: 'No response from Ableton Live. Check:\n' +
               '1. Is Ableton Live running?\n' +
               '2. Is AbletonOSC enabled? (Preferences > MIDI)\n' +
               '3. Is Ableton busy? (loading large files, rendering)',
      recoverable: false
    };
  }

  if (err.message.includes('EADDRINUSE')) {
    return {
      type: 'PORT_IN_USE',
      message: `Port ${this.udpPort.options.localPort} already in use. ` +
               'Another OSC application may be running.',
      recoverable: false
    };
  }

  return {
    type: 'UNKNOWN',
    message: err.message,
    recoverable: false
  };
}
```

### Anti-Patterns to Avoid

- **Fire-and-forget sends without correlation:** Responses will be unmatched, causing silent failures or wrong data.
- **Global timeout for all operations:** Heavy operations (plugin loading) will falsely appear as connection failures.
- **No serialization per address:** Two simultaneous queries to same address will mismatch responses.
- **Caching responses indefinitely:** Ableton state changes outside MCP won't be reflected. Cache only with active listeners (Phase 7).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OSC message encoding/decoding | Custom binary parser | `osc` package | Handles type tags, bundles, timetags, SLIP framing |
| UDP socket management | Raw `dgram` sockets | `osc.UDPPort` | EventEmitter API, automatic error handling, ready state |
| Message type inference | Manual type detection | `metadata: true` option | Automatically annotates args with OSC type tags |
| Promise queue library | Custom queue implementation | Built-in Map + Promise pattern | OSC correlation is simple (address-based), external queue library adds complexity |

**Key insight:** The `osc` package provides exactly what's needed. Don't abstract it further or replace it with custom UDP code. The correlation logic is domain-specific (OSC address patterns), so building it in-house is correct.

## Common Pitfalls

### Pitfall 1: Response Mismatch from Concurrent Queries

**What goes wrong:** Two queries to same address sent rapidly return wrong values to wrong callers.

**Why it happens:** UDP is stateless. If you send `/live/song/get/tempo` twice before the first response arrives, both responses come back to `/live/song/get/tempo` with no way to distinguish which is which.

**How to avoid:** Serialize queries per address. Reject or queue if a request is already pending for that address.

**Warning signs:** Occasionally getting wrong values, especially under rapid tool calls. Intermittent "it worked sometimes" behavior.

### Pitfall 2: Port Binding Errors (EADDRINUSE)

**What goes wrong:** Server fails to start because port 11000 is already in use.

**Why it happens:** Another OSC app (TouchOSC, Oscleton, previous crashed instance) is using the port.

**How to avoid:**
- Listen for `error` event on UDPPort before calling `open()`
- Provide clear error message identifying port conflict
- Consider making ports configurable via `.env`

**Warning signs:** Server starts but immediately crashes with EADDRINUSE. No 'ready' event fires.

### Pitfall 3: Silent Errors from Malformed Messages

**What goes wrong:** Invalid OSC address or args are silently ignored by AbletonOSC.

**Why it happens:** AbletonOSC may not respond to invalid messages rather than sending an error response.

**How to avoid:**
- Always validate arguments before sending
- Log all sent messages at debug level
- If no response after timeout, assume error (don't wait forever)

**Warning signs:** Commands silently fail. Queries timeout despite Ableton running.

### Pitfall 4: False Timeouts During Heavy Operations

**What goes wrong:** Loading a large plugin or sample triggers timeout error even though Ableton is processing it.

**Why it happens:** Ableton's main thread is blocked during plugin initialization or file loading, OSC handler can't respond.

**How to avoid:** Use context-aware timeouts (10s for load operations vs 5s for queries).

**Warning signs:** Timeouts only during specific operations (loading plugins, creating many tracks). Operation succeeds in Ableton but MCP reports failure.

### Pitfall 5: Missing `metadata: true` Causes Type Confusion

**What goes wrong:** Numeric values returned as wrong type (int vs float), or string values missing.

**Why it happens:** Without `metadata: true`, `osc.js` infers types from values, which can be wrong for OSC spec compliance.

**How to avoid:** Always set `metadata: true` in UDPPort options. Access args as `arg.value` and check `arg.type`.

**Warning signs:** Tempo returned as 120 instead of 120.0, or boolean values parsed incorrectly.

## Code Examples

Verified patterns from official sources:

### Creating a UDPPort for Bidirectional Communication

```javascript
// Source: https://github.com/colinbdclark/osc.js README.md
import osc from 'osc';

const udpPort = new osc.UDPPort({
  localAddress: "127.0.0.1",
  localPort: 11000,        // Listen for Ableton responses
  remoteAddress: "127.0.0.1",
  remotePort: 11001,       // Send to Ableton
  metadata: true           // CRITICAL: Parse type-annotated args
});

udpPort.on("ready", () => {
  console.log("OSC UDP Port ready");
});

udpPort.on("message", (msg, timeTag, info) => {
  console.log("Received OSC message:", msg.address, msg.args);
});

udpPort.on("error", (err) => {
  console.error("OSC error:", err.message);
});

udpPort.open();
```

### Sending Typed OSC Messages

```javascript
// Source: https://github.com/colinbdclark/osc.js README.md
// Query tempo
udpPort.send({
  address: "/live/song/get/tempo",
  args: [] // No args for query
});

// Set tempo to 128 BPM
udpPort.send({
  address: "/live/song/set/tempo",
  args: [
    { type: "f", value: 128.0 }  // Float type
  ]
});

// Create MIDI track at index 2
udpPort.send({
  address: "/live/song/create_midi_track",
  args: [
    { type: "i", value: 2 }  // Integer type
  ]
});
```

### Health Check Pattern

```javascript
// Source: https://github.com/ideoforms/AbletonOSC README.md
// Send test ping
udpPort.send({ address: "/live/test", args: [] });

// Expected response:
// { address: "/live/test", args: [{ type: "s", value: "ok" }] }
```

### Handling Responses with Type Metadata

```javascript
// Source: https://github.com/colinbdclark/osc.js README.md + AbletonOSC protocol
udpPort.on("message", (msg) => {
  if (msg.address === "/live/song/get/tempo") {
    // With metadata: true, args are annotated
    const tempo = msg.args[0].value;  // Access .value property
    const type = msg.args[0].type;    // 'f' for float
    console.log(`Tempo: ${tempo} BPM (type: ${type})`);
  }

  if (msg.address === "/live/track/get/name") {
    const trackIndex = msg.args[0].value; // int
    const trackName = msg.args[1].value;  // string
    console.log(`Track ${trackIndex}: ${trackName}`);
  }
});
```

### Error Handling Pattern

```javascript
// Source: Node.js dgram documentation + osc.js error handling
udpPort.on("error", (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${udpPort.options.localPort} already in use`);
    process.exit(1);
  }

  if (err.code === 'EACCES') {
    console.error(`Permission denied for port ${udpPort.options.localPort}`);
    process.exit(1);
  }

  console.error("OSC error:", err);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-osc` (callback-based) | `osc` (EventEmitter + Promise-compatible) | ~2015 (osc.js 2.0) | Better async patterns, metadata support, transport-agnostic |
| Manual type inference | `metadata: true` option | osc.js 1.0+ | Type-safe message handling, proper OSC spec compliance |
| WebSocket for OSC | UDP for localhost | Always standard | Simpler, lower latency for localhost. WebSocket only for browser clients. |
| Custom correlation IDs in args | Address-based correlation | AbletonOSC design | Simpler protocol, but requires serialization per address |

**Deprecated/outdated:**
- `node-osc` is still maintained but less feature-complete than `osc`
- LiveOSC (predecessor to AbletonOSC) - outdated, use AbletonOSC instead

## Open Questions

Things that couldn't be fully resolved:

1. **AbletonOSC error response format**
   - What we know: AbletonOSC may silently ignore invalid messages
   - What's unclear: Does it ever send error responses? Format?
   - Recommendation: Assume timeout = error, log all sent messages for debugging

2. **Port conflict detection before bind**
   - What we know: EADDRINUSE fires after bind fails
   - What's unclear: Can we check port availability before attempting bind?
   - Recommendation: Catch EADDRINUSE and provide clear error message

3. **Maximum safe query rate**
   - What we know: UDP can drop packets under high load
   - What's unclear: What's the safe queries/second rate for localhost?
   - Recommendation: Start conservative (serialize all queries), optimize later if needed

4. **AbletonOSC Live 12 compatibility**
   - What we know: AbletonOSC README says "Live 11 or above"
   - What's unclear: Live 12 Suite specifically tested?
   - Recommendation: Verify during Phase 0 validation (mentioned in PITFALLS.md)

## Sources

### Primary (HIGH confidence)

- **osc npm package (2.4.5)** - https://www.npmjs.com/package/osc
  - Current version verified: 2.4.5 (published 2024-08-20)
  - API documentation, UDPPort examples, metadata option

- **osc.js GitHub README** - https://github.com/colinbdclark/osc.js
  - Port API, EventEmitter interface, message format, error handling

- **AbletonOSC GitHub README** - https://github.com/ideoforms/AbletonOSC
  - Protocol specification, port numbers (11000/11001), message address patterns
  - `/live/test` health check, Application API, Song API
  - Wildcard query support, listener mechanism

- **Node.js dgram documentation** - https://nodejs.org/api/dgram.html
  - UDP socket error codes (EADDRINUSE, EACCES), event handling

### Secondary (MEDIUM confidence)

- **WebSearch: osc.js UDPPort examples** - Multiple sources agreeing
  - UDPPort configuration with separate localPort/remotePort
  - metadata: true for type-annotated args
  - EventEmitter API (ready, message, error events)

- **WebSearch: AbletonOSC protocol usage** - Community implementations
  - Port 11000 for receiving, 11001 for sending (verified in official README)
  - Response format matches request address pattern
  - No explicit correlation IDs in protocol

### Tertiary (LOW confidence)

- **WebSearch: UDP request-response patterns** - General patterns, not OSC-specific
  - Promise queue concepts, timeout patterns
  - Mark for validation: Actual implementation should be tested with AbletonOSC

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - osc package verified via npm, version confirmed
- Architecture: **HIGH** - UDPPort API verified from official docs, promise pattern is standard practice
- Pitfalls: **MEDIUM-HIGH** - Port conflicts and timeouts are documented, correlation issues inferred from protocol design
- Code examples: **HIGH** - All examples verified from official osc.js and AbletonOSC documentation

**Research date:** 2026-02-05
**Valid until:** 60 days (stable libraries, slow-moving protocol spec)
