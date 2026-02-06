# Phase 6: Device Control - Research

**Researched:** 2026-02-06
**Domain:** AbletonOSC device API, Ableton Live Object Model Device class, MCP tool patterns
**Confidence:** HIGH (core device API) / MEDIUM (device loading) / LOW (enable/disable toggle)

## Summary

Phase 6 adds device listing, parameter control, toggle on/off, and device loading to the MCP server. Research confirms AbletonOSC's master branch has a comprehensive device parameter API (merged PR #114 added individual parameter access and value_string). Device listing, parameter get/set, and deletion are fully supported. However, two requirements face constraints: (1) device enable/disable (DEV-02) cannot be done via `is_active` which is read-only in the LOM, and (2) device loading from browser (DEV-04) is not in the merged AbletonOSC codebase -- it exists only as an unmerged PR #173.

The device module should follow the exact same domain-module pattern as track.js, mixer.js, clip.js. All OSC device endpoints use `[track_id, device_id]` indexing. Parameter access uses an additional `parameter_id` index. The existing `buildTrackSnapshot` already queries `num_devices`, so devices are already partially represented in the codebase.

**Primary recommendation:** Implement DEV-01 (list) and DEV-03 (parameters) using the stable AbletonOSC device API. For DEV-02 (toggle), use the first parameter workaround (parameter index 0 is "Device On" for most Ableton native devices). For DEV-04 (load from browser), implement the `insert_device` approach from PR #173 directly in our MCP server by sending a track select + browser load sequence, with a fallback instruction if it fails.

## Standard Stack

No new libraries needed. Phase 6 uses the existing project stack:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| osc (node-osc) | existing | UDP OSC communication | Already in project |
| @modelcontextprotocol/sdk | existing | MCP server framework | Already in project |

### Supporting
No new dependencies. All device operations use existing OSC client infrastructure.

## Architecture Patterns

### Recommended Project Structure
```
src/tools/
  device.js        # NEW: Device domain module (~8-10 tools)
  helpers.js       # ADD: buildDeviceSnapshot(), buildDeviceParameterList()
  registry.js      # UPDATE: import and register device module
```

### Pattern 1: Domain Module (device.js)
**What:** Follow the established domain module pattern exactly
**When to use:** Always -- this is the project convention
**Example:**
```javascript
// Source: existing pattern from track.js, mixer.js, clip.js
import { ensureConnected } from './shared.js';
import { resolveTrackIndex, guardWrite } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'device_list',
    description: 'List all devices on a track...',
    inputSchema: { /* ... */ }
  },
  // ...
];

function jsonResponse(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResponse(message) {
  return { content: [{ type: 'text', text: 'DEVICE_ERROR: ' + message }], isError: true };
}

export async function handle(name, args) {
  if (!name.startsWith('device_')) return null;
  try {
    switch (name) { /* ... */ }
  } catch (err) {
    return errorResponse(err.message);
  }
}
```

### Pattern 2: Device Snapshot Builder (helpers.js)
**What:** Reusable snapshot builder for device state, following buildTrackSnapshot/buildClipSnapshot pattern
**When to use:** All device write operations return full snapshot
**Example:**
```javascript
// Source: project convention (track.js, clip.js return snapshots after writes)
export async function buildDeviceSnapshot(client, trackIndex, deviceIndex) {
  const [, , name] = await client.query('/live/device/get/name', [trackIndex, deviceIndex]);
  const [, , className] = await client.query('/live/device/get/class_name', [trackIndex, deviceIndex]);
  const [, , type] = await client.query('/live/device/get/type', [trackIndex, deviceIndex]);
  const [, , numParams] = await client.query('/live/device/get/num_parameters', [trackIndex, deviceIndex]);

  // Device type mapping: 1=audio_effect, 2=instrument, 4=midi_effect
  const typeNames = { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' };

  return {
    track_index: trackIndex,
    device_index: deviceIndex,
    name,
    class_name: className,
    type: typeNames[type] || 'unknown',
    type_id: type,
    parameter_count: numParams
  };
}
```

