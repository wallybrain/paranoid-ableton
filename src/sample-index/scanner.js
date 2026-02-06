import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { classifyFromPath } from './classifier.js';
import { loadIndex, saveIndex, addEntry, getEntryByPath } from './index-store.js';

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac', '.mp3', '.ogg', '.m4a']);
const CONCURRENCY_LIMIT = 10;
const DEFAULT_INDEX_PATH = path.join(process.cwd(), 'data', 'sample-index.json');

let scanInProgress = false;

async function processInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

async function collectAudioFiles(directory) {
  const files = [];
  try {
    const entries = await fs.readdir(directory, { recursive: true });
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        files.push(path.join(directory, entry));
      }
    }
  } catch (err) {
    console.error(`Scan error: ${directory}: ${err.message}`);
  }
  return files;
}

export async function scanLibrary(directories, options = {}) {
  if (scanInProgress) {
    return { status: 'already_scanning', message: 'A scan is already in progress' };
  }

  const force = options.force ?? false;
  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH;

  scanInProgress = true;
  try {
    await loadIndex(indexPath);

    let scanned = 0;
    let indexed = 0;
    let skipped = 0;
    let errors = 0;

    for (const dir of directories) {
      const audioFiles = await collectAudioFiles(dir);

      const toProcess = [];
      for (const filePath of audioFiles) {
        scanned++;
        if (!force) {
          try {
            const stat = await fs.stat(filePath);
            const existing = getEntryByPath(filePath);
            if (existing && existing.mtime_ms === Math.floor(stat.mtimeMs)) {
              skipped++;
              continue;
            }
          } catch (err) {
            console.error(`Scan error: ${filePath}: ${err.message}`);
            errors++;
            continue;
          }
        }
        toProcess.push({ filePath, scanRoot: dir });
      }

      await processInBatches(toProcess, CONCURRENCY_LIMIT, async ({ filePath, scanRoot }) => {
        try {
          const stat = await fs.stat(filePath);
          let duration_ms = null;
          let sample_rate = null;
          let bit_depth = null;
          let channels = null;
          let codec = null;
          let embeddedBpm = null;
          let embeddedKey = null;

          try {
            const metadata = await parseFile(filePath, { duration: true, skipCovers: true });
            if (metadata.format) {
              duration_ms = metadata.format.duration ? Math.round(metadata.format.duration * 1000) : null;
              sample_rate = metadata.format.sampleRate ?? null;
              bit_depth = metadata.format.bitsPerSample ?? null;
              channels = metadata.format.numberOfChannels ?? null;
              codec = metadata.format.codec ?? null;
            }
            if (metadata.common) {
              if (metadata.common.bpm) embeddedBpm = Math.round(metadata.common.bpm);
              if (metadata.common.key) embeddedKey = metadata.common.key;
            }
          } catch (metaErr) {
            console.error(`Scan error: ${filePath}: ${metaErr.message}`);
          }

          const classification = classifyFromPath(filePath);

          const entry = {
            path: filePath,
            relative_path: path.relative(scanRoot, filePath),
            filename: path.basename(filePath),
            extension: path.extname(filePath).toLowerCase(),
            duration_ms,
            sample_rate,
            bit_depth,
            channels,
            codec,
            bpm: embeddedBpm ?? classification.bpm,
            key: embeddedKey ?? classification.key,
            instrument_type: classification.instrument_type,
            character_tags: classification.character_tags,
            file_size: stat.size,
            mtime_ms: Math.floor(stat.mtimeMs),
            scan_root: scanRoot
          };

          addEntry(entry);
          indexed++;
        } catch (err) {
          console.error(`Scan error: ${filePath}: ${err.message}`);
          errors++;
        }
      });
    }

    await saveIndex(indexPath);

    return {
      status: 'complete',
      scanned,
      indexed,
      skipped,
      errors,
      total: scanned
    };
  } finally {
    scanInProgress = false;
  }
}

export function getScanStatus() {
  return { scanning: scanInProgress };
}
