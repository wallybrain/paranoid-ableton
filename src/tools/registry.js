import * as health from './health.js';
import * as transport from './transport.js';
import * as track from './track.js';
import * as mixer from './mixer.js';
import * as scene from './scene.js';
import * as clip from './clip.js';
import * as sample from './sample.js';
import * as device from './device.js';
import * as session from './session.js';
import { ensureConnected } from './shared.js';
import { guardWrite, isReadOnly, setReadOnly } from './helpers.js';
import { TIMEOUTS } from '../osc-client.js';

const modules = [health, transport, track, mixer, scene, clip, sample, device, session];

const utilityTools = [
  {
    name: 'undo',
    description: 'Undo the last action in Ableton Live.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'redo',
    description: 'Redo the last undone action in Ableton Live.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'set_read_only',
    description: 'Toggle read-only mode. When enabled, all write operations are blocked. Useful for exploring a session without accidental changes.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'True to enable read-only mode, false to disable.' }
      },
      required: ['enabled']
    }
  },
  {
    name: 'batch_commands',
    description: 'Execute multiple tool calls in sequence. Reduces round-trips for multi-step operations. Results returned as array.',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: 'Tool name to call' },
              args: { type: 'object', description: 'Arguments for the tool' }
            },
            required: ['tool']
          },
          description: 'Array of tool calls to execute'
        },
        stop_on_error: {
          type: 'boolean',
          description: 'If true (default), stop on first failure. If false, continue all commands.',
          default: true
        }
      },
      required: ['commands']
    }
  }
];

export function getToolDefinitions() {
  const tools = [
    ...modules.flatMap(m => m.tools),
    ...utilityTools
  ];

  const seen = new Set();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      console.error(`WARNING: Duplicate tool name "${tool.name}" detected in registry`);
    }
    seen.add(tool.name);
  }

  return tools;
}

export async function handleToolCall(name, args) {
  // Utility tools handled directly
  switch (name) {
    case 'undo': {
      const guard = guardWrite('undo');
      if (guard) return guard;
      const client = await ensureConnected();
      await client.query('/live/song/undo', [], TIMEOUTS.COMMAND);
      return { content: [{ type: 'text', text: JSON.stringify({ undone: true }) }] };
    }
    case 'redo': {
      const guard = guardWrite('redo');
      if (guard) return guard;
      const client = await ensureConnected();
      await client.query('/live/song/redo', [], TIMEOUTS.COMMAND);
      return { content: [{ type: 'text', text: JSON.stringify({ redone: true }) }] };
    }
    case 'set_read_only': {
      setReadOnly(args.enabled);
      return { content: [{ type: 'text', text: JSON.stringify({ read_only: isReadOnly() }) }] };
    }
    case 'batch_commands': {
      const stopOnError = args.stop_on_error !== false;
      const results = [];
      for (const cmd of args.commands) {
        if (cmd.tool === 'batch_commands') {
          results.push({ tool: cmd.tool, success: false, error: 'BATCH_RECURSION: batch_commands cannot be nested' });
          if (stopOnError) break;
          continue;
        }
        try {
          const result = await handleToolCall(cmd.tool, cmd.args || {});
          const success = !result.isError;
          results.push({ tool: cmd.tool, success, result: JSON.parse(result.content[0].text) });
          if (!success && stopOnError) break;
        } catch (err) {
          results.push({ tool: cmd.tool, success: false, error: err.message });
          if (stopOnError) break;
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ batch_results: results, stopped_early: stopOnError && results.length < args.commands.length }) }] };
    }
  }

  // Domain module dispatch
  for (const mod of modules) {
    const result = await mod.handle(name, args);
    if (result !== null) return result;
  }

  return {
    content: [{ type: 'text', text: `UNKNOWN_TOOL: No handler for tool '${name}'` }],
    isError: true
  };
}
