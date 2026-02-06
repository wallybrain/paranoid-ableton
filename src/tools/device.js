import { ensureConnected } from './shared.js';
import { resolveTrackIndex, resolveParameterIndex, buildDeviceSnapshot, guardWrite } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

const typeNames = { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' };

export const tools = [
  {
    name: 'device_list',
    description: 'List all devices on a track in chain order with name, type, and class.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        }
      },
      required: ['track']
    }
  },
  {
    name: 'device_get',
    description: 'Get detailed info for a single device including name, type, class, and parameter count.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        }
      },
      required: ['track', 'device']
    }
  },
  {
    name: 'device_toggle',
    description: 'Toggle a device on/off. Uses the "Device On" parameter (parameter 0 for most native devices). Returns error if device has no toggleable parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        },
        enabled: {
          type: 'boolean',
          description: 'true to enable, false to disable'
        }
      },
      required: ['track', 'device', 'enabled']
    }
  },
  {
    name: 'device_get_parameters',
    description: 'List all parameters of a device with names, current values, min/max ranges, and quantization info.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        }
      },
      required: ['track', 'device']
    }
  },
  {
    name: 'device_get_parameter',
    description: 'Get a single device parameter by index or name, including its human-readable value string.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        },
        parameter: {
          description: 'Parameter index (0-based) or name'
        }
      },
      required: ['track', 'device', 'parameter']
    }
  },
  {
    name: 'device_set_parameter',
    description: 'Set a device parameter value by index or name. Validates value is within min/max range.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        },
        parameter: {
          description: 'Parameter index (0-based) or name'
        },
        value: {
          type: 'number',
          description: 'New value (must be within parameter min/max range)'
        }
      },
      required: ['track', 'device', 'parameter', 'value']
    }
  },
  {
    name: 'device_select',
    description: 'Select a device in Ableton Live\'s UI (opens device view).',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        }
      },
      required: ['track', 'device']
    }
  },
  {
    name: 'device_delete',
    description: 'Delete a device from a track\'s device chain. WARNING: Device indices shift after deletion.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device: {
          type: 'integer',
          description: '0-based device index'
        }
      },
      required: ['track', 'device']
    }
  },
  {
    name: 'device_load',
    description: 'Load an Ableton instrument or effect onto a track from the browser. Requires AbletonOSC insert_device patch (PR #173). Common names: Wavetable, Operator, Drift, Simpler, Reverb, Delay, EQ Eight, Compressor, Auto Filter, Utility, Arpeggiator.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        device_name: {
          type: 'string',
          description: 'Ableton device name (e.g., "Wavetable", "Reverb", "EQ Eight", "Compressor"). Must match browser name.'
        }
      },
      required: ['track', 'device_name']
    }
  }
];

function jsonResponse(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }]
  };
}

