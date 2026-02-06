# Phase 4: MIDI Clip Editing - Research

**Researched:** 2026-02-06
**Domain:** AbletonOSC MIDI clip creation, note editing, and loop property control via MCP tools
**Confidence:** HIGH

## Summary

This phase implements four requirements (MIDI-01 through MIDI-04) for creating MIDI clips, adding/removing/reading notes, and controlling clip loop properties. All operations map directly to verified AbletonOSC OSC addresses. The research traced the complete data path from OSC messages through AbletonOSC's Python handlers to Ableton's Live Object Model (LOM) API, confirming exact parameter formats, note data serialization, and response structures.

MIDI note data in AbletonOSC uses a flat array format with 5 values per note: `[pitch, start_time, duration, velocity, mute]` repeated for each note. This is the critical design constraint -- the MCP tool layer must translate between Claude-friendly structured note objects and AbletonOSC's flat array format. Clip creation requires a length parameter (in beats) and can only be called on empty clip slots on MIDI tracks. Clip addressing uses the same `[track_index, clip_index]` pattern already established in Phase 3's scene.js for clip_launch and clip_stop.

The existing codebase provides all infrastructure needed: the domain module pattern (tools[] + handle()), resolveTrackIndex() for track name resolution, guardWrite() for read-only mode, and the OscClient with per-address queuing. This phase adds a new `clip.js` domain module following the established pattern.

**Primary recommendation:** Build a single `clip.js` domain module with 7-8 tools covering clip CRUD, note batch add/remove/read, and loop property control. Use structured JSON note objects in the MCP interface (`{pitch, start_time, duration, velocity, mute}`) and convert to/from flat arrays for OSC transport. Clip slots are addressed by `[track_index, scene_index]` matching the existing clip_launch/clip_stop convention.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `osc` | `2.4.5` | OSC protocol over UDP | Already in project, handles all AbletonOSC communication |
| `@modelcontextprotocol/sdk` | `^1.26.0` | MCP server framework | Already in project, provides tool registration |

### Supporting (no new dependencies needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:test` | built-in | Unit testing | Test clip module with mock OscClient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat array note format in OSC | JSON string encoding | AbletonOSC expects flat arrays -- no alternative |
| Single add_notes batch tool | Individual note add/remove tools | Batch is better: fewer round-trips, AbletonOSC handles atomically |

**Installation:**
```bash
# No new packages needed -- all dependencies from Phases 1-2
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  tools/
    clip.js          # NEW: MIDI clip editing domain module
    helpers.js       # EXISTING: Add clip snapshot builder, note validation
    registry.js      # EXISTING: Add clip module to modules array
    shared.js        # EXISTING: No changes
    scene.js         # EXISTING: No changes (clip_launch/clip_stop stay here)
    ...
```

### Pattern 1: Clip Domain Module (matching track.js/scene.js)
**What:** New `clip.js` module exports `tools[]` and `handle(name, args)`.
**When to use:** All MIDI clip editing operations.
**Source:** Verified pattern from existing track.js, scene.js

```javascript
// src/tools/clip.js
import { ensureConnected } from './shared.js';
import { resolveTrackIndex, guardWrite } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'clip_create',
    description: 'Create a new empty MIDI clip...',
    inputSchema: { /* ... */ }
  },
  // ...
];

export async function handle(name, args) {
  if (!name.startsWith('clip_') || name === 'clip_launch' || name === 'clip_stop') return null;
  // Note: clip_launch and clip_stop are handled by scene.js (Phase 3)

  try {
    switch (name) {
      case 'clip_create': { /* ... */ }
      // ...
      default: return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
```

**CRITICAL routing note:** `clip_launch` and `clip_stop` already exist in `scene.js` from Phase 3. The new `clip.js` module MUST exclude these names from its routing (return null for them) to avoid conflicts. The registry dispatches to the first module that returns non-null.

### Pattern 2: Note Data Serialization (structured JSON <-> flat OSC array)
**What:** Convert between Claude-friendly note objects and AbletonOSC's flat array format.
**When to use:** Every note read/write operation.
**Source:** Verified from AbletonOSC clip.py source code

