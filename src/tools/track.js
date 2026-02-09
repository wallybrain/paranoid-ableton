import { ensureConnected } from './shared.js';
import {
  resolveTrackIndex,
  buildTrackSnapshot,
  guardWrite,
  getPendingDelete,
  setPendingDelete,
  clearPendingDelete
} from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

// AbletonOSC only accesses song.tracks (regular MIDI/audio tracks).
// Return tracks and master track are NOT accessible via the current
// AbletonOSC API and will not appear in track_list results.

export const tools = [
  {
    name: 'track_list',
    description: 'List all tracks in the session with their properties. Note: only regular tracks (MIDI, audio) are listed. Return tracks and master track are not accessible via current AbletonOSC API.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'track_create',
    description: 'Create a new MIDI or audio track. Specify index for insertion position (0-based), or omit/-1 to append at end.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['midi', 'audio'],
          description: 'Track type: "midi" or "audio"'
        },
        index: {
          type: 'integer',
          description: '0-based insertion position. -1 or omit to append at end.'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'track_delete',
    description: 'Delete a track. First call (no confirm) returns track contents as warning. Second call with confirm=true performs deletion. Track can be specified by index or name.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        confirm: {
          type: 'boolean',
          description: 'Set to true to confirm deletion after reviewing track contents'
        }
      },
      required: ['track']
    }
  },
  {
    name: 'track_select',
    description: "Select a track in Ableton's session view. Track can be specified by index or name.",
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
    name: 'track_set_arm',
    description: 'Arm or disarm a track for recording. Track can be specified by index or name.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        armed: {
          type: 'boolean',
          description: 'true to arm, false to disarm'
        }
      },
      required: ['track', 'armed']
    }
  },
  {
    name: 'track_rename',
    description: 'Rename a track. Track can be specified by current index or current name.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        name: {
          type: 'string',
          description: 'New name for the track'
        }
      },
      required: ['track', 'name']
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
    content: [{ type: 'text', text: 'TRACK_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('track_')) return null;

  try {
    switch (name) {
      case 'track_list': {
        const client = await ensureConnected();
        const [numTracks] = await client.query('/live/song/get/num_tracks');
        const tracks = [];
        for (let i = 0; i < numTracks; i++) {
          const snapshot = await buildTrackSnapshot(client, i);
          tracks.push(snapshot);
        }
        return jsonResponse({ track_count: numTracks, tracks });
      }

      case 'track_create': {
        const blocked = guardWrite('track_create');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const address = args.type === 'midi'
          ? '/live/song/create_midi_track'
          : '/live/song/create_audio_track';
        const index = args.index ?? -1;
        await client.query(address, [index], TIMEOUTS.COMMAND);
        const [numTracks] = await client.query('/live/song/get/num_tracks');
        const newIndex = index === -1 ? numTracks - 1 : index;
        const snapshot = await buildTrackSnapshot(client, newIndex);
        return jsonResponse({ created: true, track: snapshot });
      }

      case 'track_delete': {
        const blocked = guardWrite('track_delete');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        if (!args.confirm) {
          const snapshot = await buildTrackSnapshot(client, trackIndex);
          setPendingDelete(trackIndex, snapshot);
          return jsonResponse({
            pending_delete: true,
            warning: 'Track will be permanently deleted. Call again with confirm=true to proceed.',
            track: snapshot
          });
        }

        const pending = getPendingDelete(trackIndex);
        if (!pending) {
          return errorResponse(
            'No pending delete for track ' + trackIndex +
            '. Call track_delete without confirm first to review track contents.'
          );
        }

        await client.query('/live/song/delete_track', [trackIndex], TIMEOUTS.COMMAND);
        clearPendingDelete(trackIndex);
        return jsonResponse({
          deleted: true,
          track_index: trackIndex,
          track_name: pending.name
        });
      }

      case 'track_select': {
        const blocked = guardWrite('track_select');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/view/set/selected_track', [trackIndex], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse({ selected: true, track: snapshot });
      }

      case 'track_set_arm': {
        const blocked = guardWrite('track_set_arm');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/track/set/arm', [trackIndex, args.armed ? 1 : 0], TIMEOUTS.COMMAND);
        const snapshot = await buildTrackSnapshot(client, trackIndex);
        return jsonResponse(snapshot);
      }

      case 'track_rename': {
        const blocked = guardWrite('track_rename');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/track/set/name', [trackIndex, args.name], TIMEOUTS.COMMAND);
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