### Pattern 3: Parameter Resolution by Name
**What:** Allow parameter access by index OR name (like track resolution)
**When to use:** DEV-03 requires "by index or name" access
**Example:**
```javascript
export async function resolveParameterIndex(client, trackIndex, deviceIndex, paramRef) {
  if (typeof paramRef === 'number') return paramRef;
  if (typeof paramRef !== 'string') {
    throw new Error('INVALID_PARAMETER: Expected number or string, got ' + typeof paramRef);
  }
  // Query all parameter names and find match
  const response = await client.query('/live/device/get/parameters/name', [trackIndex, deviceIndex]);
  const names = response.slice(2); // skip track_id, device_id prefix
  const index = names.findIndex(n => n === paramRef);
  if (index === -1) {
    throw new Error('PARAMETER_NOT_FOUND: No parameter named "' + paramRef + '" on device');
  }
  return index;
}
```

### Pattern 4: Device Loading via Browser API (Unmerged PR Approach)
**What:** Load devices by selecting track then searching browser
**When to use:** DEV-04 (load instruments/effects)
**Constraint:** AbletonOSC does NOT have this endpoint in the merged codebase. Two options:

**Option A (RECOMMENDED): Implement in our fork / patch AbletonOSC locally**
The user would need to apply PR #173's changes to their local AbletonOSC installation. The PR adds `/live/track/insert_device` which:
1. Takes `[track_index, device_uri]`
2. Searches `browser.instruments`, `browser.audio_effects`, `browser.midi_effects`, `browser.drums`, `browser.sounds`
3. Calls `browser.load_item(item)` to load onto the selected track
4. Returns `(new_device_index,)` or `(-1,)` if not found

**Option B: Select track + use view to trigger browser load**
Use existing OSC endpoints in sequence:
1. `/live/view/set/selected_track [track_index]` -- select target track
2. Need a mechanism to trigger browser loading -- this is NOT available in stock AbletonOSC

**Recommendation:** Option A. Apply PR #173's patch to the local AbletonOSC installation. Document this as a setup requirement. The MCP tool then simply calls `/live/track/insert_device`. If the endpoint is not available (user hasn't patched), return a clear error with instructions.

### Anti-Patterns to Avoid
- **Querying all parameters individually in a loop:** Use bulk endpoints `/live/device/get/parameters/name`, `/live/device/get/parameters/value` instead of looping over each parameter
- **Assuming parameter indices are stable across devices:** Parameter index 0 means different things on different devices. Always pair with name queries.
- **Setting parameters without checking min/max:** Always validate against `/live/device/get/parameters/min` and `/live/device/get/parameters/max` or use the is_quantized flag

## AbletonOSC Device API Reference (Complete)

### Track-Level Device Queries
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/track/get/num_devices` | track_id | track_id, num_devices | Count of devices on track |
| `/live/track/get/devices/name` | track_id | track_id, [name, ...] | All device names on track |
| `/live/track/get/devices/type` | track_id | track_id, [type, ...] | All device types (1=audio_effect, 2=instrument, 4=midi_effect) |
| `/live/track/get/devices/class_name` | track_id | track_id, [class, ...] | All device class names |
| `/live/track/get/devices/can_have_chains` | track_id | track_id, [bool, ...] | Whether each device can have chains |
| `/live/track/delete_device` | track_id, device_id | | Delete device from track |

### Device Properties (Individual)
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/device/get/name` | track_id, device_id | track_id, device_id, name | Human-readable device name |
| `/live/device/get/class_name` | track_id, device_id | track_id, device_id, class_name | Live class name (Operator, Reverb, PluginDevice...) |
| `/live/device/get/type` | track_id, device_id | track_id, device_id, type | 1=audio_effect, 2=instrument, 4=midi_effect |

### Parameter Access (Bulk)
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/device/get/num_parameters` | track_id, device_id | track_id, device_id, count | Number of exposed parameters |
| `/live/device/get/parameters/name` | track_id, device_id | track_id, device_id, [name, ...] | All parameter names |
| `/live/device/get/parameters/value` | track_id, device_id | track_id, device_id, [value, ...] | All parameter values |
| `/live/device/get/parameters/min` | track_id, device_id | track_id, device_id, [min, ...] | All parameter minimum values |
| `/live/device/get/parameters/max` | track_id, device_id | track_id, device_id, [max, ...] | All parameter maximum values |
| `/live/device/get/parameters/is_quantized` | track_id, device_id | track_id, device_id, [bool, ...] | Whether each param must be int/bool |
| `/live/device/set/parameters/value` | track_id, device_id, [value, ...] | | Set ALL parameter values at once |

### Parameter Access (Individual)
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/device/get/parameter/value` | track_id, device_id, param_id | track_id, device_id, param_id, value | Get single parameter value |
| `/live/device/get/parameter/value_string` | track_id, device_id, param_id | track_id, device_id, param_id, string | Human-readable value (e.g. "2500 Hz") |
| `/live/device/get/parameter/name` | track_id, device_id, param_id | track_id, device_id, param_id, name | Get parameter name |
| `/live/device/set/parameter/value` | track_id, device_id, param_id, value | | Set single parameter value |

