import { ensureConnected } from './shared.js';
import {
  resolveTrackIndex,
  parseVolumeInput,
  parsePanInput,
  normalizedToDb,
  floatPanToMidi,
  buildTrackSnapshot,
  guardWrite
} from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'mixer_get_volume',
    description: 'Get track volume in both normalized (0.0-1.0) and dB formats.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        }
      },
      required: ['track']
    }
  },
  {
    name: 'mixer_set_volume',
    description: 'Set track volume. Accepts normalized float (0.0-1.0) or dB string (e.g. "-6dB", "0dB", "-inf").',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        volume: {
          description: 'Volume as normalized float (0.0-1.0) or dB string ("-6dB", "0dB", "-inf")'
        }
      },
      required: ['track', 'volume']
    }
  },
  {
    name: 'mixer_get_pan',
    description: 'Get track pan in both normalized (-1.0 to 1.0) and MIDI (0-127) formats.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        }
      },
      required: ['track']
    }
  },
  {
    name: 'mixer_set_pan',
    description: 'Set track pan using MIDI convention: 0 = hard left, 64 = center, 127 = hard right.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        pan: {
          type: 'integer',
          description: 'Pan value 0-127 (MIDI convention: 0=left, 64=center, 127=right)'
        }
      },
      required: ['track', 'pan']
    }
  },
  {
    name: 'mixer_set_mute',
    description: 'Mute or unmute a track.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        muted: {
          type: 'boolean',
          description: 'true to mute, false to unmute'
        }
      },
      required: ['track', 'muted']
    }
  },
  {
    name: 'mixer_set_solo',
    description: 'Solo or unsolo a track.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        soloed: {
          type: 'boolean',
          description: 'true to solo, false to unsolo'
        }
      },
      required: ['track', 'soloed']
    }
  },
  {
    name: 'mixer_get_send',
    description: 'Get send level for a track to a specific return track.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        send: {
          type: 'integer',
          description: 'Send index (0-based, corresponds to return track order)'
        }
      },
      required: ['track', 'send']
    }
  },
  {
    name: 'mixer_set_send',
    description: 'Set send level for a track to a specific return track.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        send: {
          type: 'integer',
          description: 'Send index (0-based, corresponds to return track order)'
        },
        level: {
          type: 'number',
          description: 'Send level as normalized float (0.0-1.0)'
        }
      },
      required: ['track', 'send', 'level']
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
    content: [{ type: 'text', text: 'MIXER_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('mixer_')) return null;

  try {
    switch (name) {
      case 'mixer_get_volume': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const [volume] = await client.query('/live/track/get/volume', [trackIndex]);
        return jsonResponse({
          track: trackIndex,
          volume: { normalized: volume, db: normalizedToDb(volume) }
        });
      }

      case 'mixer_set_volume': {
        const blocked = guardWrite('mixer_set_volume');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const normalizedValue = parseVolumeInput(args.volume);
        await client.query('/live/track/set/volume', [trackIndex, normalizedValue], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      case 'mixer_get_pan': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const [panning] = await client.query('/live/track/get/panning', [trackIndex]);
        return jsonResponse({
          track: trackIndex,
          pan: { normalized: panning, midi: floatPanToMidi(panning) }
        });
      }

      case 'mixer_set_pan': {
        const blocked = guardWrite('mixer_set_pan');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const floatValue = parsePanInput(args.pan);
        await client.query('/live/track/set/panning', [trackIndex, floatValue], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      case 'mixer_set_mute': {
        const blocked = guardWrite('mixer_set_mute');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/track/set/mute', [trackIndex, args.muted ? 1 : 0], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      case 'mixer_set_solo': {
        const blocked = guardWrite('mixer_set_solo');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/track/set/solo', [trackIndex, args.soloed ? 1 : 0], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      case 'mixer_get_send': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const [level] = await client.query('/live/track/get/send', [trackIndex, args.send]);
        return jsonResponse({
          track: trackIndex,
          send_index: args.send,
          level
        });
      }

      case 'mixer_set_send': {
        const blocked = guardWrite('mixer_set_send');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/track/set/send', [trackIndex, args.send, args.level], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
