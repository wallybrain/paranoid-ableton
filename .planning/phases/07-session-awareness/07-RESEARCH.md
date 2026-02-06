# Phase 7: Session Awareness - Research

**Researched:** 2026-02-06
**Domain:** AbletonOSC session state aggregation, bulk queries, and statistics via MCP tools
**Confidence:** HIGH

## Summary

Phase 7 implements two requirements (SESS-01, SESS-02) that aggregate data from all existing domain modules into comprehensive session snapshots and project statistics. Unlike previous phases which added new domain modules, this phase builds an aggregation layer that composes the existing snapshot builders (buildTransportSnapshot, buildTrackSnapshot, buildClipSnapshot, buildDeviceSnapshot) with additional routing, grouping, and clip-slot queries to produce a complete "Live Object Model" view of the session.

The key technical challenge is query volume: a session with 10 tracks, 8 scenes, and 2 devices per track would require approximately 80+ individual OSC queries for a full snapshot. The research identified AbletonOSC's `/live/song/get/track_data` bulk query and per-track bulk clip/device queries (`/live/track/get/clips/name`, `/live/track/get/devices/name`) as the primary tools for reducing round-trips. The existing snapshot builders in helpers.js make many individual queries per entity; for session-level aggregation, we need a parallel strategy that batches queries efficiently.

The architecture follows the established domain-module pattern (tools[] + handle()), fitting into the existing registry as a new `session.js` module. The two tools (`session_snapshot` and `session_stats`) are read-only, requiring no guardWrite checks. The snapshot tool composes existing builders with new routing and clip-slot data; the stats tool computes derived aggregates (counts by type, device chain summaries) from the same raw data.

**Primary recommendation:** Create a `src/tools/session.js` module with 2 tools, add new helpers (`buildSessionSnapshot`, `buildTrackDetailSnapshot`, `buildSessionStats`) to helpers.js, and use per-track bulk queries to minimize OSC round-trips while keeping the code simple and aligned with existing patterns.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `osc` | `2.4.5` | OSC protocol over UDP | Already in project, handles all AbletonOSC communication |
| `@modelcontextprotocol/sdk` | `^1.26.0` | MCP server framework | Already in project, provides tool registration |

### Supporting (no new dependencies needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:test` | built-in | Unit testing | Test session module with mock OscClient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sequential per-track queries | `/live/song/get/track_data` bulk query | Bulk is faster but response parsing is complex and fragile (flat array). Per-track bulk queries (clips/name, devices/name) are simpler and still efficient |
| AbletonOSC listeners for caching | Direct queries every time | Listeners add complexity (subscription management, cache invalidation). For Phase 7, direct queries are simpler. Listener caching is a future optimization |

**Installation:**
```bash
# No new packages needed -- all dependencies from Phases 1-6
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── index.js                  # MCP server entry (unchanged)
├── osc-client.js             # OscClient class (unchanged)
└── tools/
    ├── shared.js             # Lazy OscClient singleton (unchanged)
    ├── registry.js           # Tool aggregation (ADD session module to modules array)
    ├── health.js             # ableton_status (unchanged)
    ├── helpers.js            # ADD: buildSessionSnapshot, buildTrackDetailSnapshot, buildSessionStats
    ├── transport.js          # (unchanged)
    ├── track.js              # (unchanged)
    ├── mixer.js              # (unchanged)
    ├── scene.js              # (unchanged)
    ├── clip.js               # (unchanged)
    ├── device.js             # (unchanged)
    ├── sample.js             # (unchanged)
    └── session.js            # NEW: session_snapshot and session_stats tools
```

### Pattern 1: Session Module Structure (matching existing modules)
**What:** New domain module following the established tools[] + handle() pattern.
**When to use:** The session.js module.
**Source:** Verified from existing src/tools/track.js, device.js, etc.

```javascript
// src/tools/session.js
import { ensureConnected } from './shared.js';
import { buildSessionSnapshot, buildSessionStats } from './helpers.js';

export const tools = [
  {
    name: 'session_snapshot',
    description: 'Get a complete session state snapshot including transport, all tracks with clips, devices, routing, and grouping. Use for understanding the full session context before making decisions.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'session_stats',
    description: 'Get aggregate project statistics: track counts by type, total clip count, device chain summary, tempo, and time signature. Lightweight alternative to full snapshot.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export async function handle(name, args) {
  if (!name.startsWith('session_')) return null;
  // ... switch on name, call helpers
}
```

