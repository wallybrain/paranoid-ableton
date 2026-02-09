import { scanLibrary, getScanStatus } from '../sample-index/scanner.js';
import { loadIndex, search, getStats, getEntryByPath } from '../sample-index/index-store.js';

export const tools = [
  {
    name: 'sample_scan',
    description: 'Scan sample directories and build/update the metadata index. Extracts duration, format, BPM, key, instrument type, and character tags from file metadata and filenames. First scan builds the full index; subsequent scans skip unchanged files (incremental). Use force=true to rescan everything.',
    inputSchema: {
      type: 'object',
      properties: {
        directories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute paths to scan. Example: ["/home/user/Music/Samples", "/home/user/Music/Ableton/User Library/Samples"]'
        },
        force: {
          type: 'boolean',
          description: 'Force full rescan ignoring cache (default false)',
          default: false
        }
      },
      required: ['directories']
    }
  },
  {
    name: 'sample_search',
    description: 'Search the sample index by instrument type, musical key, BPM range, text query, character/vibe, format, or duration. All filters are optional and combined with AND logic. Returns up to 50 results by default.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument_type: {
          type: 'string',
          enum: ['kick', 'snare', 'hihat', 'cymbal', 'perc', 'bass', 'synth', 'keys', 'guitar', 'vocal', 'fx', 'loop'],
          description: 'Filter by instrument classification'
        },
        key: {
          type: 'string',
          description: 'Musical key, e.g. "Cmin", "F#maj", "Am"'
        },
        bpm_min: {
          type: 'number',
          description: 'Minimum BPM (inclusive)'
        },
        bpm_max: {
          type: 'number',
          description: 'Maximum BPM (inclusive)'
        },
        text: {
          type: 'string',
          description: 'Substring search in filename and path'
        },
        character: {
          type: 'string',
          description: 'Vibe/character tag, e.g. "punchy", "dark", "warm"'
        },
        format: {
          type: 'string',
          description: 'File format, e.g. "wav", "aiff", "flac"'
        },
        min_duration_ms: {
          type: 'number',
          description: 'Minimum duration in milliseconds'
        },
        max_duration_ms: {
          type: 'number',
          description: 'Maximum duration in milliseconds'
        },
        limit: {
          type: 'integer',
          description: 'Max results to return (default 50)',
          default: 50
        }
      },
      required: []
    }
  },
  {
    name: 'sample_get_stats',
    description: 'Get statistics about the current sample index: total count, breakdown by instrument type, format, and scan root directory.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'sample_load',
    description: 'Get the file path for a sample to load into Ableton. Currently returns the absolute path for manual drag-and-drop into a track. Future versions will load directly via AbletonOSC browser API when available.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the sample file (from search results)'
        },
        track: {
          description: 'Target track index or name -- reserved for future use when direct loading is supported'
        }
      },
      required: ['path']
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
    content: [{ type: 'text', text: 'SAMPLE_ERROR: ' + message }],
    isError: true
  };
}

export async function handle(name, args) {
  if (!name.startsWith('sample_')) return null;

  try {
    switch (name) {
      case 'sample_scan': {
        const result = await scanLibrary(args.directories, { force: args.force || false });
        return jsonResponse(result);
      }

      case 'sample_search': {
        await loadIndex();
        const stats = getStats();
        if (stats.total_samples === 0) {
          return jsonResponse({ hint: 'No samples indexed yet. Run sample_scan first.' });
        }
        const results = search(args);
        return jsonResponse({ result_count: results.length, results });
      }

      case 'sample_get_stats': {
        await loadIndex();
        const stats = getStats();
        const scanStatus = getScanStatus();
        return jsonResponse({ ...stats, scan_status: scanStatus });
      }

      case 'sample_load': {
        await loadIndex();
        const entry = getEntryByPath(args.path);
        if (!entry) {
          return errorResponse('SAMPLE_NOT_FOUND: Sample not in index. Run sample_search to find available samples.');
        }
        return jsonResponse({
          path: entry.path,
          filename: entry.filename,
          duration_ms: entry.duration_ms,
          instrument_type: entry.instrument_type,
          instructions: `Drag this file into the desired Ableton track: ${entry.path}`
        });
      }

      default:
        return null;
    }
  } catch (err) {
    return errorResponse(err.message);
  }
}
