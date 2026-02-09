import { ensureConnected } from './shared.js';
import { resolveTrackIndex, guardWrite, notesToFlatArray, flatArrayToNotes, validateNotes, buildClipSnapshot } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'clip_create',
    description: 'Create a new empty MIDI clip in a clip slot. Length is in beats (e.g., 4.0 = one bar at 4/4). Can only create on MIDI tracks in empty slots.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        length: {
          type: 'number',
          description: 'Clip length in beats (default 4.0)'
        },
        name: {
          type: 'string',
          description: 'Optional clip name'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_delete',
    description: 'Delete a clip from a clip slot.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_get',
    description: 'Get clip properties including name, length, loop points, whether it is a MIDI clip, and note count.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_set_name',
    description: 'Set the name of a clip.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        name: {
          type: 'string',
          description: 'New clip name'
        }
      },
      required: ['track', 'scene', 'name']
    }
  },
  {
    name: 'clip_add_notes',
    description: 'Add MIDI notes to an existing clip. Each note needs pitch (0-127, 60=C4 middle C), start_time (beats from clip start), duration (beats), velocity (1-127, default 100), and mute (default false). Notes are added to existing content -- they do not replace.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pitch: { type: 'integer', description: 'MIDI pitch 0-127 (60=C4)' },
              start_time: { type: 'number', description: 'Start time in beats from clip start' },
              duration: { type: 'number', description: 'Duration in beats' },
              velocity: { type: 'integer', description: 'Velocity 1-127 (default 100)' },
              mute: { type: 'boolean', description: 'Mute this note (default false)' }
            },
            required: ['pitch', 'start_time', 'duration']
          },
          description: 'Array of note objects to add'
        }
      },
      required: ['track', 'scene', 'notes']
    }
  },
  {
    name: 'clip_remove_notes',
    description: 'Remove MIDI notes from a clip by pitch and/or time range. WARNING: Omitting all filter parameters removes ALL notes from the clip.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        pitch_start: {
          type: 'integer',
          description: 'Minimum pitch, default 0'
        },
        pitch_span: {
          type: 'integer',
          description: 'Number of pitches from start, default 128 = all'
        },
        time_start: {
          type: 'number',
          description: 'Start time in beats, default 0'
        },
        time_span: {
          type: 'number',
          description: 'Time range in beats, default 16384 = all'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_get_notes',
    description: 'Read MIDI notes from a clip. Returns structured note objects with pitch, start_time, duration, velocity, mute. Optionally filter by pitch range and time range.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        pitch_start: {
          type: 'integer',
          description: 'Minimum pitch filter (default 0)'
        },
        pitch_span: {
          type: 'integer',
          description: 'Number of pitches from start (default 128 = all)'
        },
        time_start: {
          type: 'number',
          description: 'Start time filter in beats (default 0)'
        },
        time_span: {
          type: 'number',
          description: 'Time range filter in beats (default 16384 = all)'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_set_loop',
    description: 'Set clip loop properties. All time values in beats. Loop start must be less than loop end. When changing both, the order of operations is handled automatically to avoid constraint violations.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based) or name'
        },
        scene: {
          type: 'integer',
          description: '0-based scene/clip slot index'
        },
        loop_start: {
          type: 'number',
          description: 'Loop start in beats'
        },
        loop_end: {
          type: 'number',
          description: 'Loop end in beats'
        },
        looping: {
          type: 'boolean',
          description: 'Enable or disable looping'
        }
      },
      required: ['track', 'scene']
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
    content: [{ type: 'text', text: 'CLIP_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (name === 'clip_launch' || name === 'clip_stop') return null;
  if (!name.startsWith('clip_')) return null;

  try {
    switch (name) {
      case 'clip_create': {
        const blocked = guardWrite('clip_create');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        const [, , hasMidi] = await client.query('/live/track/get/has_midi_input', [trackIndex], TIMEOUTS.QUERY);
        if (!hasMidi) {
          return errorResponse('INVALID_TRACK: Track ' + trackIndex + ' is not a MIDI track. Can only create MIDI clips on MIDI tracks.');
        }

        const response = await client.query('/live/clip_slot/get/has_clip', [trackIndex, args.scene], TIMEOUTS.QUERY);
        const hasClip = response[2];
        if (hasClip) {
          return errorResponse('SLOT_NOT_EMPTY: Clip slot [' + trackIndex + ', ' + args.scene + '] already contains a clip. Delete it first or use a different slot.');
        }

        await client.query('/live/clip_slot/create_clip', [trackIndex, args.scene, args.length || 4.0], TIMEOUTS.COMMAND);

        if (args.name) {
          await client.query('/live/clip/set/name', [trackIndex, args.scene, args.name], TIMEOUTS.COMMAND);
        }

        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse(snapshot);
      }

      case 'clip_delete': {
        const blocked = guardWrite('clip_delete');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/clip_slot/delete_clip', [trackIndex, args.scene], TIMEOUTS.COMMAND);
        return jsonResponse({ deleted: true, track_index: trackIndex, clip_index: args.scene });
      }

      case 'clip_get': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse(snapshot);
      }

      case 'clip_set_name': {
        const blocked = guardWrite('clip_set_name');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/clip/set/name', [trackIndex, args.scene, args.name], TIMEOUTS.COMMAND);
        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse(snapshot);
      }

      case 'clip_add_notes': {
        const blocked = guardWrite('clip_add_notes');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        validateNotes(args.notes);
        const flat = notesToFlatArray(args.notes);

        const CHUNK_SIZE = 100;
        if (args.notes.length > CHUNK_SIZE) {
          for (let i = 0; i < flat.length; i += CHUNK_SIZE * 5) {
            const chunk = flat.slice(i, i + CHUNK_SIZE * 5);
            await client.query('/live/clip/add/notes', [trackIndex, args.scene, ...chunk], TIMEOUTS.COMMAND);
          }
        } else {
          await client.query('/live/clip/add/notes', [trackIndex, args.scene, ...flat], TIMEOUTS.COMMAND);
        }

        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse({ ...snapshot, notes_added: args.notes.length });
      }

      case 'clip_remove_notes': {
        const blocked = guardWrite('clip_remove_notes');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        const hasFilter = args.pitch_start !== undefined || args.pitch_span !== undefined ||
                          args.time_start !== undefined || args.time_span !== undefined;

        if (hasFilter) {
          await client.query('/live/clip/remove/notes', [
            trackIndex, args.scene,
            args.pitch_start !== undefined ? args.pitch_start : 0,
            args.pitch_span !== undefined ? args.pitch_span : 128,
            args.time_start !== undefined ? args.time_start : 0,
            args.time_span !== undefined ? args.time_span : 16384
          ], TIMEOUTS.COMMAND);
        } else {
          await client.query('/live/clip/remove/notes', [trackIndex, args.scene], TIMEOUTS.COMMAND);
        }

        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse(snapshot);
      }

      case 'clip_get_notes': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        const hasFilter = args.pitch_start !== undefined || args.pitch_span !== undefined ||
                          args.time_start !== undefined || args.time_span !== undefined;

        let response;
        if (hasFilter) {
          response = await client.query('/live/clip/get/notes', [
            trackIndex, args.scene,
            args.pitch_start !== undefined ? args.pitch_start : 0,
            args.pitch_span !== undefined ? args.pitch_span : 128,
            args.time_start !== undefined ? args.time_start : 0,
            args.time_span !== undefined ? args.time_span : 16384
          ], TIMEOUTS.QUERY);
        } else {
          response = await client.query('/live/clip/get/notes', [trackIndex, args.scene], TIMEOUTS.QUERY);
        }

        const noteData = response.slice(2);
        const notes = flatArrayToNotes(noteData);
        return jsonResponse({ track_index: trackIndex, clip_index: args.scene, note_count: notes.length, notes });
      }

      case 'clip_set_loop': {
        const blocked = guardWrite('clip_set_loop');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);

        if (args.loop_start === undefined && args.loop_end === undefined && args.looping === undefined) {
          return errorResponse('MISSING_PARAMS: At least one of loop_start, loop_end, or looping must be provided.');
        }

        if (args.looping !== undefined) {
          await client.query('/live/clip/set/looping', [trackIndex, args.scene, args.looping ? 1 : 0], TIMEOUTS.COMMAND);
        }

        if (args.loop_start !== undefined && args.loop_end !== undefined) {
          const [, , currentLoopEnd] = await client.query('/live/clip/get/loop_end', [trackIndex, args.scene], TIMEOUTS.QUERY);
          if (args.loop_end > currentLoopEnd) {
            await client.query('/live/clip/set/loop_end', [trackIndex, args.scene, args.loop_end], TIMEOUTS.COMMAND);
            await client.query('/live/clip/set/loop_start', [trackIndex, args.scene, args.loop_start], TIMEOUTS.COMMAND);
          } else {
            await client.query('/live/clip/set/loop_start', [trackIndex, args.scene, args.loop_start], TIMEOUTS.COMMAND);
            await client.query('/live/clip/set/loop_end', [trackIndex, args.scene, args.loop_end], TIMEOUTS.COMMAND);
          }
        } else if (args.loop_start !== undefined) {
          await client.query('/live/clip/set/loop_start', [trackIndex, args.scene, args.loop_start], TIMEOUTS.COMMAND);
        } else if (args.loop_end !== undefined) {
          await client.query('/live/clip/set/loop_end', [trackIndex, args.scene, args.loop_end], TIMEOUTS.COMMAND);
        }

        const snapshot = await buildClipSnapshot(client, trackIndex, args.scene);
        return jsonResponse(snapshot);
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