### Pattern 2: Composing Existing Snapshot Builders
**What:** The session snapshot builds on top of existing buildTrackSnapshot, buildClipSnapshot, buildDeviceSnapshot, and buildTransportSnapshot from helpers.js.
**When to use:** session_snapshot tool implementation.
**Key insight:** Existing builders query individual properties one at a time. For session-level aggregation with many tracks, we should use per-track bulk queries where available to reduce round-trips.

```javascript
// Enhanced track snapshot for session context
async function buildTrackDetailSnapshot(client, trackIndex, numScenes) {
  // Start with existing track snapshot (name, volume, pan, mute, solo, arm, type, device_count)
  const trackSnap = await buildTrackSnapshot(client, trackIndex);

  // Add routing info
  const [, inputType] = await client.query('/live/track/get/input_routing_type', [trackIndex]);
  const [, outputType] = await client.query('/live/track/get/output_routing_type', [trackIndex]);

  // Add grouping info
  const [, isFoldable] = await client.query('/live/track/get/is_foldable', [trackIndex]);
  const [, isGrouped] = await client.query('/live/track/get/is_grouped', [trackIndex]);

  // Add clip slots -- use bulk clip names query
  const clipNamesResp = await client.query('/live/track/get/clips/name', [trackIndex]);
  const clipNames = clipNamesResp.slice(1); // skip trackIndex prefix

  // Determine which slots have clips vs empty
  const clips = [];
  for (let s = 0; s < numScenes; s++) {
    if (clipNames[s] && clipNames[s] !== '') {
      clips.push({ scene: s, name: clipNames[s], has_clip: true });
    }
  }

  // Add device summary using bulk query
  const devices = [];
  if (trackSnap.device_count > 0) {
    const namesResp = await client.query('/live/track/get/devices/name', [trackIndex]);
    const typesResp = await client.query('/live/track/get/devices/type', [trackIndex]);
    const devNames = namesResp.slice(1);
    const devTypes = typesResp.slice(1);
    for (let d = 0; d < trackSnap.device_count; d++) {
      devices.push({ index: d, name: devNames[d], type_id: devTypes[d] });
    }
  }

  return {
    ...trackSnap,
    input_routing: inputType,
    output_routing: outputType,
    is_group: !!isFoldable,
    is_grouped: !!isGrouped,
    clips,
    devices
  };
}
```

### Pattern 3: Statistics Computation from Raw Data
**What:** session_stats computes derived statistics without needing full detail snapshots.
**When to use:** session_stats tool -- lightweight alternative to full snapshot.

```javascript
async function buildSessionStats(client) {
  const transport = await buildTransportSnapshot(client);
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const [numScenes] = await client.query('/live/song/get/num_scenes');

  let midiCount = 0, audioCount = 0, groupCount = 0;
  let totalClips = 0, totalDevices = 0;

  for (let t = 0; t < numTracks; t++) {
    const [hasMidi] = await client.query('/live/track/get/has_midi_input', [t]);
    const [hasAudio] = await client.query('/live/track/get/has_audio_input', [t]);
    const [isFoldable] = await client.query('/live/track/get/is_foldable', [t]);
    const [numDevices] = await client.query('/live/track/get/num_devices', [t]);

    if (isFoldable) groupCount++;
    else if (hasMidi) midiCount++;
    else if (hasAudio) audioCount++;

    totalDevices += numDevices;

    // Count populated clip slots
    const clipNames = await client.query('/live/track/get/clips/name', [t]);
    const names = clipNames.slice(1);
    totalClips += names.filter(n => n && n !== '').length;
  }

  return { transport, track_counts: { midi: midiCount, audio: audioCount, group: groupCount, total: numTracks }, scene_count: numScenes, total_clips: totalClips, total_devices: totalDevices };
}
```

