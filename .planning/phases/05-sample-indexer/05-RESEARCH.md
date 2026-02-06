# Phase 5: Sample Indexer - Research

**Researched:** 2026-02-06
**Domain:** Audio metadata extraction, file system scanning, in-memory indexing, Ableton browser integration
**Confidence:** HIGH (metadata extraction), MEDIUM (AbletonOSC sample loading), HIGH (indexing strategy)

## Summary

Phase 5 builds a metadata-driven sample library search system. The core challenge decomposes into three parts: (1) scanning user sample directories and extracting metadata from audio files, (2) indexing that metadata for fast search, and (3) loading found samples into Ableton tracks.

For scanning and metadata extraction, the `music-metadata` npm library is the standard choice -- it supports WAV, AIFF, FLAC, MP3, and more, extracting duration, sample rate, bit depth, and embedded tag fields including BPM (TBPM) and key (TKEY). However, most sample pack files have no embedded BPM/key tags, so the system must rely heavily on filename and folder path heuristics to extract instrument type, BPM, and key information.

For indexing, an in-memory JavaScript Map/Array approach is sufficient for 10k+ entries with sub-100ms search. Filtering 10,000 plain objects by multiple fields easily runs under 10ms in V8. No database (SQLite, etc.) is needed -- a JSON file on disk provides persistence, loaded into memory at search time. This keeps the dependency count low and avoids native addon compilation.