```javascript
// Flat array format: [pitch, start_time, duration, velocity, mute, pitch, start_time, ...]
// 5 values per note, repeated

function notesToFlatArray(notes) {
  const flat = [];
  for (const note of notes) {
    flat.push(
      note.pitch,        // int 0-127
      note.start_time,   // float (beats)
      note.duration,     // float (beats)
      note.velocity,     // int 0-127
      note.mute ? 1 : 0  // int 0 or 1
    );
  }
  return flat;
}

function flatArrayToNotes(flat) {
  const notes = [];
  for (let i = 0; i < flat.length; i += 5) {
    notes.push({
      pitch: flat[i],
      start_time: flat[i + 1],
      duration: flat[i + 2],
      velocity: flat[i + 3],
      mute: !!flat[i + 4]
    });
  }
  return notes;
}
```

### Pattern 3: Clip Snapshot Builder
**What:** Query clip properties and assemble a response object.
**When to use:** After create/modify operations for confirmation.

```javascript
async function buildClipSnapshot(client, trackIndex, clipIndex) {
  const [, , name] = await client.query('/live/clip/get/name', [trackIndex, clipIndex]);
  const [, , length] = await client.query('/live/clip/get/length', [trackIndex, clipIndex]);
  const [, , loopStart] = await client.query('/live/clip/get/loop_start', [trackIndex, clipIndex]);
  const [, , loopEnd] = await client.query('/live/clip/get/loop_end', [trackIndex, clipIndex]);
  const [, , looping] = await client.query('/live/clip/get/looping', [trackIndex, clipIndex]);
  const [, , isMidi] = await client.query('/live/clip/get/is_midi_clip', [trackIndex, clipIndex]);

  return {
    track_index: trackIndex,
    clip_index: clipIndex,
    name,
    length,
    loop_start: loopStart,
    loop_end: loopEnd,
    looping: !!looping,
    is_midi: !!isMidi
  };
}
```

### Pattern 4: Verify MIDI Track Before Clip Creation
**What:** Check that a clip slot is on a MIDI track and is empty before creating a clip.
**When to use:** `clip_create` tool.
**Source:** LOM docs state create_clip "can only be called on empty clip slots in MIDI tracks"

```javascript
// Pre-check: is it a MIDI track?
const [hasMidi] = await client.query('/live/track/get/has_midi_input', [trackIndex]);
if (!hasMidi) {
  return errorResponse('INVALID_TRACK: Track ' + trackIndex + ' is not a MIDI track. MIDI clips can only be created on MIDI tracks.');
}

// Pre-check: is the slot empty?
const [hasClip] = await client.query('/live/clip_slot/get/has_clip', [trackIndex, clipIndex]);
if (hasClip) {
  return errorResponse('SLOT_NOT_EMPTY: Clip slot [' + trackIndex + ', ' + clipIndex + '] already contains a clip. Delete it first or choose another slot.');
}
```

### Anti-Patterns to Avoid
- **Creating clips on audio tracks:** `clip_slot.create_clip()` only works on MIDI tracks. Audio clips come from recording or dragging samples. Always verify track type first.
- **Assuming clip_index is scene_index:** They ARE the same thing in session view (clip_index = scene_index), but the mental model matters. Document clearly.
- **Sending note data without validation:** Invalid pitch (>127), negative duration, or velocity out of range will cause AbletonOSC/Ableton errors. Validate before sending.
- **Not handling the response offset:** AbletonOSC clip responses prepend `[track_index, clip_index, ...]` to all return values. Must skip the first 2 values when parsing get_notes responses, OR must handle that the query() method returns `[track_index, clip_index, note_data...]`.
- **Forgetting the routing exclusion:** clip_launch and clip_stop exist in scene.js. The new clip.js MUST NOT handle these names.

## AbletonOSC API Reference (Phase 4 Scope)

### Clip Slot Operations

| Operation | OSC Address | Args (send) | Response | Notes |
|-----------|-------------|-------------|----------|-------|
| Create clip | `/live/clip_slot/create_clip` | `track_idx, clip_idx, length` | void | Length in beats (>0.0). MIDI tracks only. Empty slots only. |
| Delete clip | `/live/clip_slot/delete_clip` | `track_idx, clip_idx` | void | Removes clip from slot |
| Has clip? | `/live/clip_slot/get/has_clip` | `track_idx, clip_idx` | `[track_idx, clip_idx, 0\|1]` | Check before create |
| Duplicate clip | `/live/clip_slot/duplicate_clip_to` | `src_track, src_clip, dst_track, dst_clip` | void | Overwrites target |

