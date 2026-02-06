# Phase 3: Core Controllers - Research

**Researched:** 2026-02-05
**Domain:** AbletonOSC API for transport, track, mixer, and scene control via MCP tools
**Confidence:** HIGH

## Summary

This phase implements 19 requirements across four domains (transport, tracks, mixer, scenes/clips) as MCP tools that call AbletonOSC via the Phase 1 OscClient and plug into the Phase 2 domain-module registry. The research mapped every required operation to specific AbletonOSC OSC addresses, identified value conversion requirements (dB/normalized volume, pan range translation), documented the critical gap in return track and master track support, and established the domain-module structure that follows the existing health.js pattern.

AbletonOSC provides comprehensive coverage for regular tracks -- all transport, track CRUD, mixer, scene, and clip operations have direct OSC address mappings. However, return tracks and master track are NOT accessible through the standard `/live/track/` addresses (they use `self.song.tracks` which excludes return/master in Ableton's LOM). This means TRCK-01 ("list all tracks including return, master") requires a workaround -- either querying track properties to detect type, or accepting that return/master track control is limited in AbletonOSC v0.x.

The established codebase pattern from Phases 1-2 is clear: each domain module exports `tools[]` and `handle(name, args)`, the registry aggregates them, and the OscClient is accessed via `ensureConnected()` from shared.js. This research documents the exact OSC addresses, argument types, and response formats needed for each tool, plus the value conversion logic the server must implement.

**Primary recommendation:** Build four domain modules (transport.js, track.js, mixer.js, scene.js) following the existing health.js pattern, with a shared helpers module for value conversion (volume dB<->normalized, pan 0-127<->float, track name resolution). Include a utility module for read-only mode gating, two-step delete state, and batch command execution.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Domain prefix naming convention: `transport_play`, `track_create`, `mixer_set_volume`, `scene_launch`
- Read and write operations are SEPARATE tools: `transport_get_tempo()` vs `transport_set_tempo()`
- Include a `batch_commands` tool for multi-step operations in a single call
- Volume accepts BOTH dB scale (-inf to +6) and normalized float (0.0-1.0) -- server converts
- Pan uses 0-127 MIDI convention (64 = center)
- Track references accept EITHER index (0-based) OR name string -- server resolves
- Tempo accepts absolute BPM and relative changes ('+5', '-10', 'double', 'half')
- Write operations return FULL track/transport snapshot after change
- Read operations return full state per item: name, type, index, volume, pan, mute, solo, arm, sends, device count
- Track deletion uses two-step confirmation: first call returns track contents, second call with confirm=true deletes
- Read-only mode toggle available -- prevents all write operations
- Undo tool included -- triggers Ableton's undo

### Claude's Discretion
- Tool grouping strategy (atomic vs domain-grouped) -- pick what works best for MCP tool discovery
- Whether transport state is included in every response or only transport tool responses
- Response format (structured JSON vs human-readable text)
- Recording-stop behavior (whether to warn or just stop)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `osc` | `2.4.5` | OSC protocol over UDP | Already in project, handles all AbletonOSC communication |
| `@modelcontextprotocol/sdk` | `^1.26.0` | MCP server framework | Already in project, provides tool registration |

### Supporting (no new dependencies needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:test` | built-in | Unit testing | Test each domain module in isolation with mock OscClient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom dB conversion | npm `decibels` package | Unnecessary -- formula is 2 lines, no dependency needed |
| JSON schema validation (zod) | Manual validation | zod available as peer dep of MCP SDK, but manual validation is simpler for the few input schemas here |

**Installation:**
```bash
# No new packages needed -- all dependencies from Phases 1-2
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── index.js                  # MCP server entry (Phase 2, unchanged)
├── osc-client.js             # OscClient class (Phase 1, unchanged)
└── tools/
    ├── shared.js             # Lazy OscClient singleton (Phase 2, unchanged)
    ├── registry.js           # Tool aggregation (Phase 2, add new modules to array)
    ├── health.js             # ableton_status tool (Phase 2, unchanged)
    ├── helpers.js            # NEW: Value conversion, track resolution, response builders
    ├── transport.js          # NEW: Transport domain tools
    ├── track.js              # NEW: Track management tools
    ├── mixer.js              # NEW: Mixer control tools
    └── scene.js              # NEW: Scene and clip tools
```

### Pattern 1: Domain Module Structure (matching health.js)
**What:** Each domain module exports `tools[]` array and `async handle(name, args)` function.
**When to use:** Every domain module.
**Source:** Verified from existing `src/tools/health.js`

```javascript
// src/tools/transport.js
import { ensureConnected } from './shared.js';
import { buildTransportSnapshot, parseTempoInput } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'transport_play',
    description: 'Start playback in Ableton Live. Resumes from current position.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ... more tool definitions
];

export async function handle(name, args) {
  if (!name.startsWith('transport_')) return null;

  const client = await ensureConnected();

  switch (name) {
    case 'transport_play':
      await client.query('/live/song/start_playing', [], TIMEOUTS.COMMAND);
      const snapshot = await buildTransportSnapshot(client);
      return {
        content: [{ type: 'text', text: JSON.stringify(snapshot) }]
      };

    // ... more cases

    default:
      return null;
  }
}
```

### Pattern 2: Value Conversion in helpers.js
**What:** Centralized functions for dB<->normalized volume, 0-127<->float pan, track name resolution, and tempo parsing.
**When to use:** Every tool that accepts or returns volume, pan, track references, or tempo.

```javascript
// src/tools/helpers.js

// Volume conversion: Ableton uses normalized 0.0-1.0 internally
// 0.0 = -inf dB (silence), 0.85 = 0 dB (unity), 1.0 = +6 dB (max)
export function dbToNormalized(db) {
  if (db <= -70) return 0.0; // treat as -inf
  if (db <= 0) return 0.85 * Math.pow(10, db / 20);
  // 0 to +6 dB maps linearly from 0.85 to 1.0
  return 0.85 + (db / 6) * 0.15;
}

export function normalizedToDb(value) {
  if (value < 1e-7) return -Infinity;
  if (value <= 0.85) return 20 * Math.log10(value / 0.85);
  // Above unity: linear mapping 0.85->0dB, 1.0->+6dB
  return ((value - 0.85) / 0.15) * 6;
}

// Volume input: accept either dB string ("-6dB", "+3dB") or normalized float
export function parseVolumeInput(input) {
  if (typeof input === 'string' && input.toLowerCase().endsWith('db')) {
    const db = parseFloat(input);
    return dbToNormalized(db);
  }
  return parseFloat(input); // already normalized 0.0-1.0
}

// Pan conversion: user sends 0-127 MIDI, Ableton uses -1.0 to 1.0
export function midiPanToFloat(midiValue) {
  return (midiValue - 64) / 64; // 0->-1.0, 64->0.0, 127->~0.984
}

export function floatPanToMidi(floatValue) {
  return Math.round(floatValue * 64 + 64); // -1.0->0, 0.0->64, 1.0->128->clamp 127
}

// Track resolution: accept index (number) or name (string)
export async function resolveTrackIndex(client, trackRef) {
  if (typeof trackRef === 'number') return trackRef;
  // Name lookup: query track names and find match
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const names = await client.query('/live/song/get/track_names', [0, numTracks]);
  // names response: [name0, name1, name2, ...]
  const index = names.indexOf(trackRef);
  if (index === -1) throw new Error(`TRACK_NOT_FOUND: No track named "${trackRef}"`);
  return index;
}

// Tempo parsing: absolute BPM or relative change
export function parseTempoInput(input, currentTempo) {
  if (typeof input === 'number') return input;
  const str = String(input).trim().toLowerCase();
  if (str === 'double') return currentTempo * 2;
  if (str === 'half') return currentTempo / 2;
  if (str.startsWith('+') || str.startsWith('-')) return currentTempo + parseFloat(str);
  return parseFloat(str);
}
```

### Pattern 3: Snapshot Response Builders
**What:** Functions that query multiple properties and assemble complete state snapshots for tool responses.
**When to use:** Every write operation must return a snapshot; read operations return per-item state.

```javascript
// Build full transport state snapshot
export async function buildTransportSnapshot(client) {
  const [tempo] = await client.query('/live/song/get/tempo');
  const [isPlaying] = await client.query('/live/song/get/is_playing');
  const [currentTime] = await client.query('/live/song/get/current_song_time');
  const [metronome] = await client.query('/live/song/get/metronome');
  const [sigNum] = await client.query('/live/song/get/signature_numerator');
  const [sigDen] = await client.query('/live/song/get/signature_denominator');

  return {
    tempo,
    is_playing: !!isPlaying,
    current_time: currentTime,
    metronome: !!metronome,
    time_signature: `${sigNum}/${sigDen}`
  };
}

// Build full track state snapshot
export async function buildTrackSnapshot(client, trackIndex) {
  const [, name] = await client.query('/live/track/get/name', [trackIndex]);
  const [, volume] = await client.query('/live/track/get/volume', [trackIndex]);
  const [, panning] = await client.query('/live/track/get/panning', [trackIndex]);
  const [, mute] = await client.query('/live/track/get/mute', [trackIndex]);
  const [, solo] = await client.query('/live/track/get/solo', [trackIndex]);
  const [, arm] = await client.query('/live/track/get/arm', [trackIndex]);
  const [, hasMidi] = await client.query('/live/track/get/has_midi_input', [trackIndex]);
  const [, hasAudio] = await client.query('/live/track/get/has_audio_input', [trackIndex]);
  const [, numDevices] = await client.query('/live/track/get/num_devices', [trackIndex]);

  return {
    index: trackIndex,
    name,
    type: hasMidi ? 'midi' : hasAudio ? 'audio' : 'unknown',
    volume: { normalized: volume, db: normalizedToDb(volume) },
    pan: { normalized: panning, midi: floatPanToMidi(panning) },
    mute: !!mute,
    solo: !!solo,
    arm: !!arm,
    device_count: numDevices
  };
}
```

### Pattern 4: Read-Only Mode Gating
**What:** Module-level flag that prevents write operations when active.
**When to use:** All write tool handlers check this before executing.

```javascript
// In helpers.js or a separate state.js
let readOnlyMode = false;

export function isReadOnly() { return readOnlyMode; }
export function setReadOnly(enabled) { readOnlyMode = enabled; }

export function guardWrite(toolName) {
  if (readOnlyMode) {
    return {
      content: [{ type: 'text', text: `READ_ONLY: Tool "${toolName}" blocked. Read-only mode is active. Use set_read_only(false) to disable.` }],
      isError: true
    };
  }
  return null;
}
```

### Pattern 5: Two-Step Delete Confirmation
**What:** Track delete requires two calls. First call returns track contents. Second call with confirm=true performs deletion.
**When to use:** `track_delete` tool.

```javascript
// Maintain pending deletes (track_index -> contents snapshot)
const pendingDeletes = new Map();

// First call: no confirm -> return warning with track contents
// Second call: confirm=true -> delete and clear pending
```

### Pattern 6: Batch Commands
**What:** A `batch_commands` tool that executes multiple tool calls sequentially in a single MCP round-trip.
**When to use:** When Claude needs to create multiple tracks, set multiple parameters, etc.

```javascript
{
  name: 'batch_commands',
  description: 'Execute multiple commands in sequence. Reduces round-trips for multi-step operations like creating several tracks.',
  inputSchema: {
    type: 'object',
    properties: {
      commands: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Tool name to call' },
            args: { type: 'object', description: 'Arguments for the tool' }
          },
          required: ['tool']
        }
      }
    },
    required: ['commands']
  }
}
```

### Anti-Patterns to Avoid
- **Querying return/master track properties by index without checking type:** AbletonOSC's `/live/track/` addresses use `song.tracks` which excludes return/master. Attempting to use return track indices here causes index-out-of-bounds or wrong track.
- **Sending volume in dB directly to OSC:** AbletonOSC expects the normalized 0.0-1.0 float for volume. dB must be converted server-side.
- **Assuming pan range:** The user's CONTEXT specifies 0-127 MIDI convention for the tool interface, but AbletonOSC internally uses a float range (likely -1.0 to 1.0). Must convert.
- **Fire-and-forget commands without confirmation:** Even "void" commands (play, stop) should query state afterward to confirm success and return snapshot.
- **Caching track lists across calls:** Track count changes when tracks are created/deleted. Always query fresh or invalidate on mutation.

## AbletonOSC API Reference (Phase 3 Scope)

### Transport Operations

| Requirement | Tool Name | OSC Send | OSC Args | Response Pattern |
|-------------|-----------|----------|----------|-----------------|
| TRNS-01 | `transport_play` | `/live/song/start_playing` | none | void, query snapshot |
| TRNS-01 | `transport_stop` | `/live/song/stop_playing` | none | void, query snapshot |
| TRNS-01 | `transport_continue` | `/live/song/continue_playing` | none | void, query snapshot |
| TRNS-02 | `transport_record` | `/live/song/trigger_session_record` | none | void, query snapshot |
| TRNS-02 | `transport_stop_record` | `/live/song/trigger_session_record` | none | toggle (call again to stop) |
| TRNS-03 | `transport_get_tempo` | `/live/song/get/tempo` | none | `[tempo_bpm]` float |
| TRNS-03 | `transport_set_tempo` | `/live/song/set/tempo` | `[bpm]` float | void, query back |
| TRNS-04 | `transport_get_position` | `/live/song/get/current_song_time` | none | `[beats]` float |
| TRNS-04 | `transport_set_position` | `/live/song/set/current_song_time` | `[beats]` float | void, query back |
| TRNS-05 | `transport_get_metronome` | `/live/song/get/metronome` | none | `[0\|1]` int |
| TRNS-05 | `transport_set_metronome` | `/live/song/set/metronome` | `[0\|1]` int | void, query back |
| TRNS-06 | `transport_get_song_name` | N/A | N/A | **NOT AVAILABLE in AbletonOSC** |
| TRNS-06 | `transport_save` | N/A | N/A | **NOT AVAILABLE in AbletonOSC** |

**TRNS-06 Gap:** AbletonOSC does not expose song name or save operations. The `/live/song/` API has no `get/name` or `save` endpoints. This requirement cannot be fully satisfied via OSC. Options: (1) mark as known limitation, (2) explore if song file path can be derived from elsewhere, (3) defer to Phase 7/8.

### Track Management Operations

| Requirement | Tool Name | OSC Send | OSC Args | Response Pattern |
|-------------|-----------|----------|----------|-----------------|
| TRCK-01 | `track_list` | `/live/song/get/num_tracks` + per-track queries | none | aggregate track snapshots |
| TRCK-02 | `track_create` | `/live/song/create_midi_track` or `create_audio_track` | `[index]` int (-1=end) | void, query new track |
| TRCK-02 | `track_delete` | `/live/song/delete_track` | `[track_index]` int | void (two-step with confirm) |
| TRCK-03 | `track_select` | `/live/view/set/selected_track` | `[track_index]` int | void, query back |
| TRCK-04 | `track_set_arm` | `/live/track/set/arm` | `[track_id, 0\|1]` | void, query snapshot |
| TRCK-04 | `track_get_arm` | `/live/track/get/arm` | `[track_id]` | `[track_id, armed]` |
| TRCK-05 | `track_rename` | `/live/track/set/name` | `[track_id, name]` | void, query snapshot |

**Track Type Detection:** AbletonOSC provides `has_midi_input`, `has_audio_input`, `has_midi_output`, `has_audio_output` per track. To determine type:
- MIDI track: `has_midi_input=1`
- Audio track: `has_audio_input=1`
- Type is inferred, not explicitly stored

**Return Tracks Gap:** AbletonOSC's `/live/track/` addresses only access `song.tracks` (regular tracks). Return tracks (`song.return_tracks`) and master track (`song.master_track`) are NOT accessible through the standard track API. The `create_return_track` and `delete_return_track` song methods exist, but querying/controlling return track properties (volume, pan, send) is NOT supported. This is a KNOWN LIMITATION of AbletonOSC with open issues (#47, #84). For Phase 3, track_list will document what types of tracks are listed and note that return/master control is limited.

**Bulk Track Query:** `/live/song/get/track_data [start_track] [end_track] [properties...]` can retrieve multiple properties for multiple tracks in a single call. Properties use format `track.property_name`. This is useful for `track_list` to avoid N separate queries per track.

### Mixer Operations

| Requirement | Tool Name | OSC Send | OSC Args | Response Pattern |
|-------------|-----------|----------|----------|-----------------|
| MIX-01 | `mixer_get_volume` | `/live/track/get/volume` | `[track_id]` | `[track_id, volume]` float |
| MIX-01 | `mixer_set_volume` | `/live/track/set/volume` | `[track_id, volume]` float | void, query snapshot |
| MIX-02 | `mixer_get_pan` | `/live/track/get/panning` | `[track_id]` | `[track_id, panning]` float |
| MIX-02 | `mixer_set_pan` | `/live/track/set/panning` | `[track_id, panning]` float | void, query snapshot |
| MIX-03 | `mixer_set_mute` | `/live/track/set/mute` | `[track_id, 0\|1]` | void, query snapshot |
| MIX-03 | `mixer_set_solo` | `/live/track/set/solo` | `[track_id, 0\|1]` | void, query snapshot |
| MIX-04 | `mixer_get_send` | `/live/track/get/send` | `[track_id, send_id]` | `[track_id, send_id, value]` |
| MIX-04 | `mixer_set_send` | `/live/track/set/send` | `[track_id, send_id, value]` float | void, query snapshot |

**Volume Value Mapping (CRITICAL):**
- AbletonOSC `volume` is a normalized float: 0.0 to 1.0
- 0.0 = silence (-inf dB)
- 0.85 = unity gain (0 dB) -- this is the fader default position
- 1.0 = maximum (+6 dB)
- Conversion from dB: below 0 dB uses `0.85 * 10^(dB/20)`, above 0 dB uses linear `0.85 + (dB/6)*0.15`
- Conversion to dB: below 0.85 uses `20 * log10(value/0.85)`, above 0.85 uses `((value-0.85)/0.15)*6`
- **Confidence: MEDIUM** -- the 0.85 unity point comes from ahujasid/ableton-mcp PR #26 code review, not official Ableton docs. Must verify empirically.

**Pan Value Mapping:**
- AbletonOSC `panning` is a float (range needs verification, likely -1.0 to 1.0)
- User interface uses 0-127 MIDI convention (64 = center)
- Conversion: `midi_to_float = (midi - 64) / 64`, `float_to_midi = round(float * 64 + 64)`
- **Confidence: MEDIUM** -- pan float range not explicitly documented. Must verify empirically.

**Send Indexing:**
- Send ID is 0-based integer corresponding to return track order
- Send 0 = first return track (Send A), Send 1 = second return track (Send B), etc.

### Scene & Clip Operations

| Requirement | Tool Name | OSC Send | OSC Args | Response Pattern |
|-------------|-----------|----------|----------|-----------------|
| CLIP-01 | `scene_list` | `/live/song/get/num_scenes` + per-scene queries | none | aggregate scene data |
| CLIP-01 | `scene_get_clips` | `/live/clip_slot/get/has_clip` per slot | `[track, scene]` | `[track, scene, 0\|1]` |
| CLIP-02 | `scene_launch` | `/live/scene/fire` | `[scene_id]` | void |
| CLIP-02 | `scene_stop` | `/live/song/stop_all_clips` | none | void |
| CLIP-03 | `clip_launch` | `/live/clip/fire` | `[track_id, clip_id]` | void |
| CLIP-03 | `clip_stop` | `/live/clip/stop` | `[track_id, clip_id]` | void |
| CLIP-04 | `scene_create` | `/live/song/create_scene` | `[index]` int (-1=end) | void |
| CLIP-04 | `scene_rename` | `/live/scene/set/name` | `[scene_id, name]` | void |

**Scene Properties Available:**
- name, color, color_index, is_empty, is_triggered
- tempo (per-scene tempo), tempo_enabled
- time_signature_numerator, time_signature_denominator, time_signature_enabled

**Clip Status Query:** To list clips in session view, query `/live/clip_slot/get/has_clip` for each [track, scene] combination. For populated slots, can query clip properties like name, length, is_playing, is_midi_clip, is_audio_clip.

### Utility Operations

| Feature | Tool Name | OSC Send | Notes |
|---------|-----------|----------|-------|
| Undo | `undo` | `/live/song/undo` | Triggers Ableton's undo |
| Redo | `redo` | `/live/song/redo` | Triggers Ableton's redo |
| Read-only toggle | `set_read_only` | N/A (server-side flag) | No OSC needed |
| Batch commands | `batch_commands` | Multiple | Executes tool sequence |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Volume dB conversion | Ad-hoc conversion in each tool | Centralized `helpers.js` functions | One formula, many callsites -- single source of truth |
| Track name->index lookup | Inline name search in each tool | `resolveTrackIndex()` helper | Name lookup requires 2 OSC queries; reuse avoids duplication |
| Response building | Manual JSON assembly per tool | `buildTrackSnapshot()`, `buildTransportSnapshot()` builders | Consistent response shapes, fewer bugs |
| Input validation | Per-tool checks | Shared validation functions for volume range, track existence, etc. | DRY validation |
| Tool routing | if/else chains per tool name | switch(name) with startsWith prefix check | Cleaner routing, matches domain boundaries |

**Key insight:** The value conversion layer (dB, pan, tempo parsing, track resolution) is the bulk of the complexity in this phase. The OSC calls themselves are simple. Centralizing conversions in helpers.js is critical.

## Common Pitfalls

### Pitfall 1: Volume Value Confusion
**What goes wrong:** Claude sends "-6dB" and the tool sends -6 as the normalized value to AbletonOSC, causing the track to be nearly silent (normalized -6 is meaningless, valid range is 0.0-1.0).
**Why it happens:** Mixing up the user-facing dB interface with the internal normalized float.
**How to avoid:** Always convert dB to normalized before calling OSC. Accept both formats, detect which was sent (string ending in "dB" vs number 0.0-1.0), convert accordingly.
**Warning signs:** Volume changes have unexpected results. -6dB should be approximately 0.425 normalized.

### Pitfall 2: Pan Range Mismatch
**What goes wrong:** Claude sends 64 (MIDI center) but it arrives at AbletonOSC as integer 64, causing extreme right pan.
**Why it happens:** AbletonOSC uses float range for panning (likely -1.0 to 1.0), not 0-127.
**How to avoid:** Always convert 0-127 to float before sending. 64 -> 0.0 (center).
**Warning signs:** Pan is always hard-right or hard-left despite sending center values.

### Pitfall 3: Snapshot Queries Race with State Changes
**What goes wrong:** Write operation completes, snapshot query starts, but Ableton hasn't fully updated yet, so snapshot returns stale data.
**Why it happens:** AbletonOSC commands are processed in Ableton's main thread. State may not be fully updated by the time a follow-up query arrives.
**How to avoid:** Use a small delay (10-50ms) between write and snapshot query if stale data is observed. Alternatively, accept that snapshots may be slightly behind.
**Warning signs:** Snapshot after set_volume returns old volume. Retry returns correct value.

### Pitfall 4: Return Track Index Collision
**What goes wrong:** User asks for "track 5" volume but AbletonOSC returns data for a different track because return tracks have different indexing.
**Why it happens:** AbletonOSC's `/live/track/` uses `song.tracks` indices (regular tracks only). If user expects return tracks to be indexed after regular tracks, the index space doesn't match.
**How to avoid:** Document clearly that track indices refer to regular tracks only. Return track support is limited in current AbletonOSC. Provide `can_be_armed` and `has_midi_input`/`has_audio_input` to help Claude identify track types.
**Warning signs:** Track operations affect wrong track. Track list counts don't match what user sees in Ableton.

### Pitfall 5: track_data Response Parsing Complexity
**What goes wrong:** The `/live/song/get/track_data` bulk response is a flat array of values that must be carefully unpacked based on the number of tracks and properties requested.
**Why it happens:** OSC doesn't support nested data structures. All values come back in a flat array.
**How to avoid:** Carefully compute expected values per track based on properties requested. Consider using individual queries for simplicity and correctness, only using track_data when performance is needed.
**Warning signs:** Off-by-one errors in unpacking. Wrong values assigned to wrong tracks/properties.

### Pitfall 6: Session Record Toggle Behavior
**What goes wrong:** Calling `trigger_session_record` when already recording stops recording (it's a toggle). Claude might accidentally stop recording when trying to start.
**Why it happens:** AbletonOSC uses a toggle endpoint, not separate start/stop.
**How to avoid:** Query `session_record_status` before toggling. Only call trigger if the current state doesn't match the desired state.
**Warning signs:** Recording starts then immediately stops, or vice versa.

### Pitfall 7: create_track Index Semantics
**What goes wrong:** Creating a track at index -1 is intended to mean "append to end" but the actual index of the new track is unknown without re-querying.
**Why it happens:** AbletonOSC's create_track returns void; the actual index must be inferred.
**How to avoid:** After creating a track, query `num_tracks` and get the name of the last track to confirm creation. For index -1, the new track is at `num_tracks - 1`.
**Warning signs:** Track operations after creation target the wrong track.

## Discretionary Decisions (Claude's Recommendations)

### Tool Grouping: Domain-Grouped with Atomic Tools
**Recommendation:** Use atomic tools (one operation per tool) grouped by domain prefix. This is best for MCP tool discovery because Claude can see the full tool list and pick the specific operation needed.
**Rationale:** Domain-grouped mega-tools (e.g., `transport_control` with an `action` parameter) hide capabilities. Atomic tools with clear names (`transport_play`, `transport_stop`) are self-documenting and match how Claude uses tools in conversation.

### Transport State in Responses: Only in Transport Tool Responses
**Recommendation:** Include transport state (tempo, is_playing, position) only in transport tool responses and in the `ableton_status` response. Track/mixer/scene tools return domain-specific snapshots without transport state.
**Rationale:** Including transport in every response adds 5 extra OSC queries per tool call. The overhead is not justified for most operations. Claude can call `transport_get_state` when it needs transport context.

### Response Format: Structured JSON
**Recommendation:** Return structured JSON in all tool responses. Claude parses JSON natively and can reason about structured data better than free text.
**Rationale:** JSON enables Claude to extract specific values, compare states, and make decisions. Human-readable text would need to be re-parsed. The `type: "text"` wrapper in MCP is fine -- the JSON is the text content.

### Recording-Stop Behavior: Just Stop (No Warning)
**Recommendation:** `transport_stop` should just stop, whether or not recording is active. No warning or confirmation step. If Claude wants to be careful about recording, it can query `is_playing` and `session_record_status` first.
**Rationale:** Adding warning dialogs to stop makes the tool unpredictable. Claude can implement its own safety logic. The undo tool provides a safety net.

## Code Examples

### Registry Integration (updating registry.js)
```javascript
// src/tools/registry.js -- add new modules
import * as health from './health.js';
import * as transport from './transport.js';
import * as track from './track.js';
import * as mixer from './mixer.js';
import * as scene from './scene.js';

const modules = [health, transport, track, mixer, scene];
```

### Tool Definition with Track Reference Input
```javascript
// Example: mixer_set_volume accepts track by index OR name
{
  name: 'mixer_set_volume',
  description: 'Set track volume. Accepts volume in dB (e.g., "-6dB", "+3dB") or normalized float (0.0 to 1.0). Track can be specified by 0-based index or name.',
  inputSchema: {
    type: 'object',
    properties: {
      track: {
        oneOf: [
          { type: 'integer', description: '0-based track index' },
          { type: 'string', description: 'Track name (case-sensitive)' }
        ],
        description: 'Track to set volume for'
      },
      volume: {
        oneOf: [
          { type: 'number', description: 'Normalized volume (0.0 = silence, 1.0 = max)' },
          { type: 'string', description: 'Volume in dB (e.g., "-6dB", "0dB", "+3dB")' }
        ],
        description: 'Volume level'
      }
    },
    required: ['track', 'volume']
  }
}
```

### Error Response Pattern (matching health.js)
```javascript
// All errors use the established ERROR_CODE: context format
return {
  content: [{ type: 'text', text: `TRACK_NOT_FOUND: No track at index ${index}. Session has ${numTracks} tracks (0-${numTracks - 1}).` }],
  isError: true
};
```

### Batch Commands Implementation
```javascript
case 'batch_commands': {
  const results = [];
  for (const cmd of args.commands) {
    try {
      // Route through registry's handleToolCall for each sub-command
      const result = await handleToolCall(cmd.tool, cmd.args || {});
      results.push({ tool: cmd.tool, success: !result.isError, result });
    } catch (err) {
      results.push({ tool: cmd.tool, success: false, error: err.message });
    }
  }
  return {
    content: [{ type: 'text', text: JSON.stringify({ batch_results: results }) }]
  };
}
```

## Complete Tool Inventory

### Transport Domain (8 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `transport_play` | write | TRNS-01 | Must |
| `transport_stop` | write | TRNS-01 | Must |
| `transport_continue` | write | TRNS-01 | Must |
| `transport_record` | write | TRNS-02 | Must |
| `transport_get_tempo` | read | TRNS-03 | Must |
| `transport_set_tempo` | write | TRNS-03 | Must |
| `transport_get_position` | read | TRNS-04 | Must |
| `transport_set_position` | write | TRNS-04 | Must |
| `transport_get_metronome` | read | TRNS-05 | Must |
| `transport_set_metronome` | write | TRNS-05 | Must |

Note: TRNS-06 (song name and save) is NOT supported by AbletonOSC. Document as known limitation.

### Track Domain (6 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `track_list` | read | TRCK-01 | Must |
| `track_create` | write | TRCK-02 | Must |
| `track_delete` | write | TRCK-02 | Must |
| `track_select` | write | TRCK-03 | Must |
| `track_set_arm` | write | TRCK-04 | Must |
| `track_rename` | write | TRCK-05 | Must |

### Mixer Domain (6 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `mixer_get_volume` | read | MIX-01 | Must |
| `mixer_set_volume` | write | MIX-01 | Must |
| `mixer_get_pan` | read | MIX-02 | Must |
| `mixer_set_pan` | write | MIX-02 | Must |
| `mixer_set_mute` | write | MIX-03 | Must |
| `mixer_set_solo` | write | MIX-03 | Must |
| `mixer_get_send` | read | MIX-04 | Must |
| `mixer_set_send` | write | MIX-04 | Must |

### Scene/Clip Domain (6 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `scene_list` | read | CLIP-01 | Must |
| `scene_launch` | write | CLIP-02 | Must |
| `scene_stop` | write | CLIP-02 | Must |
| `clip_launch` | write | CLIP-03 | Must |
| `clip_stop` | write | CLIP-03 | Must |
| `scene_create` | write | CLIP-04 | Must |
| `scene_rename` | write | CLIP-04 | Must |

### Utility Tools (4 tools)
| Tool | Type | Requirement | Priority |
|------|------|-------------|----------|
| `undo` | write | Safety | Must |
| `redo` | write | Safety | Nice |
| `set_read_only` | write | Safety | Must |
| `batch_commands` | write | Efficiency | Must |

**Total: ~34 tools** across 5 modules (transport, track, mixer, scene, utility/helpers)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single mega-tool per domain | Atomic tools with domain prefix | MCP best practice | Better tool discovery, clearer intent |
| Fire-and-forget commands | Command + confirmation snapshot | This project decision | Claude always knows resulting state |
| Raw float values in responses | Both normalized and human-readable (dB, MIDI) | This project decision | Claude and user can both interpret values |

## Open Questions

1. **TRNS-06: Song name and save not in AbletonOSC**
   - What we know: AbletonOSC Song API has no `get/name` or `save` endpoint
   - What's unclear: Whether there's an undocumented endpoint, or if this requires a custom Remote Script extension
   - Recommendation: Mark as known limitation. TRNS-06 cannot be satisfied in Phase 3. Consider adding to Phase 8 investigation.

2. **Volume unity point verification**
   - What we know: ahujasid/ableton-mcp PR uses 0.85 = 0 dB
   - What's unclear: Whether this is exact for all Ableton versions, or approximate
   - Recommendation: Use 0.85 as working assumption. Add a calibration note in code comments. Verify empirically when Ableton is available.

3. **Pan float range verification**
   - What we know: AbletonOSC uses "panning" property, likely -1.0 to 1.0
   - What's unclear: Whether the range is exactly -1.0 to 1.0 or some other range
   - Recommendation: Use -1.0 to 1.0 as working assumption. The 0-127 MIDI conversion assumes this range. Verify empirically.

4. **Return tracks and master track access**
   - What we know: AbletonOSC's `/live/track/` only accesses `song.tracks` (regular tracks). PR #84 for master track support is still open. No dedicated return track API exists.
   - What's unclear: Whether return tracks can be accessed by convention (e.g., they appear after regular tracks in some implementations)
   - Recommendation: Phase 3 `track_list` should note that only regular tracks are listed. Return/master track control is a known limitation. The `create_return_track` and `delete_return_track` song methods DO work for CRUD, but property access (volume, pan, etc.) on return tracks is not possible.

5. **track_data response format parsing**
   - What we know: Returns flat array of values for requested properties across requested track range
   - What's unclear: Exact separator between track data, handling of missing/null values
   - Recommendation: Use individual queries for initial implementation. Optimize with track_data later if performance warrants.

## Sources

### Primary (HIGH confidence)
- **AbletonOSC GitHub README** (master branch) - Full API reference for all OSC addresses, argument types, and response patterns. Verified via WebFetch of raw README.md.
  - Transport: start_playing, stop_playing, continue_playing, get/set tempo, metronome, current_song_time
  - Track: create/delete, get/set name/arm/mute/solo/volume/panning/send, has_midi_input, has_audio_input
  - Scene: fire, get/set name, create/delete
  - Clip: fire, stop, clip_slot has_clip, create_clip
  - Song: undo, redo, trigger_session_record
- **AbletonOSC Source Code** (track.py, song.py) - Verified that `/live/track/` addresses use `self.song.tracks` (excludes return/master). Verified there is no return track handler or master track handler.
- **Existing Codebase** (src/tools/health.js, registry.js, shared.js, osc-client.js) - Established patterns for domain modules, error handling, OscClient usage.

### Secondary (MEDIUM confidence)
- **ahujasid/ableton-mcp PR #26** - Volume dB conversion formula: 0.85 = 0 dB (unity), linear-to-dB piecewise function. Return track global indexing approach.
- **AbletonOSC Issues #47, #58, #84, #102, #115** - Confirmed return track and master track are known gaps. PR #102 (append to track list) was rejected in favor of proper namespace redesign.
- **Cycling '74 LOM Documentation** - Track types determined by `has_midi_input`, `has_audio_input`, `can_be_armed`.

### Tertiary (LOW confidence)
- **Pan range assumption** - -1.0 to 1.0 float range for AbletonOSC panning is inferred from standard audio conventions and DeviceParameter patterns. Not explicitly confirmed in documentation. Needs empirical verification.

## Metadata

**Confidence breakdown:**
- AbletonOSC API mapping: **HIGH** - Verified from official README and source code
- Value conversion (volume): **MEDIUM** - Based on community implementation, not official docs
- Value conversion (pan): **LOW-MEDIUM** - Inferred from convention, needs verification
- Architecture patterns: **HIGH** - Follows established codebase patterns from Phases 1-2
- Return track limitation: **HIGH** - Verified from AbletonOSC source code and issue tracker
- Tool inventory: **HIGH** - Direct mapping from requirements to OSC addresses

**Research date:** 2026-02-05
**Valid until:** 60 days (AbletonOSC is stable, Ableton LOM doesn't change often)