### Parameter Listeners
| OSC Address | Query Params | Description |
|-------------|-------------|-------------|
| `/live/device/start_listen/parameter/value` | track_id, device_id, param_id | Subscribe to parameter changes |
| `/live/device/stop_listen/parameter/value` | track_id, device_id, param_id | Unsubscribe from parameter changes |

### View (Device Selection)
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/view/get/selected_device` | | track_index, device_index | Get currently selected device |
| `/live/view/set/selected_device` | track_index, device_index | | Select a device in the UI |

### Device Loading (UNMERGED -- PR #173)
| OSC Address | Query Params | Response Params | Description |
|-------------|-------------|-----------------|-------------|
| `/live/track/insert_device` | track_id, device_uri, [device_index] | device_index (-1 if not found) | Load device by name via browser API |

## Critical Finding: Device Enable/Disable (DEV-02)

### The Problem
The Live Object Model `Device.is_active` property is **read-only**. AbletonOSC does not expose it at all (not even as a getter). There is no `/live/device/set/is_active` endpoint, and the LOM does not allow setting it programmatically.

### The Workaround
For virtually all Ableton native devices, **parameter index 0 is "Device On"** -- a boolean (is_quantized=true) parameter with min=0.0, max=1.0. Setting this parameter to 0.0 disables the device; 1.0 enables it.

```javascript
// Toggle device on/off via parameter 0 ("Device On")
// This works for ALL Ableton native instruments and effects
async function toggleDevice(client, trackIndex, deviceIndex, enabled) {
  await client.query('/live/device/set/parameter/value',
    [trackIndex, deviceIndex, 0, enabled ? 1.0 : 0.0],
    TIMEOUTS.COMMAND);
}
```

**Verification:** The tool should:
1. First read parameter 0's name to confirm it is "Device On"
2. If not, scan parameter names for "Device On" (some plugins may have different parameter order)
3. If no "Device On" parameter exists, return an error explaining the device cannot be toggled via this API

**Confidence:** MEDIUM -- this is a well-known convention in the Ableton community but not formally documented. Parameter 0 being "Device On" is consistent across native devices but may differ for third-party plugins.

## Critical Finding: Device Loading (DEV-04)

### The Problem
AbletonOSC's merged codebase has NO endpoint for loading devices from the browser. PR #173 adds `/live/track/insert_device` but is unmerged as of 2026-02-06.

### Recommended Approach
1. **Apply PR #173 to local AbletonOSC installation** -- The changes are minimal (one function added to track.py). Document this as a setup requirement.
2. **Important fix from PR #174:** PR #173 has a bug where `browser.load_item()` loads to the currently selected track, not the specified track. The fix is to set `song.view.selected_track = track` before calling `browser.load_item()`.
3. **MCP tool wraps this with error handling:** If `/live/track/insert_device` times out or returns -1, provide clear error messages.

### Device Names for Loading
Common Ableton native device names (for the `device_uri` parameter):
- **Instruments:** Wavetable, Operator, Drift, Simpler, Sampler, Analog, Collision, Electric, Tension, "Drum Rack"
- **Audio Effects:** Reverb, Delay, "EQ Eight", "EQ Three", Compressor, Limiter, "Auto Filter", Chorus, Flanger, Phaser, "Saturator", "Utility", "Spectrum", Glue
- **MIDI Effects:** Arpeggiator, Chord, "Note Length", "Pitch", "Random", Scale, Velocity

**Important:** Device names use Ableton's browser names, which may include spaces and capitalization. Exact match is tried first, then substring match.

## OSC Response Format Details

All device OSC responses prefix with `[track_id, device_id, ...]`. This is consistent with the clip pattern (`[track_id, clip_id, ...]`). Code must slice off the prefix indices to get the actual data:

```javascript
// Getting device name
const [trackId, deviceId, name] = await client.query('/live/device/get/name', [trackIndex, deviceIndex]);
// name is the third element