For loading samples into Ableton, AbletonOSC currently has NO built-in endpoint for loading audio files by file path. There is an open PR (#183) adding `/live/browser/load_sample` which searches Ableton's internal browser by name, but this only finds samples already indexed by Ableton's browser, not arbitrary files on disk. The SAMP-03 requirement (load found samples into tracks) will need a pragmatic workaround: return the file path so the user can drag-drop, or wait for AbletonOSC browser API maturity.

**Primary recommendation:** Build a standalone sample indexer module (no OSC dependency) with music-metadata for file parsing, filename/path heuristics for classification, and in-memory JSON index for fast search. Defer true "load sample into track" to Phase 8 when AbletonOSC browser support matures.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| music-metadata | ^11.10 | Audio file metadata extraction (duration, format, tags) | 960+ dependents, supports all major audio formats, ESM, Node 18+ |
| Node.js fs/path | built-in | Recursive directory scanning | `fs.readdir` with `recursive: true` available in Node 20.1+ |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | In-memory index | Plain JS arrays + Map, JSON.stringify/parse for persistence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| music-metadata | wav-file-info + manual parsing | music-metadata handles ALL formats; wav-file-info is WAV-only |
| In-memory JSON index | better-sqlite3 | SQLite adds native addon compilation, 10k entries doesn't need it |
| In-memory JSON index | FlexSearch/Fuse.js | Fuzzy search libraries are overkill -- structured field filtering is what we need |
| fs.readdir recursive | fdir, readdirp | Native is fast enough for 10k files, zero dependencies |

**Installation:**
```bash
npm install music-metadata
```

Single new dependency. Everything else is built-in Node.js.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── tools/
│   ├── sample.js          # Domain module: MCP tools (sample_scan, sample_search, sample_get)
│   └── registry.js        # Add sample module to modules[]
├── sample-index/
│   ├── scanner.js          # File system walker + metadata extractor
│   ├── classifier.js       # Filename/path heuristic classifier
│   └── index-store.js      # In-memory index with JSON persistence
└── ...
```

### Pattern 1: Domain Module (Consistent with Phases 2-4)
**What:** sample.js follows the same pattern as transport.js, track.js, clip.js
**When to use:** Always -- this is the established project convention
**Example:**
```javascript
// src/tools/sample.js
import { scanLibrary, searchIndex, getIndexStats } from '../sample-index/scanner.js';

export const tools = [
  {
    name: 'sample_scan',
    description: 'Scan sample directories and build/update the metadata index.',
    inputSchema: {
      type: 'object',
      properties: {
        directories: { type: 'array', items: { type: 'string' }, description: 'Directories to scan' },
        force: { type: 'boolean', description: 'Force full rescan (ignore cache)', default: false }
      },
      required: ['directories']
    }
  },
  {
    name: 'sample_search',
    description: 'Search indexed samples by instrument type, key, BPM range, or text query.',
    inputSchema: { /* ... */ }
  },
  // ...
];

export async function handle(name, args) {
  switch (name) {
    case 'sample_scan': return handleScan(args);
    case 'sample_search': return handleSearch(args);
    // ...
    default: return null;
  }
}
```

### Pattern 2: Async Background Scanning (Non-Blocking)
**What:** Scanning runs asynchronously, reports progress, never blocks server startup or other tools
**When to use:** Always for scan operations
**Example:**
```javascript
// Scanner tracks state so concurrent scans don't collide
let scanInProgress = false;
let lastScanResult = null;

async function scanLibrary(directories, options = {}) {
  if (scanInProgress) {
    return { status: 'already_scanning', message: 'A scan is already in progress' };
  }
  scanInProgress = true;
  try {
    const results = { scanned: 0, indexed: 0, errors: 0, skipped: 0 };
    for (const dir of directories) {
      await scanDirectory(dir, results, options);
    }
    await saveIndex();
    lastScanResult = results;
    return { status: 'complete', ...results };
  } finally {
    scanInProgress = false;
  }
}
```

### Pattern 3: Multi-Source Metadata Merging
**What:** Combine embedded tags, filename parsing, and folder path analysis
**When to use:** For every scanned file
**Priority order:**
1. Embedded metadata (TBPM, TKEY from ID3v2/Vorbis tags) -- highest trust
2. Filename parsing (e.g., `kick_120bpm_Cmin.wav`) -- common in sample packs
3. Folder path analysis (e.g., `.../Drums/Kicks/...`) -- instrument type classification
4. File properties (duration, sample rate) -- always available from file header

### Anti-Patterns to Avoid
- **Scanning at server startup:** Never. The MCP server must start instantly. Scanning is only triggered by explicit `sample_scan` tool call.
- **Relying solely on embedded metadata:** Most sample pack files have NO embedded BPM/key tags. Filename parsing is essential.
- **Using SQLite for 10k entries:** Overkill. Adds native compilation dependency. In-memory JSON is faster and simpler for this scale.
- **Blocking on individual file parse errors:** One corrupt file should not abort the entire scan. Log and skip.
- **Absolute-only paths in the index:** Store both absolute path and path relative to the scan root directory for portability (Pitfall #15 from prior research).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio file format detection | Custom WAV/AIFF/FLAC header parsers | `music-metadata` parseFile() | Handles 20+ formats, edge cases in chunk parsing, ID3v2.4 etc. |
| Recursive directory walking | Custom fs.readdir recursion | `fs.promises.readdir(dir, { recursive: true })` | Built into Node 20, handles symlinks and edge cases |
| BPM detection from audio waveform | Custom beat detection algorithm | Don't -- extract from tags/filename only | Audio-analysis BPM detection requires Web Audio API or native code, unreliable for one-shots, massive performance cost |
| Musical key detection from audio | Pitch detection + key estimation | Don't -- extract from tags/filename only | Same rationale as BPM -- this is audio analysis, not metadata extraction |
| Full-text fuzzy search | Custom string matching | Simple includes/startsWith on fields | Structured field search (BPM range, key match) is what we need, not fuzzy text |

**Key insight:** This phase is about *metadata indexing*, not *audio analysis*. BPM and key come from tags and filenames, not from analyzing audio waveforms. Audio analysis (beat detection, pitch detection) is out of scope, would require heavy native dependencies, and is unreliable for short one-shot samples.

## Common Pitfalls

### Pitfall 1: Empty Metadata Fields (Prior Research Pitfall #7)
**What goes wrong:** Most sample pack WAV/AIFF files have zero embedded metadata tags. BPM, key, instrument type are all null.
**Why it happens:** Sample pack producers rarely embed ID3/Vorbis tags in individual samples. WAV files have limited tag support.
**How to avoid:** Build a robust filename+path classifier as the primary metadata source. Embedded tags are a bonus, not the baseline.
**Warning signs:** After scanning, >90% of entries have null BPM/key/instrument_type.

### Pitfall 2: Scan Performance Blocking Server (Prior Research Pitfall #6)
**What goes wrong:** Scanning 10k files takes 30-60 seconds. If synchronous, the MCP server becomes unresponsive.
**Why it happens:** Each file requires disk I/O for metadata extraction. music-metadata opens and reads file headers.
**How to avoid:** Run scanning in an async loop with periodic `await` yields. Use a concurrency limiter (e.g., 10 files at a time). Never block the event loop.
**Warning signs:** Other MCP tools timeout during a scan operation.

### Pitfall 3: Filename Convention Variance
**What goes wrong:** Classifier assumes one naming convention but user's library uses different patterns.
**Why it happens:** No industry standard for sample filenames. `Kick_01.wav`, `BD_808.wav`, `kick-dry-punchy.wav` are all valid.
**How to avoid:** Build an extensible keyword dictionary with multiple aliases per instrument type. Support common BPM patterns: `120bpm`, `120_bpm`, `120BPM`, `bpm120`, `_120_` (when between 60-200). Support key patterns: `Cmin`, `C#m`, `Cmaj`, `C_minor`, `Am`, `Aminor`.
**Warning signs:** Search for "kick" returns 0 results despite user having kick samples.

### Pitfall 4: AbletonOSC Cannot Load Files by Path
**What goes wrong:** User expects `sample_load` to put a sample directly into an Ableton track, but AbletonOSC has no endpoint for loading audio files by filesystem path.
**Why it happens:** The AbletonOSC Browser API is still in development (PR #183 not merged). Even when merged, `/live/browser/load_sample` searches Ableton's internal browser by name, not by arbitrary file path.
**How to avoid:** For SAMP-03, provide two approaches: (1) Return the full file path for manual drag-drop, and (2) If AbletonOSC PR #173 or #183 is merged, attempt to load via browser search by sample name. Make loading a best-effort operation with clear messaging when it falls back to "here's the path."
**Warning signs:** `sample_load` always fails with "not found in browser."

### Pitfall 5: Concurrent Scan Corruption
**What goes wrong:** User triggers sample_scan twice simultaneously, corrupting the index file.
**Why it happens:** Two scans writing to the same JSON file at the same time.
**How to avoid:** Use a `scanInProgress` flag. Return an error if a scan is already running. One scan at a time.
**Warning signs:** Index file is truncated or has malformed JSON.

### Pitfall 6: Large Index Memory Footprint
**What goes wrong:** 10k entries with full metadata consume excessive memory.
**Why it happens:** Storing too much data per entry (full embedded tags, album art, etc.).
**How to avoid:** Store only essential fields per entry: path, relative_path, filename, extension, duration_ms, sample_rate, bpm, key, instrument_type, character_tags, file_size, mtime. Estimate: ~500 bytes/entry = 5MB for 10k entries. Well within reason.
**Warning signs:** Node.js heap grows significantly after loading index.

## Code Examples

### Scanning a File with music-metadata
```javascript
// Source: music-metadata official docs + GitHub README
import { parseFile } from 'music-metadata';

async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath, { duration: true, skipCovers: true });
    return {
      duration_ms: metadata.format.duration ? Math.round(metadata.format.duration * 1000) : null,
      sample_rate: metadata.format.sampleRate || null,
      bit_depth: metadata.format.bitsPerSample || null,
      codec: metadata.format.codec || null,
      channels: metadata.format.numberOfChannels || null,
      // Embedded tags (often null for samples)
      bpm: metadata.common.bpm || null,
      key: metadata.common.key || null,
      genre: metadata.common.genre?.[0] || null,
    };
  } catch (err) {
    // Corrupt or unsupported file -- return minimal info
    return { error: err.message };
  }
}
```

### Recursive Directory Scan (Node 20 native)
```javascript
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac', '.mp3', '.ogg', '.m4a']);

async function findAudioFiles(directory) {
  const entries = await readdir(directory, { recursive: true });
  return entries
    .filter(entry => AUDIO_EXTENSIONS.has(extname(entry).toLowerCase()))
    .map(entry => join(directory, entry));
}
```

### Filename/Path Classifier
```javascript
const INSTRUMENT_KEYWORDS = {
  kick:    ['kick', 'kck', 'bd', 'bassdrum', 'bass_drum', 'bass-drum'],
  snare:   ['snare', 'snr', 'sd', 'clap'],
  hihat:   ['hihat', 'hh', 'hat', 'hi-hat', 'hi_hat', 'open_hat', 'closed_hat', 'oh', 'ch'],
  cymbal:  ['cymbal', 'crash', 'ride', 'splash'],
  perc:    ['perc', 'percussion', 'shaker', 'tambourine', 'conga', 'bongo', 'tom'],
  bass:    ['bass', 'sub', '808'],
  synth:   ['synth', 'lead', 'pad', 'pluck', 'arp', 'stab', 'chord'],
  keys:    ['piano', 'keys', 'rhodes', 'organ', 'electric_piano', 'ep'],
  guitar:  ['guitar', 'gtr', 'acoustic', 'electric_guitar'],
  vocal:   ['vocal', 'vox', 'voice', 'acapella', 'choir'],
  fx:      ['fx', 'sfx', 'effect', 'riser', 'sweep', 'impact', 'downlifter', 'uplifter', 'noise', 'texture', 'atmosphere', 'atmos', 'ambient'],
  loop:    ['loop', 'break', 'breakbeat', 'drum_loop', 'top_loop'],
};

// BPM extraction: match patterns like "120bpm", "120_bpm", "bpm120", "_120_"
const BPM_PATTERNS = [
  /(\d{2,3})\s*bpm/i,           // "120bpm", "120 BPM"
  /bpm\s*(\d{2,3})/i,           // "bpm120"
  /[_\-](\d{2,3})[_\-]/,        // "_120_" (between delimiters, 60-200 range checked after)
];

// Key extraction: match "Cmin", "C#m", "Cmaj", "Am", "Gb", "F#minor"
const KEY_PATTERN = /\b([A-G][#b]?)\s*(min(?:or)?|maj(?:or)?|m(?!\w))\b/i;

function classifyFromPath(filePath) {
  const lower = filePath.toLowerCase();
  const parts = lower.split(/[\\/]/);
  const filename = parts[parts.length - 1];

  // Instrument type: check filename first, then folder path
  let instrument_type = null;
  for (const [type, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      instrument_type = type;
      break;
    }
  }

  // BPM from filename
  let bpm = null;
  for (const pattern of BPM_PATTERNS) {
    const match = filename.match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 40 && val <= 300) { bpm = val; break; }
    }
  }

  // Key from filename
  let key = null;
  const keyMatch = filename.match(KEY_PATTERN);
  if (keyMatch) {
    key = keyMatch[1] + (keyMatch[2].startsWith('m') ? 'min' : 'maj');
  }

  return { instrument_type, bpm, key };
}
```

### In-Memory Index with JSON Persistence
```javascript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const INDEX_PATH = join(process.cwd(), 'data', 'sample-index.json');

let index = [];  // Array of sample entry objects
let indexByPath = new Map();  // path -> entry for dedup/lookup

async function loadIndex() {
  try {
    const data = await readFile(INDEX_PATH, 'utf-8');
    index = JSON.parse(data);
    indexByPath = new Map(index.map(e => [e.path, e]));
  } catch {
    index = [];
    indexByPath = new Map();
  }
}

async function saveIndex() {
  await mkdir(dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
}

function search(query) {
  let results = index;

  if (query.instrument_type) {
    results = results.filter(e => e.instrument_type === query.instrument_type);
  }
  if (query.key) {
    results = results.filter(e => e.key === query.key);
  }
  if (query.bpm_min != null || query.bpm_max != null) {
    results = results.filter(e => {
      if (e.bpm == null) return false;
      if (query.bpm_min != null && e.bpm < query.bpm_min) return false;
      if (query.bpm_max != null && e.bpm > query.bpm_max) return false;
      return true;
    });
  }
  if (query.text) {
    const lower = query.text.toLowerCase();
    results = results.filter(e => e.filename.toLowerCase().includes(lower) || (e.path && e.path.toLowerCase().includes(lower)));
  }
  if (query.format) {
    results = results.filter(e => e.extension === query.format.toLowerCase());
  }

  return results.slice(0, query.limit || 50);
}
```

### Incremental Scanning (Skip Unchanged Files)
```javascript
import { stat } from 'node:fs/promises';

async function shouldRescan(filePath, existingEntry) {
  if (!existingEntry) return true;
  try {
    const stats = await stat(filePath);
    return stats.mtimeMs !== existingEntry.mtime_ms;
  } catch {
    return false; // file gone, will be cleaned up separately
  }
}
```

## AbletonOSC Sample Loading: Current State

### What Exists Now (master branch)
- NO endpoint for loading audio files by file path
- NO Browser API support at all
- Clip `file_path` property is read-only in the LOM API

### What's In Progress (Open PRs, NOT merged)
| PR | Endpoint | What It Does | Status |
|----|----------|-------------|--------|
| #173 | `/live/track/insert_device <track> <name>` | Load instruments/effects by name from browser | Open, tested |
| #183 | `/live/browser/load_sample <name>` | Search Ableton's browser samples by name and load | Open, tested |
| #183 | `/live/browser/search <query>` | Search across all browser categories | Open, tested |

### Critical Limitation for SAMP-03
Even PR #183's `/live/browser/load_sample` searches Ableton's **internal browser index** by name, NOT by filesystem path. A sample in `/home/lwb3/samples/kicks/kick_01.wav` would only be found if that directory is already added to Ableton's browser Places and the name matches.

### Recommended Approach for SAMP-03
1. **Phase 5 (now):** Build `sample_load` tool that returns the file path and instructions for the user. This is immediately useful -- Claude can tell the user exactly which file to drag into which track.
2. **Phase 8 (later):** When AbletonOSC browser API matures (PRs merge), add true browser-based loading. The sample indexer's search results feed directly into browser load calls.
3. **Alternative for Phase 5:** If AbletonOSC browser PRs are merged by the time Phase 5 is implemented, use `/live/browser/load_sample <filename>` as a best-effort loader.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| better-sqlite3 for sample index | In-memory JSON (for 10k scale) | Always was fine for this scale | No native compilation needed |
| Custom recursive readdir | `fs.readdir({ recursive: true })` | Node 20.1 (Q2 2023) | Zero-dependency directory walking |
| music-metadata CJS | music-metadata ESM (v8+) | 2024 | Must use `import`, not `require()` |
| musicmetadata (old package) | music-metadata (Borewit) | 2019+ | Old package unmaintained, new one actively updated |

**Deprecated/outdated:**
- `musicmetadata` npm package: Abandoned, replaced by `music-metadata`
- `wav-file-info`: WAV-only, limited metadata
- `node-id3`: ID3 tags only, doesn't handle WAV/AIFF

## MCP Tool Design

Based on the established project patterns and SAMP-01/02/03 requirements:

| Tool | Purpose | Requires OSC? |
|------|---------|---------------|
| `sample_scan` | Scan directories, extract metadata, build index | No |
| `sample_search` | Search index by instrument, key, BPM, text | No |
| `sample_get_stats` | Get index statistics (count, instrument distribution, formats) | No |
| `sample_load` | Load a sample into a track (best-effort via browser or return path) | Yes (optional, graceful fallback) |

### Tool Count Impact
Current: ~40 tools (transport:10, track:6, mixer:8, scene:7, clip:8, utility:4, health:1)
Adding: 4 sample tools
New total: ~44 tools (within the 30-50 target range from Pitfall #8)

## Open Questions

1. **User's sample directory locations**
   - What we know: User has Ableton Live 12 Suite, likely has sample packs
   - What's unclear: Where on the filesystem are samples stored? Standard Ableton locations? Custom directories?
   - Recommendation: `sample_scan` accepts explicit directory paths. Document common Ableton sample locations (`~/Music/Ableton/`, `/home/lwb3/Music/`, Ableton User Library) in tool description.

2. **AbletonOSC browser PR merge timeline**
   - What we know: PR #183 (browser API) and #173 (insert_device) are open, tested, and well-documented
   - What's unclear: When/if they'll be merged to master
   - Recommendation: Build Phase 5 with no AbletonOSC dependency. Add browser integration in Phase 8 if available.

3. **Character/vibe search (SAMP-02 "character description")**
   - What we know: SAMP-02 mentions searching by "character" which implies descriptive tags like "punchy", "dark", "warm"
   - What's unclear: How to extract character from filename/path
   - Recommendation: Parse descriptive words from filenames as `character_tags` array. Common terms: warm, dark, bright, punchy, soft, hard, dry, wet, analog, digital, lo-fi, vintage, modern, aggressive.

## Sources

### Primary (HIGH confidence)
- [music-metadata GitHub](https://github.com/Borewit/music-metadata) - API, supported formats, common metadata fields
- [music-metadata common_metadata.md](https://github.com/Borewit/music-metadata/blob/master/doc/common_metadata.md) - BPM and key field availability confirmed
- [Node.js fs.readdir docs](https://nodejs.org/api/fs.html) - recursive option available Node 20.1+
- AbletonOSC [GitHub repo](https://github.com/ideoforms/AbletonOSC) - Confirmed no browser API on master
- AbletonOSC [Issue #123](https://github.com/ideoforms/AbletonOSC/issues/123) - Browser/audio clip loading not yet implemented
- AbletonOSC [Issue #66](https://github.com/ideoforms/AbletonOSC/issues/66) - Browser class implementation tracking
- AbletonOSC [PR #183](https://github.com/ideoforms/AbletonOSC/pull/183) - Comprehensive browser API (not merged)
- AbletonOSC [PR #173](https://github.com/ideoforms/AbletonOSC/pull/173) - insert_device endpoint (not merged)
- AbletonOSC [Issue #174](https://github.com/ideoforms/AbletonOSC/issues/174) - browser.load_item track selection bug
- Existing project codebase: src/tools/registry.js, helpers.js, transport.js patterns
- Prior research: `.planning/research/PITFALLS.md` - Pitfalls #6 (scan performance), #7 (metadata inconsistency), #15 (path portability)

### Secondary (MEDIUM confidence)
- [Sample pack naming conventions](https://gravitascreate.com/how-to-make-a-sample-pack/) - Community conventions for BPM/key/instrument in filenames
- [Ableton User Library structure](https://help.ableton.com/hc/en-us/articles/209774085-The-User-Library) - Standard folder organization
- [ID3 BPM/key tag reference](https://www.abyssmedia.com/tunexplorer/bpm-key-metadata.shtml) - TBPM and TKEY field specs

### Tertiary (LOW confidence)
- In-memory search performance claims (10k entries < 10ms) - Based on general V8 benchmarks, not measured

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - music-metadata is the definitive Node.js audio metadata library, no real alternatives
- Architecture: HIGH - follows established project patterns, well-understood domain
- Metadata extraction: HIGH - music-metadata API verified via official docs
- Filename classification: MEDIUM - heuristic approach, will need tuning per user library
- AbletonOSC loading: MEDIUM - confirmed no current support, PRs exist but not merged
- Search performance: MEDIUM - 10k entries should be trivially fast in-memory, but no benchmark

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable domain, except AbletonOSC PRs which could merge anytime)
