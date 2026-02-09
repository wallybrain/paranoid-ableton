import { ensureConnected } from './shared.js';
import { buildSessionSnapshot, buildSessionStats } from './helpers.js';

export const tools = [
  {
    name: 'session_snapshot',
    description: 'Get a complete session state snapshot including transport, all tracks with clips, devices, routing, and grouping. Use this to understand the full session context before making creative decisions. Does NOT include device parameters or note data (use device_get_parameters and clip_get_notes for those). Return tracks and master track are not included (AbletonOSC limitation).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'session_stats',
    description: 'Get aggregate project statistics: track counts by type (midi/audio/group), total clip count, device chain summary, tempo, and time signature. Lightweight alternative to full snapshot when you only need counts and overview.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
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
    content: [{ type: 'text', text: 'SESSION_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('session_')) return null;

  try {
    switch (name) {
      case 'session_snapshot': {
        const client = await ensureConnected();
        const snapshot = await buildSessionSnapshot(client);
        return jsonResponse(snapshot);
      }

      case 'session_stats': {
        const client = await ensureConnected();
        const stats = await buildSessionStats(client);
        return jsonResponse(stats);
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
