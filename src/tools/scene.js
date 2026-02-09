import { ensureConnected } from './shared.js';
import { guardWrite, resolveTrackIndex } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

export const tools = [
  {
    name: 'scene_list',
    description: 'List all scenes with names. If include_clips is true (default), also shows which clip slots are populated across all tracks.',
    inputSchema: {
      type: 'object',
      properties: {
        include_clips: {
          type: 'boolean',
          description: 'Include clip slot population info per track (default true)'
        }
      },
      required: []
    }
  },
  {
    name: 'scene_launch',
    description: 'Launch a scene by index (0-based). All clips in the scene\'s row will be launched.',
    inputSchema: {
      type: 'object',
      properties: {
        scene: {
          type: 'integer',
          description: '0-based scene index'
        }
      },
      required: ['scene']
    }
  },
  {
    name: 'scene_stop',
    description: 'Stop all playing clips in the session.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'clip_launch',
    description: 'Launch a specific clip by track and scene position. Track by index or name, scene by 0-based index.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        scene: {
          type: 'integer',
          description: '0-based scene index'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'clip_stop',
    description: 'Stop a specific clip. Track by index or name, scene by 0-based index.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          description: 'Track index (0-based integer) or track name (string)'
        },
        scene: {
          type: 'integer',
          description: '0-based scene index'
        }
      },
      required: ['track', 'scene']
    }
  },
  {
    name: 'scene_create',
    description: 'Create a new empty scene. Specify index for position (0-based), or omit to append at end.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: '0-based insertion position. Omit or -1 to append at end.'
        }
      },
      required: []
    }
  },
  {
    name: 'scene_rename',
    description: 'Rename a scene by index (0-based).',
    inputSchema: {
      type: 'object',
      properties: {
        scene: {
          type: 'integer',
          description: '0-based scene index'
        },
        name: {
          type: 'string',
          description: 'New name for the scene'
        }
      },
      required: ['scene', 'name']
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
    content: [{ type: 'text', text: 'SCENE_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('scene_') && !name.startsWith('clip_')) return null;

  try {
    switch (name) {
      case 'scene_list': {
        const client = await ensureConnected();
        const [numScenes] = await client.query('/live/song/get/num_scenes');
        const [numTracks] = await client.query('/live/song/get/num_tracks');
        const includeClips = args.include_clips !== false;

        const scenes = [];
        for (let s = 0; s < numScenes; s++) {
          const [sceneName] = await client.query('/live/scene/get/name', [s]);
          const sceneData = { index: s, name: sceneName };

          if (includeClips) {
            const clips = [];
            for (let t = 0; t < numTracks; t++) {
              const [hasClip] = await client.query('/live/clip_slot/get/has_clip', [t, s]);
              if (hasClip) {
                const [trackName] = await client.query('/live/track/get/name', [t]);
                clips.push({ track_index: t, track_name: trackName });
              }
            }
            sceneData.clips = clips;
          }

          scenes.push(sceneData);
        }

        return jsonResponse({ scene_count: numScenes, track_count: numTracks, scenes });
      }

      case 'scene_launch': {
        const blocked = guardWrite('scene_launch');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/scene/fire', [args.scene], TIMEOUTS.COMMAND);
        return jsonResponse({ launched: true, scene: args.scene });
      }

      case 'scene_stop': {
        const blocked = guardWrite('scene_stop');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/stop_all_clips', [], TIMEOUTS.COMMAND);
        return jsonResponse({ stopped: true });
      }

      case 'clip_launch': {
        const blocked = guardWrite('clip_launch');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/clip/fire', [trackIndex, args.scene], TIMEOUTS.COMMAND);
        return jsonResponse({ launched: true, track: trackIndex, scene: args.scene });
      }

      case 'clip_stop': {
        const blocked = guardWrite('clip_stop');
        if (blocked) return blocked;
        const client = await ensureConnected();
        const trackIndex = await resolveTrackIndex(client, args.track);
        await client.query('/live/clip/stop', [trackIndex, args.scene], TIMEOUTS.COMMAND);
        return jsonResponse({ stopped: true, track: trackIndex, scene: args.scene });
      }

      case 'scene_create': {
        const blocked = guardWrite('scene_create');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/song/create_scene', [args.index ?? -1], TIMEOUTS.COMMAND);
        const [numScenes] = await client.query('/live/song/get/num_scenes');
        return jsonResponse({ created: true, total_scenes: numScenes });
      }

      case 'scene_rename': {
        const blocked = guardWrite('scene_rename');
        if (blocked) return blocked;
        const client = await ensureConnected();
        await client.query('/live/scene/set/name', [args.scene, args.name], TIMEOUTS.COMMAND);
        return jsonResponse({ renamed: true, scene: args.scene, name: args.name });
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
