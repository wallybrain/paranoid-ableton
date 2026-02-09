import { ensureConnected } from './shared.js';
import { parseTempoInput, buildTransportSnapshot, guardWrite } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

// AbletonOSC does not expose song name retrieval or project save operations.
// TRNS-06 (get_song_name, save) is a known limitation documented in research.

export const tools = [
  {
    name: 'transport_play',
    description: 'Start playback from current position.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_stop',
    description: 'Stop playback. Also stops recording if active.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_continue',
    description: 'Continue playback from where it was stopped.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_record',
    description: 'Toggle session recording. Checks current record status first -- only toggles if not already recording.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_get_tempo',
    description: 'Get current session tempo in BPM.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_set_tempo',
    description: "Set session tempo. Accepts absolute BPM (number) or relative change ('+5', '-10', 'double', 'half').",
    inputSchema: {
      type: 'object',
      properties: {
        tempo: {
          oneOf: [
            { type: 'number', description: 'Absolute BPM (20-999)' },
            { type: 'string', description: "Relative change: '+5', '-10', 'double', 'half'" }
          ]
        }
      },
      required: ['tempo']
    }
  },
  {
    name: 'transport_get_position',
    description: 'Get current playback position in beats.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_set_position',
    description: 'Set playback position in beats.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'number',
          description: 'Position in beats'
        }
      },
      required: ['position']
    }
  },
  {
    name: 'transport_get_metronome',
    description: 'Get metronome on/off state.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'transport_set_metronome',
    description: 'Enable or disable the metronome.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'true to enable, false to disable'
        }
      },
      required: ['enabled']
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
    content: [{ type: 'text', text: 'TRANSPORT_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('transport_')) return null;

  try {
    switch (name) {
      case 'transport_play': {
        const blocked = guardWrite('transport_play');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/start_playing', [], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_stop': {
        const blocked = guardWrite('transport_stop');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/stop_playing', [], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_continue': {
        const blocked = guardWrite('transport_continue');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/continue_playing', [], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_record': {
        const blocked = guardWrite('transport_record');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const [recordStatus] = await client.query('/live/song/get/session_record_status');
        if (recordStatus === 1 || recordStatus === 2) {
          const snapshot = await buildTransportSnapshot(client);
          snapshot.note = 'Already recording';
          return jsonResponse(snapshot);
        }
        await client.query('/live/song/trigger_session_record', [], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_get_tempo': {
        const client = await ensureConnected();
        const [tempo] = await client.query('/live/song/get/tempo');
        return jsonResponse({ tempo });
      }

      case 'transport_set_tempo': {
        const blocked = guardWrite('transport_set_tempo');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const [currentTempo] = await client.query('/live/song/get/tempo');
        const newTempo = parseTempoInput(args.tempo, currentTempo);
        await client.query('/live/song/set/tempo', [newTempo], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_get_position': {
        const client = await ensureConnected();
        const [position] = await client.query('/live/song/get/current_song_time');
        return jsonResponse({ position_beats: position });
      }

      case 'transport_set_position': {
        const blocked = guardWrite('transport_set_position');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/set/current_song_time', [args.position], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'transport_get_metronome': {
        const client = await ensureConnected();
        const [metronome] = await client.query('/live/song/get/metronome');
        return jsonResponse({ metronome: !!metronome });
      }

      case 'transport_set_metronome': {
        const blocked = guardWrite('transport_set_metronome');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/set/metronome', [args.enabled ? 1 : 0], TIMEOUTS.COMMAND);
        const snapshot = await buildTransportSnapshot(client);
        return jsonResponse(snapshot);
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