### Note Operations

| Operation | OSC Address | Args (send) | Response | Notes |
|-----------|-------------|-------------|----------|-------|
| Get notes | `/live/clip/get/notes` | `track_idx, clip_idx [, pitch_start, pitch_span, time_start, time_span]` | `[track_idx, clip_idx, pitch, start, dur, vel, mute, ...]` | 0 or 4 filter args. Default: all notes. |
| Add notes | `/live/clip/add/notes` | `track_idx, clip_idx, pitch, start, dur, vel, mute, ...` | void | 5 values per note, multiple notes in one call |
| Remove notes | `/live/clip/remove/notes` | `track_idx, clip_idx [, pitch_start, pitch_span, time_start, time_span]` | void | 0 or 4 filter args. Default: remove ALL notes. |

### Clip Properties

| Property | Get Address | Set Address | Type | Notes |
|----------|-------------|-------------|------|-------|
| name | `/live/clip/get/name` | `/live/clip/set/name` | string | |
| length | `/live/clip/get/length` | N/A (read-only) | float | In beats. Set by changing loop_end or create_clip length. |
| loop_start | `/live/clip/get/loop_start` | `/live/clip/set/loop_start` | float | Beats |
| loop_end | `/live/clip/get/loop_end` | `/live/clip/set/loop_end` | float | Beats |
| looping | `/live/clip/get/looping` | `/live/clip/set/looping` | int 0/1 | Enable/disable looping |
| start_marker | `/live/clip/get/start_marker` | `/live/clip/set/start_marker` | float | Independent of loop |
| end_marker | `/live/clip/get/end_marker` | `/live/clip/set/end_marker` | float | Independent of loop |
| is_midi_clip | `/live/clip/get/is_midi_clip` | N/A (read-only) | int 0/1 | |
| color | `/live/clip/get/color` | `/live/clip/set/color` | int | 0x00rrggbb format |
| color_index | `/live/clip/get/color_index` | `/live/clip/set/color_index` | int | Ableton color palette index |
| muted | `/live/clip/get/muted` | `/live/clip/set/muted` | int 0/1 | Clip-level mute |
| position | `/live/clip/get/position` | `/live/clip/set/position` | float | Equals loop_start |

### Response Format Details

**CRITICAL:** All `/live/clip/` responses prepend `[track_index, clip_index, ...]` to the return values. For example:

- `/live/clip/get/name [0, 0]` returns `[0, 0, "Clip Name"]`
- `/live/clip/get/notes [0, 0]` returns `[0, 0, pitch1, start1, dur1, vel1, mute1, pitch2, ...]`
- `/live/clip/get/length [0, 0]` returns `[0, 0, 4.0]`

The actual property value starts at index 2 in the response array. This is verified from AbletonOSC source code (clip.py: `return (track_index, clip_index, *rv)`).

**Note:** The existing codebase's `buildTrackSnapshot` uses destructuring like `const [name] = await client.query(...)` which works because track property responses return `[value]` only (the track_index is NOT prepended for `/live/track/get/` responses). But clip responses DO prepend track_index and clip_index, so destructuring must account for this: `const [, , value] = await client.query(...)`.

## Note Data Format Deep Dive

### AbletonOSC Flat Array Format (verified from source)

**Send format (add/notes):**
```
/live/clip/add/notes track_idx clip_idx pitch1 start1 dur1 vel1 mute1 [pitch2 start2 dur2 vel2 mute2 ...]
```
- First 2 args: track_index, clip_index (routing)
- Remaining args: groups of 5 values per note
- AbletonOSC parses with: `params[offset:offset+5]` in chunks of 5

**Receive format (get/notes):**
```
Response: [track_idx, clip_idx, pitch1, start1, dur1, vel1, mute1, pitch2, start2, dur2, vel2, mute2, ...]
```
- First 2 values: track_index, clip_index (routing echo)
- Remaining values: groups of 5 per note
- Empty clip returns: `[track_idx, clip_idx]` (no note data)

### Note Attribute Ranges

