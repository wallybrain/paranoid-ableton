# Architecture Research

**Project:** Paranoid Ableton (Ableton Live MCP Server)
**Researched:** 2026-02-05
**Confidence:** HIGH

## System Architecture

### Three-Layer Design

```
┌─────────────┐         ┌──────────────────────┐         ┌──────────────┐
│ Claude Code │ ← MCP → │  ableton-mcp-server  │ ← OSC → │ Ableton Live │
│  (Client)   │  stdio  │     (Node.js)        │   UDP   │ (AbletonOSC) │
└─────────────┘         └──────────────────────┘         └──────────────┘
                        │                      │
                        │  ┌────────────────┐  │
                        │  │  SQLite Index   │  │
                        │  │  (samples.db)   │  │
                        │  └────────────────┘  │
                        └──────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Talks To |
|-----------|---------------|----------|
| **MCP Server (index.js)** | Tool registration, request routing, stdio transport | Tool modules, OSC client |
| **OSC Client (osc-client.js)** | Send/receive OSC messages, request correlation, connection health | AbletonOSC via UDP |
| **Tool Modules (tools/*.js)** | Domain-specific tool implementations | OSC client, sample DB |
| **Sample Indexer (sample-indexer.js)** | Scan directories, extract metadata, parse filenames | File system, sample DB |
| **Sample DB (sample-db.js)** | SQLite operations for sample index | SQLite database |
| **AbletonOSC (Remote Script)** | Bridge between OSC messages and Live Object Model | Ableton Live (in-process) |

## Data Flow Patterns

### Pattern 1: Query (Read State)

```
Claude: "What's the current tempo?"
  → MCP tool: get_tempo
    → OSC send: /live/song/get/tempo (port 11001)
      → AbletonOSC: reads LOM Song.tempo
    ← OSC receive: /live/song/get/tempo [120.0] (port 11000)
  ← MCP response: { tempo: 120.0 }
← Claude: "The tempo is 120 BPM"
```

### Pattern 2: Command (Mutate Session)

```
Claude: "Set tempo to 128"
  → MCP tool: set_tempo { bpm: 128 }
    → OSC send: /live/song/set/tempo 128.0 (port 11001)
      → AbletonOSC: sets LOM Song.tempo = 128.0
    ← OSC receive: /live/song/get/tempo [128.0] (port 11000) [confirmation]
  ← MCP response: { success: true, tempo: 128.0 }
← Claude: "Tempo set to 128 BPM"
```

### Pattern 3: Listener (Subscribe to Changes)

```
MCP server startup:
  → OSC send: /live/song/start_listen/tempo (port 11001)

[User changes tempo in Ableton UI]
  ← OSC receive: /live/song/get/tempo [135.0] (port 11000) [pushed update]
  → Update cached state: tempo = 135.0

Claude: "What's the tempo?"
  → Return from cache: 135.0 (no OSC round-trip needed)
```

### Pattern 4: Sample Search

```
Claude: "Find me a punchy kick in C"
  → MCP tool: search_samples { type: "kick", key: "C", tags: ["punchy"] }
    → SQLite query: SELECT * FROM samples WHERE instrument_type = 'kick'
                    AND key = 'C' AND tags LIKE '%punchy%'
  ← MCP response: [{ path: "/samples/kicks/Kick_C_Punchy.wav", ... }]
← Claude: "Found 3 kicks matching..."
```

## OSC Protocol Details

### Port Configuration
- **Send to Ableton:** UDP port 11001
- **Receive from Ableton:** UDP port 11000
- **Transport:** UDP (localhost only)

### Message Format
OSC messages follow the Live Object Model hierarchy:
```
/live/[object]/[action]/[property] [args...]

Objects: song, track, clip, clip_slot, device, scene, view
Actions: get, set, create, delete, start_listen, stop_listen
```

### Request-Response Correlation

**Critical challenge:** OSC over UDP is stateless — responses don't carry request IDs.

**Solution: Sequential request pattern with promise queue**

```javascript
class OscClient {
  constructor() {
    this.pendingRequests = new Map(); // address -> { resolve, reject, timeout }
  }

  async query(address, args = []) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(address);
        reject(new Error(`OSC timeout: ${address}`));
      }, 5000);

      this.pendingRequests.set(address, { resolve, reject, timeoutId });
      this.port.send({ address, args });
    });
  }

  handleMessage(msg) {
    const pending = this.pendingRequests.get(msg.address);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(msg.address);
      pending.resolve(msg.args);
    }
    // Also update cache if listener is active
  }
}
```

### Listener Mechanism
AbletonOSC supports subscribing to property changes:
```
Subscribe:   /live/song/start_listen/tempo
Unsubscribe: /live/song/stop_listen/tempo
Updates:     /live/song/get/tempo [value] (pushed automatically)
```

### Wildcard Queries
Bulk data retrieval for efficiency:
```
/live/clip/get/* [track_index] [clip_index]
→ Returns all clip properties at once
```

### Error Handling
- No response within timeout → assume Ableton not responding
- Invalid address → AbletonOSC may silently ignore
- Connection health: periodic `/live/test` ping

## Sample Indexing Architecture

### Pipeline

```
Scan → Parse → Store → Search

1. SCAN: fast-glob("**/*.{wav,aiff,mp3,flac}") over configured directories
2. PARSE: For each file:
   a. music-metadata: extract embedded tags (BPM, key, duration)
   b. Filename parsing: infer instrument_type, key, BPM from name
   c. Folder parsing: infer category from directory structure
