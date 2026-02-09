---
phase: 06-device-control
plan: 01
subsystem: device-control
tags: [osc, device, parameters, mcp-tools]

dependency-graph:
  requires: [01-01, 02-01, 03-01]
  provides: [device-tools, device-helpers]
  affects: [06-02, 07-01]

tech-stack:
  added: []
  patterns: [domain-module-registry, parameter-resolution, device-snapshot]

file-tracking:
  key-files:
    created:
      - src/tools/device.js
    modified:
      - src/tools/helpers.js
      - src/tools/registry.js

decisions:
  - id: DEV-01
    decision: "Device list uses track-level bulk queries (devices/name, devices/type, devices/class_name) with slice(1) for track-id prefix"
  - id: DEV-02
    decision: "Device toggle checks parameter 0 name first, falls back to full parameter name search for 'Device On'"
  - id: DEV-03
    decision: "Parameter set validates min/max by querying bulk parameters/min and parameters/max endpoints"
  - id: DEV-04
    decision: "Device load selects target track first (PR #174 fix), handles timeout with actionable error about PR #173 patch"

metrics:
  duration: 2 min
  completed: 2026-02-06
---

# Phase 06 Plan 01: Device Control Tools Summary

**Device domain module with 9 MCP tools for listing, controlling, and loading Ableton devices via OSC.**

## What Was Built

### helpers.js additions
- `resolveParameterIndex(client, trackIndex, deviceIndex, paramRef)` -- resolves parameter by integer index or string name via `/live/device/get/parameters/name` OSC query
- `buildDeviceSnapshot(client, trackIndex, deviceIndex)` -- queries device name, class_name, type, and num_parameters to build a standard snapshot object
- `deviceTypeNames` map: `{ 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' }`

### device.js (9 tools)
| Tool | Category | Type | Description |
|------|----------|------|-------------|
| device_list | DEV-01 | read | List all devices on a track in chain order |
| device_get | DEV-01 | read | Detailed device info with parameter count |
| device_toggle | DEV-02 | write | Toggle on/off via Device On parameter |
| device_get_parameters | DEV-03 | read | List all params with values, min/max, quantization |
| device_get_parameter | DEV-03 | read | Single param by index or name with value_string |
| device_set_parameter | DEV-03 | write | Set param with min/max range validation |
| device_select | support | write | Select device in Ableton UI |
| device_delete | support | write | Delete device from chain |
| device_load | DEV-04 | write | Load native instrument/effect from browser |

### registry.js
- Added `import * as device from './device.js'`
- Extended modules array to include device (total: 57 tools registered)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add device helpers to helpers.js | 7761b8d | src/tools/helpers.js |
| 2 | Create device.js domain module with 9 tools and wire into registry | 1f5f2f1 | src/tools/device.js, src/tools/registry.js |

## Decisions Made

1. **Device list bulk queries**: Track-level bulk queries (`/live/track/get/devices/name`, etc.) return `[track_id, ...]` format, slice(1) to get data arrays. Length validated against numDevices with console.warn on mismatch.

2. **Device toggle strategy**: Check parameter 0 name first (O(1) path for most native devices). If not "Device On", fall back to full parameter name search. If "Device On" not found anywhere, return TOGGLE_UNSUPPORTED error.

3. **Parameter min/max validation**: `device_set_parameter` queries bulk `/parameters/min` and `/parameters/max` endpoints and validates before setting. Returns VALUE_OUT_OF_RANGE error with the allowed range.

4. **Device load safety**: Selects target track via `/live/view/set/selected_track` before calling `/live/track/insert_device` (PR #174 fix). Catches timeout errors specifically and returns actionable error about PR #173 patch requirement. Handles both `[deviceIndex]` and `[track_id, deviceIndex]` response formats.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `node -e "import('./src/tools/helpers.js')..."` -- resolveParameterIndex: function, buildDeviceSnapshot: function
- `node -e "import('./src/tools/device.js')..."` -- tools: 9, handle: function
- `node -e "import('./src/tools/registry.js')..."` -- 9 device tools registered, 57 total
- `node -c` syntax checks -- all clean, no duplicate tool warnings

## Next Phase Readiness

Phase 06 Plan 02 (device control tests) can proceed. All 9 tools are registered and follow established patterns. Test infrastructure from Phase 5 (node:test, mock OSC client) is available for reuse.

## Self-Check: PASSED