| Attribute | Type | Range | Default | Notes |
|-----------|------|-------|---------|-------|
| pitch | int | 0-127 | required | MIDI note number. 60 = C3 (middle C) |
| start_time | float | >= 0.0 | required | Position in beats from clip start |
| duration | float | > 0.0 | required | Length in beats |
| velocity | int/float | 1-127 | 100 | MIDI velocity. 0 = silent but exists |
| mute | int/bool | 0 or 1 | 0 (false) | Note deactivation (Ableton "mute note" feature) |

### MCP Interface Design (structured JSON)

For the MCP tool layer, notes should be structured objects:

```json
{
  "pitch": 60,
  "start_time": 0.0,
  "duration": 0.5,
  "velocity": 100,
  "mute": false
}
```

The server converts to/from flat arrays internally. This is cleaner for Claude to work with and matches the ahujasid reference implementation's approach.

### Pitch Naming Convention

Provide optional pitch name resolution for better Claude UX:

| Note Name | MIDI Number | Octave |
|-----------|-------------|--------|
| C3 | 48 | 3 |
| C4 (middle C) | 60 | 4 |
| A4 (concert A) | 69 | 4 |
| C5 | 72 | 5 |

**Formula:** `MIDI = (octave + 1) * 12 + semitone` where C=0, C#=1, ..., B=11.

This is a nice-to-have for the tool description but NOT required for functionality. Claude already knows MIDI note numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Note data serialization | Ad-hoc array packing per tool | Centralized `notesToFlatArray()` / `flatArrayToNotes()` helpers | Single source of truth for the 5-value-per-note format |
| Note validation | Inline checks in each handler | `validateNote()` helper that checks pitch range, duration > 0, velocity range | Consistent error messages, DRY |
| Clip existence check | Inline has_clip queries | `ensureClipExists()` helper | Multiple tools need to verify clip exists before operating |
| Track type verification | Inline has_midi_input queries | `ensureMidiTrack()` helper | create_clip requires MIDI track; clear error messages |
| Clip snapshot building | Manual property queries per tool | `buildClipSnapshot()` helper in helpers.js | Same pattern as buildTrackSnapshot/buildTransportSnapshot |

**Key insight:** The data conversion layer (structured notes <-> flat arrays) is the core complexity. The OSC calls are straightforward. Centralizing note serialization prevents subtle off-by-one errors in the 5-value grouping.

## Common Pitfalls

### Pitfall 1: Response Index Offset for Clip Properties
**What goes wrong:** Code uses `const [value] = await client.query('/live/clip/get/name', [trackIdx, clipIdx])` and gets the track_index instead of the name.
**Why it happens:** Unlike `/live/track/get/` responses (which return just the value), `/live/clip/get/` responses prepend `[track_index, clip_index, value]`. The first two elements are routing metadata.
**How to avoid:** Always destructure clip responses as `const [, , value] = ...` or `response.slice(2)`. Add a helper function like `queryClipProperty(client, trackIdx, clipIdx, property)` that handles the offset.
**Warning signs:** Getting numeric values where strings are expected. Values that look like indices (0, 1, 2) instead of actual property values.

### Pitfall 2: Creating Clips on Non-MIDI Tracks
**What goes wrong:** `create_clip` fails silently or throws an Ableton error when called on an audio track.
**Why it happens:** The LOM `clip_slot.create_clip(length)` only works on MIDI tracks. Audio clips are created differently (recording, drag-and-drop).
**How to avoid:** Check `has_midi_input` before attempting to create a clip. Return a clear error message.
**Warning signs:** Timeout on create_clip for audio tracks. No clip appears in Ableton.

### Pitfall 3: Creating Clips in Non-Empty Slots
**What goes wrong:** `create_clip` fails when a clip already exists in the target slot.
**Why it happens:** The LOM requires an empty clip slot. It does not overwrite existing clips.
**How to avoid:** Check `has_clip` before creating. Either return an error or offer to delete the existing clip first.
**Warning signs:** Error from AbletonOSC about clip slot not being empty.

### Pitfall 4: Note Count Limits and UDP Packet Size
**What goes wrong:** Adding a very large number of notes in a single OSC message fails or notes are silently dropped.
**Why it happens:** Each note adds 5 OSC values. With 100 notes, that's 500+ values plus routing overhead. While UDP can technically handle 65507 bytes, OSC implementations may have lower buffers.
**How to avoid:** Add notes in batches. A safe batch size is ~50-100 notes per OSC message. For the MCP tool, accept any number of notes but chunk internally if the count exceeds a threshold (e.g., 100 notes).
**Warning signs:** Some notes missing after add operation. Timeout errors on large note batches.