3. STORE: Upsert into SQLite (indexed on type, key, BPM)
4. SEARCH: SQL queries with flexible filtering
```

### Filename Parsing Heuristics

```javascript
// "Kick_808_C1_Hard.wav" → { type: "kick", key: "C", character: "hard" }
// "HiHat_Open_16th.wav" → { type: "hihat", variation: "open" }
// "Pad_Ambient_Dm_120bpm.wav" → { type: "pad", key: "Dm", bpm: 120 }

const INSTRUMENT_KEYWORDS = {
  kick: ["kick", "bd", "bassdrum", "808"],
  snare: ["snare", "sn", "sd", "clap"],
  hihat: ["hihat", "hh", "hat", "cymbal"],
  bass: ["bass", "sub", "808bass"],
  pad: ["pad", "ambient", "atmosphere"],
  lead: ["lead", "synth", "pluck"],
  fx: ["fx", "riser", "sweep", "impact", "noise"],
  vocal: ["vocal", "vox", "voice"],
  perc: ["perc", "percussion", "conga", "bongo", "shaker", "tambourine"]
};
```

### Incremental Re-indexing
- Track file `mtime` (modification time)
- On re-scan, only process files with changed `mtime`
- New files added, deleted files removed from index

## MCP Server Patterns

### Tool Organization by Domain

```
tools/
├── transport.js   → get_tempo, set_tempo, play, stop, record, get_time_signature
├── tracks.js      → list_tracks, create_midi_track, create_audio_track, delete_track
├── clips.js       → list_clips, create_clip, get_clip_notes, add_notes, set_loop
├── devices.js     → list_devices, load_instrument, load_effect, get_params, set_param
├── mixer.js       → get_track_volume, set_volume, set_pan, set_send, mute, solo, arm
├── scenes.js      → list_scenes, create_scene, fire_scene
├── samples.js     → scan_library, search_samples, get_sample_info
└── session.js     → get_session_state (full snapshot), get_track_details
```

### Graceful Degradation

```javascript
// Handle Ableton not running
async function withConnection(fn) {
  if (!oscClient.isConnected()) {
    return { isError: true, content: [{
      type: "text",
      text: "Ableton Live is not running or AbletonOSC is not loaded."
    }]};
  }
  try {
    return await fn();
  } catch (err) {
    if (err.message.includes('timeout')) {
      return { isError: true, content: [{
        type: "text",
        text: "Ableton did not respond. Is AbletonOSC enabled in Preferences > MIDI?"
      }]};
    }
    throw err;
  }
}
```

### State Caching Strategy

- **Transport state:** Cache via listeners (tempo, playing state, position)
- **Track list:** Cache, invalidate on create/delete operations
- **Device parameters:** Query on demand (too many to cache)
- **Full session snapshot:** Built on demand from cached + fresh queries

## Anti-Patterns

| Don't | Do Instead |
|-------|-----------|
| Block on OSC responses without timeout | Always use timeouts (5s default) |
| Send rapid-fire OSC without throttling | Queue and batch where possible |
| Cache everything | Cache transport/structure, query devices on demand |
| Scan samples at startup | Scan on demand or via explicit tool call |
| Use large wildcard queries for everything | Use specific queries, wildcards for bulk reads |
| Assume Ableton is always running | Check connection health, degrade gracefully |

## Build Order

```
Phase 1: OSC Client Foundation
  └── osc-client.js (send/receive, correlation, timeouts, health check)

Phase 2: MCP Server Shell
  └── index.js (SDK setup, stdio transport, tool registration)
  └── Depends on: Phase 1

Phase 3: Core Controllers (Transport, Tracks, Mixer, Scenes)
  └── tools/transport.js, tools/tracks.js, tools/mixer.js, tools/scenes.js
  └── Depends on: Phase 2

Phase 4: MIDI Editing (Clips, Notes)
  └── tools/clips.js
  └── Depends on: Phase 3 (needs tracks to exist)

Phase 5: Sample Indexer (PARALLEL with 3-4)
  └── sample-db.js, sample-indexer.js, tools/samples.js
  └── Independent subsystem, no OSC dependency

Phase 6: Device Control
  └── tools/devices.js (load instruments/effects, parameter control)
  └── Depends on: Phase 3 (needs tracks)

Phase 7: Session Awareness
  └── tools/session.js (full state snapshot, listeners)
  └── Depends on: Phase 3, 4, 6 (needs all state sources)

Phase 8: Integration & Polish
  └── Sample loading into tracks, preset browsing, connection management
  └── Depends on: Phase 5, 6, 7
```

**Critical path:** 1 → 2 → 3 → 4 = MVP
**Parallel work:** Phase 5 (Sample Indexer) alongside Phases 3-4