// Getting all parameter names (bulk)
const response = await client.query('/live/device/get/parameters/name', [trackIndex, deviceIndex]);
const paramNames = response.slice(2); // skip trackId, deviceId prefix

// Getting single parameter value
const [trackId, deviceId, paramId, value] = await client.query(
  '/live/device/get/parameter/value', [trackIndex, deviceIndex, paramIndex]);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parameter value validation | Custom range checker | Query min/max/is_quantized from AbletonOSC | Ranges differ per device per parameter |
| Device type names | Hardcoded mapping | Query from AbletonOSC class_name | Plugin class names vary |
| Human-readable param values | String formatting | `/live/device/get/parameter/value_string` endpoint | AbletonOSC returns formatted strings like "2500 Hz", "Lowpass" |
| Device on/off state | Custom is_active tracker | Parameter 0 "Device On" approach | LOM is_active is read-only |

## Common Pitfalls

### Pitfall 1: Parameter Index Out of Range
**What goes wrong:** Setting a parameter index that doesn't exist causes AbletonOSC to return an error or hang
**Why it happens:** Different devices have different numbers of parameters (Utility has ~5, Wavetable has 100+)
**How to avoid:** Always query `/live/device/get/num_parameters` first, validate index < count
**Warning signs:** OSC timeout errors when setting parameters

### Pitfall 2: Device Index Stale After Insert/Delete
**What goes wrong:** Device indices shift when devices are added or removed from a chain
**Why it happens:** Devices are indexed by position (0-based), not by stable ID
**How to avoid:** Re-query device list after any insert/delete operation. Return fresh snapshots.
**Warning signs:** Wrong device being modified, especially in batch operations