### Pitfall 5: get/notes Returns Empty Array for Empty Clip
**What goes wrong:** Code tries to parse note data from an empty clip and gets an unexpected format.
**Why it happens:** An empty clip returns only `[track_index, clip_index]` with no additional values. If `response.length - 2` is 0 but code tries to iterate, it works fine. But if code checks `response.length === 0` to detect errors, it will wrongly flag empty clips.
**How to avoid:** After slicing off the first 2 routing values, check if the remaining array length is 0 (empty clip) vs a multiple of 5 (has notes).
**Warning signs:** Empty clips reported as errors. Zero-length note arrays treated as failures.

### Pitfall 6: Loop End Must Be Greater Than Loop Start
**What goes wrong:** Setting loop_start to a value >= loop_end (or vice versa) causes an Ableton error.
**Why it happens:** Ableton enforces `loop_start < loop_end` at all times. If you set loop_start first and it would exceed the current loop_end, the operation fails.
**How to avoid:** When setting both loop points, set them in the correct order: if expanding, set loop_end first then loop_start. If contracting, set loop_start first then loop_end. Or query current values to determine order.
**Warning signs:** Loop property changes fail intermittently depending on current values.

### Pitfall 7: remove/notes with No Args Removes ALL Notes
**What goes wrong:** Calling `/live/clip/remove/notes` with just `[track_idx, clip_idx]` and no filter args removes every note in the clip.
**Why it happens:** AbletonOSC defaults to `pitch_start=0, pitch_span=127, time_start=-8192, time_span=16384` which covers all possible notes.
**How to avoid:** The MCP tool should make this behavior explicit. A `clip_clear_notes` tool with no filter args is fine, but `clip_remove_notes` with optional filters should warn clearly in the description that omitting filters removes everything.
**Warning signs:** Accidentally clearing entire clips when intending to remove specific notes.

## Complete Tool Inventory

### MIDI Clip Domain (new tools)

| Tool | Type | Requirement | OSC Address | Priority |
|------|------|-------------|-------------|----------|
| `clip_create` | write | MIDI-01 | `/live/clip_slot/create_clip` | Must |
| `clip_delete` | write | MIDI-01 | `/live/clip_slot/delete_clip` | Must |
| `clip_get_notes` | read | MIDI-03 | `/live/clip/get/notes` | Must |
| `clip_add_notes` | write | MIDI-02 | `/live/clip/add/notes` | Must |
| `clip_remove_notes` | write | MIDI-02 | `/live/clip/remove/notes` | Must |
| `clip_set_loop` | write | MIDI-04 | `/live/clip/set/loop_start` + `/live/clip/set/loop_end` + `/live/clip/set/looping` | Must |
| `clip_get` | read | MIDI-03, MIDI-04 | Multiple `/live/clip/get/` | Must |
| `clip_set_name` | write | MIDI-01 (polish) | `/live/clip/set/name` | Nice |

**Total: 7-8 new tools** in one module (clip.js)

### Tool Design Details

**clip_create:**
```javascript
{
  name: 'clip_create',
  description: 'Create a new empty MIDI clip in a clip slot. Length is in beats (e.g., 4.0 = one bar at 4/4). Can only create on MIDI tracks in empty slots.',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index (0-based) or name' },
      scene: { type: 'integer', description: '0-based scene/clip slot index' },
      length: { type: 'number', description: 'Clip length in beats (default 4.0)' },
      name: { type: 'string', description: 'Optional clip name' }
    },
    required: ['track', 'scene']
  }
}
```

**clip_add_notes:**
```javascript
{
  name: 'clip_add_notes',
  description: 'Add MIDI notes to an existing clip. Each note needs pitch (0-127, 60=C4), start_time (beats), duration (beats), velocity (1-127, default 100), and mute (default false).',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index or name' },
      scene: { type: 'integer', description: '0-based scene index' },
      notes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pitch: { type: 'integer', description: 'MIDI note (0-127, 60=C4)' },
            start_time: { type: 'number', description: 'Start position in beats' },
            duration: { type: 'number', description: 'Length in beats' },
            velocity: { type: 'integer', description: 'Velocity 1-127 (default 100)' },
            mute: { type: 'boolean', description: 'Deactivate note (default false)' }
          },
          required: ['pitch', 'start_time', 'duration']
        },
        description: 'Array of note objects to add'
      }
    },
    required: ['track', 'scene', 'notes']
  }
}
```