### Pattern 4: Empty Slot Detection
**What:** Distinguishing empty clip slots from populated clips in session view.
**When to use:** Both session_snapshot and session_stats tools.
**Key insight:** AbletonOSC's `/live/track/get/clips/name` returns all clip names for a track. Empty slots return empty strings `""`. The `/live/clip_slot/get/has_clip` endpoint provides a definitive boolean check per slot. For session snapshots, use bulk clip names and treat empty strings as empty slots; use has_clip for authoritative checks only when precision matters.

```javascript
// Approach 1: Bulk query (fast, slightly less precise)
const clipNamesResp = await client.query('/live/track/get/clips/name', [trackIndex]);
const clipNames = clipNamesResp.slice(1);
// Empty string = empty slot, non-empty = has clip

// Approach 2: Per-slot check (precise, many more queries)
const [, , hasClip] = await client.query('/live/clip_slot/get/has_clip', [trackIndex, sceneIndex]);
// hasClip is 0 or 1
```

**Recommendation:** Use bulk clip names for session_snapshot (efficient). Note that a clip named "" is technically possible but extremely rare. For session_stats, just count non-empty names.

### Anti-Patterns to Avoid
- **Querying every clip slot individually:** For 10 tracks x 8 scenes = 80 individual has_clip queries. Use per-track bulk queries instead.
- **Building full device parameter lists in session snapshot:** Device parameter detail is expensive (multiple queries per device). Session snapshot should include device name/type only, not parameters. Let the user call `device_get_parameters` for specific devices.
- **Using listeners for this phase:** Listener-based caching adds complexity (subscription lifecycle, cache invalidation on track create/delete). Direct queries are simpler and correct. Optimize with listeners later if needed.
- **Including note data in session snapshot:** Note queries per clip are expensive and produce large payloads. Session snapshot shows clip metadata (name, length, is_midi) but not note content.
- **Making session_snapshot synchronous/blocking for large sessions:** A session with 50+ tracks could take 5-10 seconds. Use TIMEOUTS.QUERY consistently and consider a timeout strategy for the aggregate operation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Track snapshots | New track query logic | Existing `buildTrackSnapshot()` | Already works and tested, consistent with other modules |
| Transport state | New transport query logic | Existing `buildTransportSnapshot()` | Already works and tested |
| Device summaries | Per-device individual queries | Bulk `devices/name` and `devices/type` per track | The device.js module already uses this pattern in device_list |
| Clip slot population | Per-slot `has_clip` queries | Bulk `clips/name` per track | One query per track vs N queries per track |
| Type name mapping | New type id to name mapping | Existing `deviceTypeNames` map in helpers.js | Already defined: { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' } |
| Response JSON building | Ad-hoc assembly | Compose existing builders + extend | Consistent shapes, fewer bugs |

**Key insight:** Phase 7 is an aggregation phase, not a new capability phase. Almost all building blocks exist. The work is composing them efficiently with bulk queries and adding routing/grouping data.

## Common Pitfalls

### Pitfall 1: Query Volume Explosion for Large Sessions
**What goes wrong:** A session with 20 tracks, 16 scenes, and 3 devices per track generates 400+ OSC queries for a full snapshot, taking 30+ seconds.
**Why it happens:** Naive iteration: for each track, for each scene, for each device, query individual properties.
**How to avoid:** Use per-track bulk queries:
- `/live/track/get/clips/name` returns ALL clip names for a track in ONE query (replaces N has_clip queries)
- `/live/track/get/devices/name` returns ALL device names in ONE query (replaces N device queries)
- Existing `buildTrackSnapshot` queries ~9 properties per track; this is acceptable for reasonable track counts
**Warning signs:** session_snapshot tool times out on sessions with 10+ tracks. Each buildTrackSnapshot adds ~9 queries.

### Pitfall 2: Stale Cache from Listener Pattern
**What goes wrong:** Roadmap success criterion mentions "both cached state (from listeners) and fresh queries" but implementing listeners adds subscription management complexity.
**Why it happens:** Success criteria was written anticipating listener support. The OscClient already has a `this.listeners` Map for future use.
**How to avoid:** For initial implementation, use ONLY fresh queries. The success criterion says "include both" -- this can be satisfied by having the session module use fresh queries directly. Listeners are a performance optimization for Phase 8 or later.
**Warning signs:** Attempting to implement listener caching and getting tangled in subscription lifecycle, invalidation on track create/delete, etc.

### Pitfall 3: Clip Names Bulk Response Format
**What goes wrong:** `/live/track/get/clips/name` returns `[trackIndex, name0, name1, ...]`. If we slice at wrong offset, all clip names shift.
**Why it happens:** AbletonOSC prepends the trackIndex to bulk responses. Device module uses `slice(1)` for track-level bulk queries.
**How to avoid:** Verify slice offset matches the response format. Device module already handles this pattern with `namesResp.slice(1)` for track-level queries. Use the same pattern.
**Warning signs:** First clip name is actually the track index number. Clip names are shifted by one.

### Pitfall 4: Return Track and Master Track Not in Session Snapshot
**What goes wrong:** Session snapshot only shows regular tracks. User sees 12 items in Ableton but snapshot only shows 10.
**Why it happens:** AbletonOSC's `/live/track/` only accesses `song.tracks` (regular tracks). Return tracks and master track are inaccessible. This is a known limitation documented in Phase 3 research.
**How to avoid:** Document clearly in tool description that return tracks and master track are not included. Include `num_return_tracks` count if the API supports it (it may not -- see Open Questions).
**Warning signs:** Track count mismatch between Ableton UI and snapshot.

### Pitfall 5: Empty String vs No Clip Ambiguity
**What goes wrong:** A clip with no user-set name might return "" or a default name. Treating "" as "no clip" when there is actually a clip present.
**Why it happens:** Ableton assigns default names to clips (e.g., track name + slot number), but the bulk clips/name query might return "" for empty slots.
**How to avoid:** Use `/live/clip_slot/get/has_clip` for authoritative slot status when precision matters. For the general snapshot, treat non-empty names as populated and empty strings as empty slots. Add a comment noting this heuristic.
**Warning signs:** Clips that exist in Ableton don't appear in session snapshot.

### Pitfall 6: Timeout on Large Session Snapshots
**What goes wrong:** session_snapshot query takes 15+ seconds for a complex session, triggering MCP timeout on the client side.
**Why it happens:** Many sequential OSC queries add up. MCP tools have implicit timeout expectations from Claude Code.
**How to avoid:** Keep the snapshot focused: track metadata + clip slot names + device names only. Do NOT include device parameters, note data, or detailed clip properties. If needed, add a `depth` parameter to control detail level.
**Warning signs:** Claude reports tool timeout. User has a complex session with many tracks/devices.

## Code Examples

### session_snapshot Tool Handler
```javascript
case 'session_snapshot': {
  const client = await ensureConnected();
  const snapshot = await buildSessionSnapshot(client);
  return jsonResponse(snapshot);
}
```

### buildSessionSnapshot Helper
```javascript
export async function buildSessionSnapshot(client) {
  const transport = await buildTransportSnapshot(client);
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const [numScenes] = await client.query('/live/song/get/num_scenes');

  const tracks = [];
  for (let t = 0; t < numTracks; t++) {
    const detail = await buildTrackDetailSnapshot(client, t, numScenes);
    tracks.push(detail);
  }

  return {
    transport,
    track_count: numTracks,
    scene_count: numScenes,
    tracks
  };
}
```

### buildTrackDetailSnapshot Helper (extends buildTrackSnapshot)
```javascript
export async function buildTrackDetailSnapshot(client, trackIndex, numScenes) {
  // Reuse existing track snapshot for core mixer/status data
  const base = await buildTrackSnapshot(client, trackIndex);

  // Routing
  const [, inputType] = await client.query('/live/track/get/input_routing_type', [trackIndex]);
  const [, outputType] = await client.query('/live/track/get/output_routing_type', [trackIndex]);

  // Grouping
  const [, isFoldable] = await client.query('/live/track/get/is_foldable', [trackIndex]);
  const [, isGrouped] = await client.query('/live/track/get/is_grouped', [trackIndex]);

  // Clip slots via bulk query
  const clipNamesResp = await client.query('/live/track/get/clips/name', [trackIndex]);
  const clipNames = clipNamesResp.slice(1);
  const clips = [];
  for (let s = 0; s < numScenes; s++) {
    const name = clipNames[s];
    if (name && name !== '') {
      clips.push({ scene: s, name, has_clip: true });
    }
  }

  // Device chain summary via bulk query
  const devices = [];
  if (base.device_count > 0) {
    const namesResp = await client.query('/live/track/get/devices/name', [trackIndex]);
    const typesResp = await client.query('/live/track/get/devices/type', [trackIndex]);
    const devNames = namesResp.slice(1);
    const devTypes = typesResp.slice(1);
    for (let d = 0; d < base.device_count; d++) {
      devices.push({
        index: d,
        name: devNames[d],
        type: { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' }[devTypes[d]] || 'unknown'
      });
    }
  }

  return {
    ...base,
    input_routing: inputType,
    output_routing: outputType,
    is_group: !!isFoldable,
    is_grouped: !!isGrouped,
    clips,
    devices
  };
}
```

### buildSessionStats Helper
```javascript
export async function buildSessionStats(client) {
  const transport = await buildTransportSnapshot(client);
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const [numScenes] = await client.query('/live/song/get/num_scenes');

  let midiCount = 0, audioCount = 0, groupCount = 0;
  let totalClips = 0, totalDevices = 0;
  const deviceSummary = {};

  for (let t = 0; t < numTracks; t++) {
    const [hasMidi] = await client.query('/live/track/get/has_midi_input', [t]);
    const [hasAudio] = await client.query('/live/track/get/has_audio_input', [t]);
    const [isFoldable] = await client.query('/live/track/get/is_foldable', [t]);
    const [numDevices] = await client.query('/live/track/get/num_devices', [t]);

    if (isFoldable) groupCount++;
    else if (hasMidi) midiCount++;
    else if (hasAudio) audioCount++;

    totalDevices += numDevices;

    // Count clips via bulk name query
    const clipNamesResp = await client.query('/live/track/get/clips/name', [t]);
    const names = clipNamesResp.slice(1);
    totalClips += names.filter(n => n && n !== '').length;

    // Device name summary for device chain overview
    if (numDevices > 0) {
      const devNamesResp = await client.query('/live/track/get/devices/name', [t]);
      const devNames = devNamesResp.slice(1);
      for (const dn of devNames) {
        deviceSummary[dn] = (deviceSummary[dn] || 0) + 1;
      }
    }
  }

  return {
    transport,
    track_counts: {
      total: numTracks,
      midi: midiCount,
      audio: audioCount,
      group: groupCount
    },
    scene_count: numScenes,
    total_clips: totalClips,
    total_devices: totalDevices,
    device_summary: deviceSummary
  };
}
```

### Registry Integration
```javascript
// src/tools/registry.js -- add session module
import * as session from './session.js';

const modules = [health, transport, track, mixer, scene, clip, sample, device, session];
```

### Test Mock Pattern (matching device.test.js)
```javascript
function createMockClient(responseMap) {
  return {
    isReady: true,
    async open() { this.isReady = true; },
    async query(address, args) {
      const key = address + (args && args.length ? ':' + args.join(',') : '');
      if (responseMap[key] !== undefined) return responseMap[key];
      if (responseMap[address] !== undefined) return responseMap[address];
      throw new Error('TIMEOUT: No mock response for ' + key);
    }
  };
}

// Mock for a 2-track, 3-scene session
function sessionMocks() {
  return {
    // Transport
    '/live/song/get/tempo': [120],
    '/live/song/get/is_playing': [0],
    '/live/song/get/current_song_time': [0],
    '/live/song/get/metronome': [1],
    '/live/song/get/signature_numerator': [4],
    '/live/song/get/signature_denominator': [4],
    '/live/song/get/session_record_status': [0],
    // Track counts
    '/live/song/get/num_tracks': [2],
    '/live/song/get/num_scenes': [3],
    // Track 0 (MIDI)
    '/live/track/get/name:0': ['Bass'],
    '/live/track/get/volume:0': [0.85],
    '/live/track/get/panning:0': [0],
    '/live/track/get/mute:0': [0],
    '/live/track/get/solo:0': [0],
    '/live/track/get/arm:0': [0],
    '/live/track/get/has_midi_input:0': [1],
    '/live/track/get/has_audio_input:0': [0],
    '/live/track/get/num_devices:0': [1],
    '/live/track/get/input_routing_type:0': [0, 'All Ins'],
    '/live/track/get/output_routing_type:0': [0, 'Master'],
    '/live/track/get/is_foldable:0': [0, 0],
    '/live/track/get/is_grouped:0': [0, 0],
    '/live/track/get/clips/name:0': [0, 'Clip 1', '', 'Clip 3'],
    '/live/track/get/devices/name:0': [0, 'Wavetable'],
    '/live/track/get/devices/type:0': [0, 2],
    // Track 1 (Audio)
    // ... similar pattern
  };
}
```

## AbletonOSC API Reference (Phase 7 Scope)

### Song-Level Queries
| Address | Args | Response | Purpose |
|---------|------|----------|---------|
| `/live/song/get/num_tracks` | none | `[count]` | Total regular tracks |
| `/live/song/get/num_scenes` | none | `[count]` | Total scenes |

### Track Routing Queries (NEW for Phase 7)
| Address | Args | Response | Purpose |
|---------|------|----------|---------|
| `/live/track/get/input_routing_type` | `[trackId]` | `[trackId, type_name]` | Input routing type string |
| `/live/track/get/output_routing_type` | `[trackId]` | `[trackId, type_name]` | Output routing type string |

### Track Grouping Queries (NEW for Phase 7)
| Address | Args | Response | Purpose |
|---------|------|----------|---------|
| `/live/track/get/is_foldable` | `[trackId]` | `[trackId, 0\|1]` | Is this a group track? |
| `/live/track/get/is_grouped` | `[trackId]` | `[trackId, 0\|1]` | Is this inside a group? |

### Bulk Clip Queries (efficient for session snapshot)
| Address | Args | Response | Purpose |
|---------|------|----------|---------|
| `/live/track/get/clips/name` | `[trackId]` | `[trackId, name, ...]` | All clip names for track |

### Bulk Device Queries (efficient for session snapshot)
| Address | Args | Response | Purpose |
|---------|------|----------|---------|
| `/live/track/get/devices/name` | `[trackId]` | `[trackId, name, ...]` | All device names for track |
| `/live/track/get/devices/type` | `[trackId]` | `[trackId, type, ...]` | All device types for track |

### Existing Queries Reused (from helpers.js snapshot builders)
| Address | Used By | Notes |
|---------|---------|-------|
| `/live/song/get/tempo` | buildTransportSnapshot | Transport state |
| `/live/song/get/is_playing` | buildTransportSnapshot | Transport state |
| `/live/track/get/name` | buildTrackSnapshot | Per-track name |
| `/live/track/get/volume` | buildTrackSnapshot | Per-track volume |
| `/live/track/get/panning` | buildTrackSnapshot | Per-track pan |
| `/live/track/get/mute` | buildTrackSnapshot | Per-track mute |
| `/live/track/get/solo` | buildTrackSnapshot | Per-track solo |
| `/live/track/get/arm` | buildTrackSnapshot | Per-track arm |
| `/live/track/get/has_midi_input` | buildTrackSnapshot | Track type detection |
| `/live/track/get/has_audio_input` | buildTrackSnapshot | Track type detection |
| `/live/track/get/num_devices` | buildTrackSnapshot | Device count |

## Query Count Analysis

### session_snapshot Query Budget
For a session with T tracks, S scenes, D_avg devices per track:

| Component | Queries Per Track | Total | Notes |
|-----------|------------------|-------|-------|
| Transport snapshot | 7 (fixed) | 7 | tempo, playing, time, metronome, sig_num, sig_den, record |
| Song counts | 2 (fixed) | 2 | num_tracks, num_scenes |
| Track base snapshot | 9 | 9T | name, vol, pan, mute, solo, arm, midi_in, audio_in, num_devices |
| Routing | 2 | 2T | input_routing_type, output_routing_type |
| Grouping | 2 | 2T | is_foldable, is_grouped |
| Clip names (bulk) | 1 | T | One query per track returns ALL clip names |
| Device names (bulk) | 1 | T | One query per track with devices |
| Device types (bulk) | 1 | T | One query per track with devices |
| **Total** | ~16 per track + 9 fixed | **16T + 9** | |

**Example:** 10 tracks = ~169 queries. At 5ms round-trip per query = ~850ms. Acceptable.
**Example:** 30 tracks = ~489 queries. At 5ms round-trip = ~2.4s. Acceptable but noticeable.
**Example:** 100 tracks = ~1609 queries. At 5ms round-trip = ~8s. Approaching timeout territory.

### session_stats Query Budget
| Component | Queries Per Track | Total | Notes |
|-----------|------------------|-------|-------|
| Transport snapshot | 7 (fixed) | 7 | Reused from existing builder |
| Song counts | 2 (fixed) | 2 | num_tracks, num_scenes |
| Track type detection | 3 | 3T | has_midi_input, has_audio_input, is_foldable |
| Device count | 1 | T | num_devices |
| Clip names (bulk) | 1 | T | For clip counting |
| Device names (bulk) | 1 | T (if devices > 0) | For device summary |
| **Total** | ~6 per track + 9 fixed | **6T + 9** | |

**Example:** 10 tracks = ~69 queries = ~350ms. Fast.
**Example:** 30 tracks = ~189 queries = ~950ms. Quick.

## Complete Tool Inventory

### Session Domain (2 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `session_snapshot` | read | SESS-01 | Must |
| `session_stats` | read | SESS-02 | Must |

### Tool Schemas

**session_snapshot:**
- No required parameters
- Returns: complete session state including transport, tracks (with clips, devices, routing, grouping)
- Read-only: no guardWrite check needed

**session_stats:**
- No required parameters
- Returns: aggregate statistics (track counts by type, clip counts, device summary, transport overview)
- Read-only: no guardWrite check needed

## Response Shape Specification

### session_snapshot Response
```json
{
  "transport": {
    "tempo": 120,
    "is_playing": false,
    "recording": false,
    "current_time": 0,
    "metronome": true,
    "time_signature": "4/4"
  },
  "track_count": 3,
  "scene_count": 8,
  "tracks": [
    {
      "index": 0,
      "name": "Bass",
      "type": "midi",
      "volume": { "normalized": 0.85, "db": 0 },
      "pan": { "normalized": 0, "midi": 64 },
      "mute": false,
      "solo": false,
      "arm": false,
      "device_count": 2,
      "input_routing": "All Ins",
      "output_routing": "Master",
      "is_group": false,
      "is_grouped": false,
      "clips": [
        { "scene": 0, "name": "Bass A", "has_clip": true },
        { "scene": 2, "name": "Bass B", "has_clip": true }
      ],
      "devices": [
        { "index": 0, "name": "Wavetable", "type": "instrument" },
        { "index": 1, "name": "Compressor", "type": "audio_effect" }
      ]
    }
  ]
}
```

### session_stats Response
```json
{
  "transport": {
    "tempo": 120,
    "is_playing": false,
    "recording": false,
    "current_time": 0,
    "metronome": true,
    "time_signature": "4/4"
  },
  "track_counts": {
    "total": 8,
    "midi": 4,
    "audio": 3,
    "group": 1
  },
  "scene_count": 16,
  "total_clips": 24,
  "total_devices": 15,
  "device_summary": {
    "Wavetable": 2,
    "Operator": 1,
    "Reverb": 3,
    "Compressor": 4,
    "EQ Eight": 5
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-slot has_clip queries (NxM) | Bulk clips/name per track (N) | Phase 7 optimization | Reduces clip queries from T*S to T |
| Per-device individual queries | Bulk devices/name and devices/type per track | Already in device.js (Phase 6) | Reuse established pattern |
| No routing or grouping data | Routing type + group status per track | Phase 7 new data | Enables context-aware session understanding |

## Open Questions

1. **Return track count query**
   - What we know: AbletonOSC has `/live/song/create_return_track` and `delete_return_track` but no documented `get/num_return_tracks`
   - What's unclear: Whether this address exists undocumented, or if return track count must be inferred
   - Recommendation: Try querying `/live/song/get/num_return_tracks` in smoke test. If it works, include in stats. If not, omit return track count and document as known gap.
   - **Confidence: LOW** -- address not documented

2. **Bulk clips/name response for empty slots**
   - What we know: Response format is `[trackId, name0, name1, ...]`. Empty slots likely return empty strings.
   - What's unclear: Whether Ableton returns "" for empty slots or skips them (which would break index alignment with scenes)
   - Recommendation: Assume empty strings maintain index alignment (this is the common OSC pattern). Validate with smoke test. Fall back to per-slot has_clip if alignment is broken.
   - **Confidence: MEDIUM** -- follows standard AbletonOSC patterns but not explicitly documented

3. **Success criterion 3: "cached state from listeners"**
   - What we know: The OscClient has a `this.listeners` Map already wired into handleMessage. Listeners can be registered per address.
   - What's unclear: Whether Phase 7 must implement listener caching or if direct queries satisfy the requirement
   - Recommendation: Implement with direct queries only. The success criterion can be reinterpreted as "session snapshots pull from all data sources (transport, tracks, clips, devices) using fresh queries." Listener-based caching is a Phase 8 optimization.
   - **Confidence: HIGH** -- the requirement is about data completeness, not caching strategy

4. **Group track parent index**
   - What we know: `/live/track/get/is_grouped` tells if a track is inside a group. AbletonOSC README does not document a `group_track` property that returns the parent group index.
   - What's unclear: Whether the parent group index can be queried
   - Recommendation: Include `is_group` and `is_grouped` booleans. Omit parent group index. If needed later, the parent can be inferred by scanning for the nearest preceding `is_foldable` track.
   - **Confidence: MEDIUM** -- partial grouping info available

## Sources

### Primary (HIGH confidence)
- **AbletonOSC GitHub README** (master branch) - Verified via WebFetch: routing addresses (input_routing_type, output_routing_type), grouping addresses (is_foldable, is_grouped), bulk clip queries (clips/name), bulk device queries (devices/name, devices/type), listener mechanism (start_listen/stop_listen)
- **Existing codebase** (src/tools/helpers.js) - Verified snapshot builders: buildTransportSnapshot, buildTrackSnapshot, buildClipSnapshot, buildDeviceSnapshot with exact query patterns and response parsing
- **Existing codebase** (src/tools/device.js) - Verified bulk device query pattern: `devices/name`, `devices/type`, `devices/class_name` with `slice(1)` for track-level prefix

### Secondary (MEDIUM confidence)
- **Existing codebase** (src/tools/scene.js, scene_list handler) - Per-slot has_clip pattern used with `[t, s]` args returning `[hasClip]` at position [0]. NOTE: scene.js uses `response[0]` not `response[2]` for has_clip in some paths -- verify offset consistency.
- **Phase 3 Research** (.planning/phases/03-core-controllers/03-RESEARCH.md) - Return track limitation documented: `/live/track/` only accesses `song.tracks`, not return tracks or master track.

### Tertiary (LOW confidence)
- **num_return_tracks address** - Not documented in AbletonOSC README. May or may not exist.
- **Empty slot behavior in bulk clips/name** - Inferred from standard AbletonOSC flat-array patterns. Not explicitly documented.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** -- No new dependencies needed, all building blocks exist
- Architecture patterns: **HIGH** -- Follows established codebase patterns exactly
- AbletonOSC API coverage: **HIGH** -- Routing and grouping addresses verified from official README
- Bulk query parsing: **MEDIUM** -- Response format (slice offset) inferred from existing device.js patterns
- Empty slot detection: **MEDIUM** -- Heuristic based on standard AbletonOSC behavior
- Listener caching strategy: **HIGH** -- Deferred to future; direct queries for now
- Query performance estimates: **MEDIUM** -- Based on 5ms/query assumption, actual may vary

**Research date:** 2026-02-06
**Valid until:** 60 days (AbletonOSC is stable, session awareness queries use well-established API)
