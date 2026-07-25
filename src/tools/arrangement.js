import { ensureConnected } from './shared.js';
import { resolveTrackIndex, guardWrite } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

// Requires the custom AbletonOSC extension (not in mainline AbletonOSC) --
// see README Limitations. Tools will time out on a stock AbletonOSC install.

export const tools = [
  {
    name: 'arrangement_list_cue_points',
    description: 'List all cue points (locators) in the arrangement, with their time (in beats) and name. Requires the custom AbletonOSC extension.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'arrangement_add_cue_point',
    description: 'Add a cue point (locator) at the given arrangement time. Briefly moves the playhead there and back. If a cue point already exists at that exact time, this removes it instead (Live\'s own toggle behavior). Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'number', description: 'Arrangement position in beats' }
      },
      required: ['time']
    }
  },
  {
    name: 'arrangement_delete_cue_point',
    description: 'Delete a cue point (locator) by index. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: '0-based cue point index, from arrangement_list_cue_points' }
      },
      required: ['index']
    }
  },
  {
    name: 'arrangement_rename_cue_point',
    description: 'Rename a cue point (locator) by index. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: '0-based cue point index' },
        name: { type: 'string' }
      },
      required: ['index', 'name']
    }
  },
  {
    name: 'arrangement_jump_to_cue_point',
    description: 'Move the arrangement playhead to a cue point by index. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: '0-based cue point index' }
      },
      required: ['index']
    }
  },
  {
    name: 'arrangement_list_clips',
    description: 'List clips placed in a track\'s arrangement timeline (as opposed to session clip slots), with start_time, end_time, length, name, and whether each is a MIDI clip. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { description: 'Track index (0-based) or name' }
      },
      required: ['track']
    }
  },
  {
    name: 'arrangement_duplicate_clip',
    description: 'Duplicate an existing session clip into a track\'s arrangement timeline at the given time. Source and destination track may be the same or different. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { description: 'Destination track index (0-based) or name' },
        source_track: { description: 'Source track index (0-based) or name -- where the session clip lives' },
        source_scene: { type: 'integer', description: '0-based scene/clip slot index of the source session clip' },
        time: { type: 'number', description: 'Destination position in the arrangement, in beats' }
      },
      required: ['track', 'source_track', 'source_scene', 'time']
    }
  },
  {
    name: 'arrangement_create_midi_clip',
    description: 'Create a new empty MIDI clip directly in a track\'s arrangement timeline. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { description: 'Track index (0-based) or name' },
        time: { type: 'number', description: 'Position in the arrangement, in beats' },
        length: { type: 'number', description: 'Clip length in beats' }
      },
      required: ['track', 'time', 'length']
    }
  },
  {
    name: 'arrangement_delete_clip',
    description: 'Delete a clip from a track\'s arrangement timeline by index (from arrangement_list_clips). Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { description: 'Track index (0-based) or name' },
        clip_index: { type: 'integer', description: '0-based index into the track\'s arrangement clips, from arrangement_list_clips' }
      },
      required: ['track', 'clip_index']
    }
  },
  {
    name: 'arrangement_rename_clip',
    description: 'Rename a clip in a track\'s arrangement timeline by index. Requires the custom AbletonOSC extension.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { description: 'Track index (0-based) or name' },
        clip_index: { type: 'integer', description: '0-based index into the track\'s arrangement clips' },
        name: { type: 'string' }
      },
      required: ['track', 'clip_index', 'name']
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
    content: [{ type: 'text', text: 'ARRANGEMENT_ERROR: ' + message }],
    isError: true
  };
}

function parseCuePoints(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 3) {
    points.push({ index: flat[i], time: flat[i + 1], name: flat[i + 2] });
  }
  return points;
}

function parseArrangementClips(flat) {
  const clips = [];
  for (let i = 0; i < flat.length; i += 6) {
    clips.push({
      index: flat[i],
      start_time: flat[i + 1],
      end_time: flat[i + 2],
      length: flat[i + 3],
      name: flat[i + 4],
      is_midi: !!flat[i + 5]
    });
  }
  return clips;
}

export async function handle(name, args) {
  if (!name.startsWith('arrangement_')) return null;

  try {
    switch (name) {
      case 'arrangement_list_cue_points': {
        const client = await ensureConnected();
        const flat = await client.query('/live/song/get/cue_points', [], TIMEOUTS.QUERY);
        return jsonResponse({ cue_point_count: flat.length / 3, cue_points: parseCuePoints(flat) });
      }

      case 'arrangement_add_cue_point': {
        const blocked = guardWrite('arrangement_add_cue_point');
        if (blocked) return blocked;
        const client = await ensureConnected();
        client.send('/live/song/add/cue_point', [args.time]);
        return jsonResponse({ time: args.time, requested: true });
      }

      case 'arrangement_delete_cue_point': {
        const blocked = guardWrite('arrangement_delete_cue_point');
        if (blocked) return blocked;
        const client = await ensureConnected();
        client.send('/live/song/delete/cue_point', [args.index]);
        return jsonResponse({ index: args.index, deleted: true });
      }

      case 'arrangement_rename_cue_point': {
        const blocked = guardWrite('arrangement_rename_cue_point');
        if (blocked) return blocked;
        const client = await ensureConnected();
        client.send('/live/song/set/cue_point/name', [args.index, args.name]);
        return jsonResponse({ index: args.index, name: args.name });
      }

      case 'arrangement_jump_to_cue_point': {
        const blocked = guardWrite('arrangement_jump_to_cue_point');
        if (blocked) return blocked;
        const client = await ensureConnected();
        client.send('/live/song/jump/cue_point', [args.index]);
        return jsonResponse({ index: args.index, jumped: true });
      }

      case 'arrangement_list_clips': {
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const [, ...flat] = await client.query('/live/track/get/arrangement_clips', [trackIndex], TIMEOUTS.QUERY);
        return jsonResponse({
          track_index: trackIndex,
          clip_count: flat.length / 6,
          clips: parseArrangementClips(flat)
        });
      }

      case 'arrangement_duplicate_clip': {
        const blocked = guardWrite('arrangement_duplicate_clip');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        const sourceTrackIndex = await resolveTrackIndex(client, args.source_track);
        client.send('/live/track/duplicate_clip_to_arrangement', [trackIndex, sourceTrackIndex, args.source_scene, args.time]);
        return jsonResponse({ track_index: trackIndex, source_track_index: sourceTrackIndex, source_scene: args.source_scene, time: args.time });
      }

      case 'arrangement_create_midi_clip': {
        const blocked = guardWrite('arrangement_create_midi_clip');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        client.send('/live/track/create_arrangement_midi_clip', [trackIndex, args.time, args.length]);
        return jsonResponse({ track_index: trackIndex, time: args.time, length: args.length });
      }

      case 'arrangement_delete_clip': {
        const blocked = guardWrite('arrangement_delete_clip');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        client.send('/live/track/delete_arrangement_clip', [trackIndex, args.clip_index]);
        return jsonResponse({ track_index: trackIndex, clip_index: args.clip_index, deleted: true });
      }

      case 'arrangement_rename_clip': {
        const blocked = guardWrite('arrangement_rename_clip');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        client.send('/live/track/set/arrangement_clip_name', [trackIndex, args.clip_index, args.name]);
        return jsonResponse({ track_index: trackIndex, clip_index: args.clip_index, name: args.name });
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