**clip_get_notes:**
```javascript
{
  name: 'clip_get_notes',
  description: 'Read MIDI notes from a clip. Optionally filter by pitch range and time range. Returns structured note objects.',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index or name' },
      scene: { type: 'integer', description: '0-based scene index' },
      pitch_start: { type: 'integer', description: 'Filter: minimum pitch (default 0)' },
      pitch_span: { type: 'integer', description: 'Filter: pitch range from start (default 127)' },
      time_start: { type: 'number', description: 'Filter: minimum time in beats (default: all)' },
      time_span: { type: 'number', description: 'Filter: time range in beats (default: all)' }
    },
    required: ['track', 'scene']
  }
}
```

**clip_remove_notes:**
```javascript
{
  name: 'clip_remove_notes',
  description: 'Remove MIDI notes from a clip. Filter by pitch range and/or time range. WARNING: omitting all filters removes ALL notes from the clip.',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index or name' },
      scene: { type: 'integer', description: '0-based scene index' },
      pitch_start: { type: 'integer', description: 'Minimum pitch to remove (default 0)' },
      pitch_span: { type: 'integer', description: 'Pitch range (default 127 = all pitches)' },
      time_start: { type: 'number', description: 'Minimum time in beats (default: earliest)' },
      time_span: { type: 'number', description: 'Time range in beats (default: all time)' }
    },
    required: ['track', 'scene']
  }
}
```

**clip_set_loop:**
```javascript
{
  name: 'clip_set_loop',
  description: 'Set clip loop properties. All values in beats. Set looping to enable/disable loop. Loop start must be less than loop end.',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index or name' },
      scene: { type: 'integer', description: '0-based scene index' },
      loop_start: { type: 'number', description: 'Loop start in beats' },
      loop_end: { type: 'number', description: 'Loop end in beats' },
      looping: { type: 'boolean', description: 'Enable or disable looping' }
    },
    required: ['track', 'scene']
  }
}
```

**clip_get:**
```javascript
{
  name: 'clip_get',
  description: 'Get clip properties including name, length, loop points, and whether it is a MIDI clip. Also includes note count.',
  inputSchema: {
    type: 'object',
    properties: {
      track: { description: 'Track index or name' },
      scene: { type: 'integer', description: '0-based scene index' }
    },
    required: ['track', 'scene']
  }
}
```

## Code Examples

### Creating a MIDI Clip via OSC
```javascript
// Source: Verified from AbletonOSC clip_slot.py + handler.py _call_method
// create_clip dispatches: clip_slot.create_clip(*params[2:])
// params[2:] = (length,) so clip_slot.create_clip(length)
const trackIndex = 0;
const clipIndex = 0;
const lengthBeats = 4.0;

// Step 1: Verify empty MIDI track slot
const [hasClip] = await client.query('/live/clip_slot/get/has_clip', [trackIndex, clipIndex]);
// hasClip response: [track_idx, clip_idx, 0_or_1] -- BUT clip_slot responses
// may follow a different pattern than clip responses. Needs verification.

// Step 2: Create clip
await client.query('/live/clip_slot/create_clip', [trackIndex, clipIndex, lengthBeats], TIMEOUTS.COMMAND);

// Step 3: Optionally name the clip
await client.query('/live/clip/set/name', [trackIndex, clipIndex, 'My Clip'], TIMEOUTS.COMMAND);
```

### Adding Notes to a Clip
```javascript
// Source: Verified from AbletonOSC clip.py clip_add_notes function
const notes = [
  { pitch: 60, start_time: 0.0, duration: 0.5, velocity: 100, mute: false },
  { pitch: 64, start_time: 0.5, duration: 0.5, velocity: 80, mute: false },
  { pitch: 67, start_time: 1.0, duration: 1.0, velocity: 100, mute: false }
];

// Convert to flat array: [pitch, start, dur, vel, mute, pitch, start, dur, vel, mute, ...]
const flatNotes = [];
for (const note of notes) {
  flatNotes.push(note.pitch, note.start_time, note.duration, note.velocity, note.mute ? 1 : 0);
}

await client.query('/live/clip/add/notes', [trackIndex, clipIndex, ...flatNotes], TIMEOUTS.COMMAND);
```