### Pitfall 3: Parameter Values Outside Range
**What goes wrong:** Setting a value above max or below min causes AbletonOSC error (Issue #184 reports: "Invalid value. Check the parameters range with min/max")
**Why it happens:** Each parameter has device-specific min/max ranges. A filter frequency might be 20-20000 while a mix knob is 0.0-1.0
**How to avoid:** Query min/max, clamp input values, return clear error if out of range
**Warning signs:** "Invalid value" errors in AbletonOSC logs

### Pitfall 4: Bulk Parameter Set Ordering
**What goes wrong:** `/live/device/set/parameters/value` expects ALL parameter values in order
**Why it happens:** It's a bulk set -- you must provide values for every parameter, not just the one you want to change
**How to avoid:** For single parameter changes, use `/live/device/set/parameter/value` (singular). Only use bulk set when changing multiple parameters simultaneously.
**Warning signs:** Other parameters unexpectedly changing values

### Pitfall 5: Browser Load Targets Wrong Track
**What goes wrong:** Device loads onto the currently selected track in Ableton UI, not the specified track
**Why it happens:** `browser.load_item()` inherently loads to the selected track (PR #174 documents this)
**How to avoid:** Always set selected track before loading: `/live/view/set/selected_track [track_index]` then load device
**Warning signs:** Device appearing on wrong track

### Pitfall 6: Third-Party Plugin Parameter Naming
**What goes wrong:** VST/AU plugins expose parameters with opaque names or numeric indices instead of human-readable names
**Why it happens:** Third-party plugins use their own parameter naming conventions
**How to avoid:** The `class_name` for plugins is "PluginDevice" or "AuPluginDevice" -- detect this and warn users that parameter names may not be human-readable. Defer human-readable naming to Phase 8 (DEV-05).
**Warning signs:** Parameters named "P1", "P2" or numeric strings

## Proposed Tool List

Based on requirements DEV-01 through DEV-04:

| Tool Name | Requirement | Description | Write? |
|-----------|-------------|-------------|--------|
| `device_list` | DEV-01 | List all devices on a track with chain order | No |
| `device_get` | DEV-01 | Get detailed info for a single device | No |
| `device_toggle` | DEV-02 | Enable or disable a device via parameter 0 | Yes |
| `device_get_parameters` | DEV-03 | List all parameters with names, values, ranges | No |
| `device_get_parameter` | DEV-03 | Get a single parameter by index or name | No |
| `device_set_parameter` | DEV-03 | Set a single parameter by index or name | Yes |
| `device_select` | Support | Select a device in Ableton's UI | Yes |
| `device_delete` | Support | Remove a device from a track | Yes |
| `device_load` | DEV-04 | Load an instrument or effect from browser | Yes |

**Total: 9 tools** (4 read, 5 write)

## Code Examples

### List devices on a track (DEV-01)
```javascript
// Source: AbletonOSC README - Track API device properties
async function listDevices(client, trackIndex) {
  const [, numDevices] = await client.query('/live/track/get/num_devices', [trackIndex]);
  if (numDevices === 0) return { track_index: trackIndex, device_count: 0, devices: [] };

  const namesResp = await client.query('/live/track/get/devices/name', [trackIndex]);
  const typesResp = await client.query('/live/track/get/devices/type', [trackIndex]);
  const classResp = await client.query('/live/track/get/devices/class_name', [trackIndex]);

  const names = namesResp.slice(1); // skip track_id prefix
  const types = typesResp.slice(1);
  const classes = classResp.slice(1);

  const typeNames = { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' };
  const devices = names.map((name, i) => ({
    index: i,
    name,
    class_name: classes[i],
    type: typeNames[types[i]] || 'unknown',
    type_id: types[i]
  }));

  return { track_index: trackIndex, device_count: numDevices, devices };
}
```

### Get device parameters (DEV-03)
```javascript
// Source: AbletonOSC README - Device API
async function getDeviceParameters(client, trackIndex, deviceIndex) {
  const [, , numParams] = await client.query('/live/device/get/num_parameters', [trackIndex, deviceIndex]);
  const namesResp = await client.query('/live/device/get/parameters/name', [trackIndex, deviceIndex]);
  const valuesResp = await client.query('/live/device/get/parameters/value', [trackIndex, deviceIndex]);
  const minsResp = await client.query('/live/device/get/parameters/min', [trackIndex, deviceIndex]);
  const maxsResp = await client.query('/live/device/get/parameters/max', [trackIndex, deviceIndex]);
  const quantResp = await client.query('/live/device/get/parameters/is_quantized', [trackIndex, deviceIndex]);

  const names = namesResp.slice(2);
  const values = valuesResp.slice(2);
  const mins = minsResp.slice(2);
  const maxs = maxsResp.slice(2);
  const quantized = quantResp.slice(2);

  const parameters = names.map((name, i) => ({
    index: i,
    name,
    value: values[i],
    min: mins[i],
    max: maxs[i],
    is_quantized: !!quantized[i]
  }));

  return { track_index: trackIndex, device_index: deviceIndex, parameter_count: numParams, parameters };
}
```

### Toggle device on/off (DEV-02)
```javascript
// Source: Ableton community convention -- parameter 0 is "Device On"
async function toggleDevice(client, trackIndex, deviceIndex, enabled) {
  // Verify parameter 0 is "Device On"
  const [, , , paramName] = await client.query(
    '/live/device/get/parameter/name', [trackIndex, deviceIndex, 0]);

  if (paramName !== 'Device On') {
    // Search all parameters for "Device On"
    const namesResp = await client.query('/live/device/get/parameters/name', [trackIndex, deviceIndex]);
    const names = namesResp.slice(2);
    const idx = names.findIndex(n => n === 'Device On');
    if (idx === -1) {
      throw new Error('TOGGLE_UNSUPPORTED: Device has no "Device On" parameter');
    }
    await client.query('/live/device/set/parameter/value',
      [trackIndex, deviceIndex, idx, enabled ? 1.0 : 0.0], TIMEOUTS.COMMAND);
    return idx;
  }

  await client.query('/live/device/set/parameter/value',
    [trackIndex, deviceIndex, 0, enabled ? 1.0 : 0.0], TIMEOUTS.COMMAND);
  return 0;
}
```

### Load device from browser (DEV-04)
```javascript
// Source: AbletonOSC PR #173 + PR #174 fix
// REQUIRES: patched AbletonOSC with insert_device endpoint
async function loadDevice(client, trackIndex, deviceUri) {
  // Select the target track first (PR #174 fix)
  await client.query('/live/view/set/selected_track', [trackIndex], TIMEOUTS.COMMAND);

  try {
    const [deviceIndex] = await client.query(
      '/live/track/insert_device', [trackIndex, deviceUri], TIMEOUTS.LOAD_DEVICE);

    if (deviceIndex === -1) {
      throw new Error('DEVICE_NOT_FOUND: No device matching "' + deviceUri +
        '" in browser. Check spelling and try exact Ableton device name.');
    }
    return deviceIndex;
  } catch (err) {
    if (err.message.includes('timeout')) {
      throw new Error('LOAD_TIMEOUT: Device loading timed out. ' +
        'Ensure AbletonOSC has the insert_device patch applied (PR #173).');
    }
    throw err;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No individual parameter access | Per-parameter get/set + value_string | PR #114, merged Jan 2024 | Can read/write individual params without bulk operations |
| No device loading via OSC | PR #173 insert_device (unmerged) | Feb 2025 | Enables programmatic device insertion -- must patch locally |
| Device enable via is_active | Parameter 0 "Device On" workaround | Always (LOM limitation) | is_active is read-only in LOM, param 0 is the standard workaround |

**Deprecated/outdated:**
- AbletonOSC pre-PR#114 only had bulk parameter access -- individual parameter get/set/value_string are now available in master

## Open Questions

1. **Response format prefix for track-level bulk queries**
   - What we know: `/live/track/get/devices/name` returns `[track_id, name1, name2, ...]` -- the track_id is the first element
   - What's unclear: Is the prefix always exactly 1 element for track-level queries vs 2 for device-level?
   - Recommendation: Implement and test empirically. Use the existing `num_devices` count to verify we got the right number of names.

2. **Parameter 0 "Device On" universality**
   - What we know: Works for all tested Ableton native devices (community reports)
   - What's unclear: Edge cases with Max for Live devices, Drum Rack internals, third-party plugins
   - Recommendation: Always verify parameter name before toggling. Return clear error if "Device On" not found.

3. **PR #173 insert_device stability**
   - What we know: Tested with Live 12 on macOS for instruments, audio effects
   - What's unclear: Behavior on Linux (user's platform), edge cases with device names
   - Recommendation: Implement with defensive error handling. Document the AbletonOSC patch as setup prerequisite.

4. **Device parameter value ranges for set operations**
   - What we know: Issue #184 confirms AbletonOSC rejects out-of-range values with "Invalid value" error
   - What's unclear: Whether all parameters report accurate min/max, or if some have hidden constraints
   - Recommendation: Always query and validate min/max before setting. Clamp values and warn user.

## Sources

### Primary (HIGH confidence)
- AbletonOSC README (master branch) - Complete Device API table with all endpoints, parameters, response formats
- AbletonOSC source: `abletonosc/device.py` - Confirmed endpoints: get/set parameter value, name, class_name, type, num_parameters, bulk parameters, value_string, parameter listeners
- AbletonOSC source: `abletonosc/track.py` - Confirmed: num_devices, devices/name, devices/type, devices/class_name, devices/can_have_chains, delete_device
- Cycling '74 Live Object Model Reference (Device class) - Confirmed is_active is READ-ONLY, parameters list is available, only name is settable
- AbletonOSC PR #114 (MERGED Jan 2024) - Individual parameter listeners, parameter value_string endpoint, device selector

### Secondary (MEDIUM confidence)
- AbletonOSC PR #173 (OPEN) - insert_device endpoint for loading devices via browser API, tested on Live 12 macOS
- AbletonOSC PR #174 (OPEN) - Fix for insert_device to select track before browser.load_item()
- AbletonOSC Issue #184 - Confirms parameter value validation errors at runtime
- AbletonOSC Issue #183 - Comprehensive browser API proposal (much larger scope than PR #173)

### Tertiary (LOW confidence)
- Community convention that parameter 0 is "Device On" for native Ableton devices
- Device names for browser loading derived from PR #173 test cases and Ableton documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, using existing project infrastructure
- Architecture: HIGH - Following established domain module pattern exactly
- Device listing (DEV-01): HIGH - Fully supported by merged AbletonOSC endpoints
- Device toggle (DEV-02): MEDIUM - Relies on parameter 0 "Device On" convention, not formal API
- Device parameters (DEV-03): HIGH - Full parameter CRUD in merged AbletonOSC
- Device loading (DEV-04): MEDIUM - Requires unmerged PR #173 patch to AbletonOSC
- Pitfalls: HIGH - Based on actual issues (#184), source code analysis, and PR discussions

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable -- AbletonOSC core device API is mature, PR #173 status may change)
