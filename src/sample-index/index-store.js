import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_INDEX_PATH = path.join(process.cwd(), 'data', 'sample-index.json');

let indexEntries = [];
let pathMap = new Map();

function rebuildPathMap() {
  pathMap = new Map();
  for (const entry of indexEntries) {
    pathMap.set(entry.path, entry);
  }
}

export async function loadIndex(indexPath = DEFAULT_INDEX_PATH) {
  try {
    const data = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      indexEntries = parsed;
    } else {
      indexEntries = [];
    }
  } catch {
    indexEntries = [];
  }
  rebuildPathMap();
}

export async function saveIndex(indexPath = DEFAULT_INDEX_PATH) {
  const dir = path.dirname(indexPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(indexEntries, null, 2));
}

export function addEntry(entry) {
  const existing = pathMap.get(entry.path);
  if (existing) {
    const idx = indexEntries.indexOf(existing);
    indexEntries[idx] = entry;
  } else {
    indexEntries.push(entry);
  }
  pathMap.set(entry.path, entry);
}

export function removeEntry(entryPath) {
  const existing = pathMap.get(entryPath);
  if (existing) {
    const idx = indexEntries.indexOf(existing);
    if (idx !== -1) indexEntries.splice(idx, 1);
    pathMap.delete(entryPath);
  }
}

export function getEntryByPath(entryPath) {
  return pathMap.get(entryPath) || null;
}

export function search(query = {}) {
  const limit = query.limit ?? 50;
  const results = [];

  for (const entry of indexEntries) {
    if (results.length >= limit) break;

    if (query.instrument_type && entry.instrument_type !== query.instrument_type) continue;
    if (query.key && entry.key !== query.key) continue;

    if (query.bpm_min != null) {
      if (entry.bpm == null || entry.bpm < query.bpm_min) continue;
    }
    if (query.bpm_max != null) {
      if (entry.bpm == null || entry.bpm > query.bpm_max) continue;
    }

    if (query.text) {
      const lower = query.text.toLowerCase();
      if (!entry.filename.toLowerCase().includes(lower) && !entry.path.toLowerCase().includes(lower)) continue;
    }

    if (query.format) {
      const ext = query.format.startsWith('.') ? query.format.toLowerCase() : '.' + query.format.toLowerCase();
      if (entry.extension !== ext) continue;
    }

    if (query.character) {
      const lower = query.character.toLowerCase();
      if (!entry.character_tags || !entry.character_tags.some(t => t.toLowerCase() === lower)) continue;
    }

    if (query.min_duration_ms != null) {
      if (entry.duration_ms == null || entry.duration_ms < query.min_duration_ms) continue;
    }
    if (query.max_duration_ms != null) {
      if (entry.duration_ms == null || entry.duration_ms > query.max_duration_ms) continue;
    }

    results.push(entry);
  }

  return results;
}

export function getStats() {
  const by_instrument_type = {};
  const by_format = {};
  const by_scan_root = {};

  for (const entry of indexEntries) {
    if (entry.instrument_type) {
      by_instrument_type[entry.instrument_type] = (by_instrument_type[entry.instrument_type] || 0) + 1;
    }
    if (entry.extension) {
      by_format[entry.extension] = (by_format[entry.extension] || 0) + 1;
    }
    if (entry.scan_root) {
      by_scan_root[entry.scan_root] = (by_scan_root[entry.scan_root] || 0) + 1;
    }
  }

  return {
    total_samples: indexEntries.length,
    by_instrument_type,
    by_format,
    by_scan_root
  };
}

export function clearIndex() {
  indexEntries = [];
  pathMap = new Map();
}