### Reading Notes from a Clip
```javascript
// Source: Verified from AbletonOSC clip.py clip_get_notes function
// Response format: [track_idx, clip_idx, pitch1, start1, dur1, vel1, mute1, ...]

const response = await client.query('/live/clip/get/notes', [trackIndex, clipIndex]);
// response = [0, 0, 60, 0.0, 0.5, 100, 0, 64, 0.5, 0.5, 80, 0, 67, 1.0, 1.0, 100, 0]

const noteData = response.slice(2); // Remove track_idx, clip_idx prefix
const notes = [];
for (let i = 0; i < noteData.length; i += 5) {
  notes.push({
    pitch: noteData[i],
    start_time: noteData[i + 1],
    duration: noteData[i + 2],
    velocity: noteData[i + 3],
    mute: !!noteData[i + 4]
  });
}
// notes = [{pitch:60, start_time:0.0, duration:0.5, velocity:100, mute:false}, ...]
```

### Setting Loop Properties (with correct ordering)
```javascript
// Source: Cycling '74 LOM documentation for Clip class
// IMPORTANT: loop_start must always be < loop_end
// When expanding: set loop_end first, then loop_start
// When contracting: set loop_start first, then loop_end

const currentLoopStart = 0.0;
const currentLoopEnd = 4.0;
const newLoopStart = 2.0;
const newLoopEnd = 8.0;

// Expanding (new end > current end): set end first
if (newLoopEnd > currentLoopEnd) {
  await client.query('/live/clip/set/loop_end', [trackIndex, clipIndex, newLoopEnd], TIMEOUTS.COMMAND);
  await client.query('/live/clip/set/loop_start', [trackIndex, clipIndex, newLoopStart], TIMEOUTS.COMMAND);
} else {
  // Contracting: set start first
  await client.query('/live/clip/set/loop_start', [trackIndex, clipIndex, newLoopStart], TIMEOUTS.COMMAND);
  await client.query('/live/clip/set/loop_end', [trackIndex, clipIndex, newLoopEnd], TIMEOUTS.COMMAND);
}
```