function errorResponse(message) {
  return {
    content: [{ type: 'text', text: 'DEVICE_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('device_')) return null;

  try {
    switch (name) {
      case 'device_list': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const [, numDevices] = await client.query('/live/track/get/num_devices', [trackIndex], TIMEOUTS.QUERY);

        if (numDevices === 0) {
          return jsonResponse({ track_index: trackIndex, device_count: 0, devices: [] });
        }

        const namesResp = await client.query('/live/track/get/devices/name', [trackIndex], TIMEOUTS.QUERY);
        const typesResp = await client.query('/live/track/get/devices/type', [trackIndex], TIMEOUTS.QUERY);
        const classResp = await client.query('/live/track/get/devices/class_name', [trackIndex], TIMEOUTS.QUERY);

        const names = namesResp.slice(1);
        const types = typesResp.slice(1);
        const classes = classResp.slice(1);

        if (names.length !== numDevices) {
          console.warn('device_list: expected ' + numDevices + ' device names, got ' + names.length);
        }

        const devices = [];
        for (let i = 0; i < numDevices; i++) {
          devices.push({
            index: i,
            name: names[i],
            class_name: classes[i],
            type: typeNames[types[i]] || 'unknown',
            type_id: types[i]
          });
        }

        return jsonResponse({ track_index: trackIndex, device_count: numDevices, devices });
      }

      case 'device_get': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const snapshot = await buildDeviceSnapshot(client, trackIndex, args.device);
        return jsonResponse(snapshot);
      }

      case 'device_toggle': {
        const blocked = guardWrite('device_toggle');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        let toggleParamIndex;
        const [, , , paramName] = await client.query('/live/device/get/parameter/name', [trackIndex, args.device, 0], TIMEOUTS.QUERY);

        if (paramName === 'Device On') {
          await client.query('/live/device/set/parameter/value', [trackIndex, args.device, 0, args.enabled ? 1.0 : 0.0], TIMEOUTS.COMMAND);
          toggleParamIndex = 0;
        } else {
          const namesResp = await client.query('/live/device/get/parameters/name', [trackIndex, args.device], TIMEOUTS.QUERY);
          const names = namesResp.slice(2);
          const idx = names.findIndex(n => n === 'Device On');
          if (idx === -1) {
            return errorResponse('TOGGLE_UNSUPPORTED: Device has no "Device On" parameter and cannot be toggled via this API.');
          }
          await client.query('/live/device/set/parameter/value', [trackIndex, args.device, idx, args.enabled ? 1.0 : 0.0], TIMEOUTS.COMMAND);
          toggleParamIndex = idx;
        }

        const snapshot = await buildDeviceSnapshot(client, trackIndex, args.device);
        return jsonResponse({ ...snapshot, enabled: args.enabled, toggle_parameter_index: toggleParamIndex });
      }

      case 'device_get_parameters': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        const [, , numParams] = await client.query('/live/device/get/num_parameters', [trackIndex, args.device], TIMEOUTS.QUERY);
        const namesResp = await client.query('/live/device/get/parameters/name', [trackIndex, args.device], TIMEOUTS.QUERY);
        const valuesResp = await client.query('/live/device/get/parameters/value', [trackIndex, args.device], TIMEOUTS.QUERY);
        const minsResp = await client.query('/live/device/get/parameters/min', [trackIndex, args.device], TIMEOUTS.QUERY);
        const maxsResp = await client.query('/live/device/get/parameters/max', [trackIndex, args.device], TIMEOUTS.QUERY);
        const quantizedResp = await client.query('/live/device/get/parameters/is_quantized', [trackIndex, args.device], TIMEOUTS.QUERY);

        const names = namesResp.slice(2);
        const values = valuesResp.slice(2);
        const mins = minsResp.slice(2);
        const maxs = maxsResp.slice(2);
        const quantized = quantizedResp.slice(2);

        const parameters = [];
        for (let i = 0; i < numParams; i++) {
          parameters.push({
            index: i,
            name: names[i],
            value: values[i],
            min: mins[i],
            max: maxs[i],
            is_quantized: !!quantized[i]
          });
        }

        return jsonResponse({ track_index: trackIndex, device_index: args.device, parameter_count: numParams, parameters });
      }

      case 'device_get_parameter': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const paramIndex = await resolveParameterIndex(client, trackIndex, args.device, args.parameter);

        const [, , , value] = await client.query('/live/device/get/parameter/value', [trackIndex, args.device, paramIndex], TIMEOUTS.QUERY);
        const [, , , paramName] = await client.query('/live/device/get/parameter/name', [trackIndex, args.device, paramIndex], TIMEOUTS.QUERY);
        const [, , , valueString] = await client.query('/live/device/get/parameter/value_string', [trackIndex, args.device, paramIndex], TIMEOUTS.QUERY);

        return jsonResponse({
          track_index: trackIndex,
          device_index: args.device,
          parameter_index: paramIndex,
          name: paramName,
          value,
          value_string: valueString
        });
      }

      case 'device_set_parameter': {
        const blocked = guardWrite('device_set_parameter');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const paramIndex = await resolveParameterIndex(client, trackIndex, args.device, args.parameter);

        const minsResp = await client.query('/live/device/get/parameters/min', [trackIndex, args.device], TIMEOUTS.QUERY);
        const maxsResp = await client.query('/live/device/get/parameters/max', [trackIndex, args.device], TIMEOUTS.QUERY);
        const mins = minsResp.slice(2);
        const maxs = maxsResp.slice(2);
        const min = mins[paramIndex];
        const max = maxs[paramIndex];

        if (args.value < min || args.value > max) {
          return errorResponse('VALUE_OUT_OF_RANGE: Value ' + args.value + ' outside range [' + min + ', ' + max + '] for parameter "' + paramIndex + '"');
        }

        await client.query('/live/device/set/parameter/value', [trackIndex, args.device, paramIndex, args.value], TIMEOUTS.COMMAND);

        const [, , , valueString] = await client.query('/live/device/get/parameter/value_string', [trackIndex, args.device, paramIndex], TIMEOUTS.QUERY);

        return jsonResponse({
          track_index: trackIndex,
          device_index: args.device,
          parameter_index: paramIndex,
          value: args.value,
          value_string: valueString
        });
      }

      case 'device_select': {
        const blocked = guardWrite('device_select');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        await client.query('/live/view/set/selected_device', [trackIndex, args.device], TIMEOUTS.COMMAND);

        const snapshot = await buildDeviceSnapshot(client, trackIndex, args.device);
        return jsonResponse(snapshot);
      }

      case 'device_delete': {
        const blocked = guardWrite('device_delete');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        const snapshot = await buildDeviceSnapshot(client, trackIndex, args.device);
        await client.query('/live/track/delete_device', [trackIndex, args.device], TIMEOUTS.COMMAND);

        return jsonResponse({ deleted: true, ...snapshot });
      }

      case 'device_load': {
        const blocked = guardWrite('device_load');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        // Select target track first (PR #174 fix for browser.load_item targeting wrong track)
        await client.query('/live/view/set/selected_track', [trackIndex], TIMEOUTS.COMMAND);

        let loadResp;
        try {
          loadResp = await client.query('/live/track/insert_device', [trackIndex, args.device_name], TIMEOUTS.LOAD_DEVICE);
        } catch (err) {
          if (err.message && (err.message.includes('timeout') || err.message.includes('TIMEOUT'))) {
            return errorResponse('LOAD_FAILED: Device loading timed out. Ensure AbletonOSC has the insert_device patch applied (PR #173). See README for setup instructions.');
          }
          throw err;
        }

        // Response format: [deviceIndex] or [track_id, deviceIndex] -- handle both
        const deviceIndex = loadResp.length === 1 ? loadResp[0] : loadResp[loadResp.length - 1];

        if (deviceIndex === -1) {
          return errorResponse('DEVICE_NOT_FOUND: No device matching "' + args.device_name + '" in Ableton browser. Check spelling -- use exact Ableton names like "Wavetable", "EQ Eight", "Compressor".');
        }

        const snapshot = await buildDeviceSnapshot(client, trackIndex, deviceIndex);
        return jsonResponse(snapshot);
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