### Clip Slot Property Response Format Verification
```javascript
// IMPORTANT: clip_slot property responses may follow a different prepend pattern
// than clip property responses. From AbletonOSC clip_slot.py:
//   rv = func(clip_slot, *args, tuple(params[2:]))
//   if rv is not None: return (track_index, clip_index, *rv)
//
// For _get_property, func returns (value, *params) where params is empty tuple after slicing.
// So response is: (track_index, clip_index, value)
//
// Example: /live/clip_slot/get/has_clip [0, 0]
// Response: [0, 0, 1] meaning track 0, clip 0, has_clip=1(true)

const response = await client.query('/live/clip_slot/get/has_clip', [trackIndex, clipIndex]);
const hasClip = response[2]; // Skip track_index and clip_index
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `clip.get_notes()` (deprecated) | `clip.get_notes_extended()` (LOM) | Live 11+ | Returns dict with note_id, probability, etc. |
| `clip.remove_notes()` (deprecated) | `clip.remove_notes_extended()` (LOM) | Live 11+ | Required for MPE support |
| Individual note add/remove | `add_new_notes(tuple)` + `apply_note_modifications()` | Live 11+ | Batch operations, atomic updates |
| No note IDs | Note IDs in `get_notes_extended()` responses | Live 11+ | Enables precise note targeting |

**AbletonOSC status:** AbletonOSC uses `get_notes_extended()` and `remove_notes_extended()` internally (verified in clip.py source) but serializes to the flat 5-value format for OSC transport. It does NOT expose note IDs or probability/velocity_deviation through OSC. These extended features are only available through the LOM directly.

## Open Questions

1. **Clip slot response format verification**
   - What we know: From source code, clip_slot `_get_property` should return `(track_index, clip_index, value)`
   - What's unclear: Whether the actual OscClient response follows this format consistently, or if `_call_method` (for create_clip, delete_clip) returns nothing (void methods)
   - Recommendation: Treat create_clip/delete_clip as void operations (no meaningful return value). Query has_clip after creation to confirm. Use COMMAND timeout.

2. **Note batch size practical limit**
   - What we know: UDP max is 65507 bytes, each note is ~5 OSC args (~40-60 bytes with type tags)
   - What's unclear: Whether AbletonOSC or the `osc` npm package has a lower practical limit
   - Recommendation: Chunk at 100 notes per message (conservative, ~3KB). Test with larger batches empirically.

3. **Timing of note operations during playback**
   - What we know: LOM documentation doesn't explicitly restrict note editing during playback
   - What's unclear: Whether adding/removing notes while a clip is playing causes audible glitches or race conditions
   - Recommendation: Notes can likely be edited during playback (this is normal in Ableton). No special handling needed, but document that results may not be audible until the next loop iteration.

4. **duplicate_loop via OSC**
   - What we know: AbletonOSC registers `duplicate_loop` as a method on clips
   - What's unclear: Whether this is useful enough to expose as a dedicated MCP tool
   - Recommendation: Include as a stretch goal or utility. It doubles the loop length and duplicates notes -- useful for song building.

## Sources

### Primary (HIGH confidence)
- **AbletonOSC clip.py source code** (GitHub master branch) - Complete handler implementation for `get/notes`, `add/notes`, `remove/notes`. Verified flat array format: 5 values per note `[pitch, start_time, duration, velocity, mute]`. Verified response prepend pattern: `(track_index, clip_index, *rv)`.
- **AbletonOSC clip_slot.py source code** (GitHub master branch) - Complete handler for `create_clip`, `delete_clip`, `fire`, `stop`, `duplicate_clip_to`. Verified method dispatch via `_call_method`.
- **AbletonOSC handler.py source code** (GitHub master branch) - Verified `_call_method` unpacks params as `*params`: `getattr(target, method)(*params)`. Confirmed create_clip receives length as the unpacked param.
- **Cycling '74 LOM ClipSlot documentation** (docs.cycling74.com) - `create_clip(length)`: length in beats, >0.0, empty MIDI slots only. `delete_clip()`: no params. `fire()`: optional record_length, launch_quantization.
- **Cycling '74 LOM Clip documentation** (docs.cycling74.com) - Full property/method reference. `get_notes_extended(from_pitch, pitch_span, from_time, time_span)`. `add_new_notes({notes: [...]})`. `remove_notes_extended(from_pitch, pitch_span, from_time, time_span)`.
- **Existing codebase** (src/tools/track.js, scene.js, helpers.js, registry.js) - Established patterns for domain modules, error handling, track resolution, snapshot building.

### Secondary (MEDIUM confidence)
- **ahujasid/ableton-mcp MCP_Server/server.py** - Reference implementation showing `create_clip(track_index, clip_index, length=4.0)` and `add_notes_to_clip(track_index, clip_index, notes: List[Dict])` tool design. Validates the structured-JSON-to-flat-array approach.
- **Ableton Forum: Remote scripts note API** (forum.ableton.com/viewtopic.php?t=243936) - Confirmed `MidiNoteSpecification(pitch, start_time, duration, velocity, mute)` usage and `add_new_notes(tuple(...))` calling convention.

### Tertiary (LOW confidence)
- **UDP packet size limits** - Practical limit ~65507 bytes. No specific AbletonOSC limit documented. 100-note batch recommendation is conservative estimate. Needs empirical validation.

## Metadata

**Confidence breakdown:**
- AbletonOSC MIDI API mapping: **HIGH** - Verified from source code (clip.py, clip_slot.py, handler.py)
- Note data format (5-value flat array): **HIGH** - Verified from AbletonOSC clip.py source
- Response format (track_idx, clip_idx prepend): **HIGH** - Verified from `create_clip_callback` return pattern in clip.py
- Clip creation constraints (MIDI only, empty slots): **HIGH** - Verified from Cycling '74 LOM docs
- Loop property ordering requirements: **MEDIUM** - Inferred from Ableton UI behavior and LOM constraint that start < end
- Batch note size limits: **LOW** - No documented limit; conservative estimate
- Architecture patterns: **HIGH** - Follows established codebase patterns from Phases 1-3

**Research date:** 2026-02-06
**Valid until:** 60 days (AbletonOSC stable, Ableton LOM stable)
