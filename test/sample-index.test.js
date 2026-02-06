import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFromPath } from '../src/sample-index/classifier.js';
import { addEntry, getEntryByPath, search, getStats, clearIndex } from '../src/sample-index/index-store.js';
import { getScanStatus } from '../src/sample-index/scanner.js';

// --- Classifier Tests ---

describe('classifier', () => {
  describe('instrument type detection', () => {
    it('detects kick from filename keyword', () => {
      const r = classifyFromPath('/samples/Drums/Kicks/kick_01.wav');
      assert.strictEqual(r.instrument_type, 'kick');
    });

    it('detects kick from BD alias', () => {
      const r = classifyFromPath('/samples/BD_808.wav');
      assert.strictEqual(r.instrument_type, 'kick');
    });

    it('detects snare from snr alias', () => {
      const r = classifyFromPath('/samples/snr_tight.wav');
      assert.strictEqual(r.instrument_type, 'snare');
    });

    it('detects hihat from folder path (singular HiHat)', () => {
      const r = classifyFromPath('/samples/HiHat/OH_01.wav');
      assert.strictEqual(r.instrument_type, 'hihat');
    });

    it('detects hihat from hh keyword in filename', () => {
      const r = classifyFromPath('/samples/HiHats/hh_01.wav');
      assert.strictEqual(r.instrument_type, 'hihat');
    });

    it('detects synth from lead keyword in filename', () => {
      const r = classifyFromPath('/samples/Synths/lead_bright.wav');
      assert.strictEqual(r.instrument_type, 'synth');
    });

    it('detects fx from riser keyword', () => {
      const r = classifyFromPath('/samples/FX/riser_01.wav');
      assert.strictEqual(r.instrument_type, 'fx');
    });

    it('detects vocal from filename keyword', () => {
      const r = classifyFromPath('/samples/vocal_hook.wav');
      assert.strictEqual(r.instrument_type, 'vocal');
    });

    it('detects loop from filename keyword', () => {
      const r = classifyFromPath('/samples/loop_drums_01.wav');
      assert.strictEqual(r.instrument_type, 'loop');
    });

    it('returns null when no instrument type detected', () => {
      const r = classifyFromPath('/samples/random_file_01.wav');
      assert.strictEqual(r.instrument_type, null);
    });

    it('falls back to directory path when filename has no match', () => {
      const r = classifyFromPath('/samples/Percussion/groove_01.wav');
      assert.strictEqual(r.instrument_type, 'perc');
    });
  });

  describe('BPM extraction', () => {
    it('extracts BPM from 120bpm pattern', () => {
      const r = classifyFromPath('kick_120bpm.wav');
      assert.strictEqual(r.bpm, 120);
    });

    it('extracts BPM from 120_bpm pattern (underscore before bpm)', () => {
      const r = classifyFromPath('snare_120_bpm.wav');
      assert.strictEqual(r.bpm, 120);
    });

    it('extracts BPM from bpm128 pattern (bpm prefix)', () => {
      const r = classifyFromPath('loop_bpm128.wav');
      assert.strictEqual(r.bpm, 128);
    });

    it('extracts BPM case-insensitively (140BPM)', () => {
      const r = classifyFromPath('hat_140BPM_dry.wav');
      assert.strictEqual(r.bpm, 140);
    });

    it('extracts BPM from delimited number in valid range', () => {
      const r = classifyFromPath('bass_90_dark.wav');
      assert.strictEqual(r.bpm, 90);
    });

    it('returns null when no BPM info present', () => {
      const r = classifyFromPath('kick_01.wav');
      assert.strictEqual(r.bpm, null);
    });

    it('returns null when number is out of 40-300 range', () => {
      const r = classifyFromPath('sample_999.wav');
      assert.strictEqual(r.bpm, null);
    });
  });

  describe('key extraction', () => {
    it('extracts Cmin from Cmin keyword', () => {
      const r = classifyFromPath('pad_Cmin_warm.wav');
      assert.strictEqual(r.key, 'Cmin');
    });

    it('extracts F#maj from F#maj keyword', () => {
      const r = classifyFromPath('bass_F#maj.wav');
      assert.strictEqual(r.key, 'F#maj');
    });

    it('normalizes Am to Amin (m -> min)', () => {
      const r = classifyFromPath('lead_Am.wav');
      assert.strictEqual(r.key, 'Amin');
    });

    it('normalizes Bbminor to Bbmin', () => {
      const r = classifyFromPath('chord_Bbminor.wav');
      assert.strictEqual(r.key, 'Bbmin');
    });

    it('returns null when no key info present', () => {
      const r = classifyFromPath('kick_dry.wav');
      assert.strictEqual(r.key, null);
    });
  });

  describe('character tags', () => {
    it('extracts multiple character tags from filename', () => {
      const r = classifyFromPath('kick_punchy_dark.wav');
      assert.deepStrictEqual(r.character_tags, ['punchy', 'dark']);
    });

    it('extracts warm and analog tags', () => {
      const r = classifyFromPath('pad_warm_analog.wav');
      assert.deepStrictEqual(r.character_tags, ['warm', 'analog']);
    });

    it('returns empty array when no character tags present', () => {
      const r = classifyFromPath('kick_01.wav');
      assert.deepStrictEqual(r.character_tags, []);
    });

    it('does not duplicate tags', () => {
      const r = classifyFromPath('dark_pad_dark.wav');
      assert.deepStrictEqual(r.character_tags, ['dark']);
    });
  });
});

// --- Index Store Tests ---

function makeEntry(overrides = {}) {
  return {
    path: '/test/sample.wav',
    relative_path: 'sample.wav',
    filename: 'sample.wav',
    extension: '.wav',
    duration_ms: 500,
    sample_rate: 44100,
    bit_depth: 16,
    channels: 1,
    codec: 'wav',
    bpm: null,
    key: null,
    instrument_type: null,
    character_tags: [],
    file_size: 44100,
    mtime_ms: 1000,
    scan_root: '/test',
    ...overrides
  };
}

describe('index-store', () => {
  beforeEach(() => {
    clearIndex();
  });

  it('addEntry + getEntryByPath retrieves added entry', () => {
    const entry = makeEntry({ path: '/test/kick_01.wav', filename: 'kick_01.wav' });
    addEntry(entry);
    const retrieved = getEntryByPath('/test/kick_01.wav');
    assert.strictEqual(retrieved.path, '/test/kick_01.wav');
    assert.strictEqual(retrieved.filename, 'kick_01.wav');
    assert.strictEqual(retrieved.extension, '.wav');
  });

  it('getEntryByPath returns null for missing path', () => {
    const result = getEntryByPath('/nonexistent/file.wav');
    assert.strictEqual(result, null);
  });

  it('upsert updates existing entry by path', () => {
    const entry1 = makeEntry({ path: '/test/loop.wav', bpm: 120 });
    addEntry(entry1);
    assert.strictEqual(getEntryByPath('/test/loop.wav').bpm, 120);

    const entry2 = makeEntry({ path: '/test/loop.wav', bpm: 140 });
    addEntry(entry2);
    assert.strictEqual(getEntryByPath('/test/loop.wav').bpm, 140);

    const stats = getStats();
    assert.strictEqual(stats.total_samples, 1);
  });

  it('search by instrument_type returns matching entries', () => {
    addEntry(makeEntry({ path: '/test/kick_01.wav', instrument_type: 'kick' }));
    addEntry(makeEntry({ path: '/test/snare_01.wav', instrument_type: 'snare' }));
    addEntry(makeEntry({ path: '/test/kick_02.wav', instrument_type: 'kick' }));

    const results = search({ instrument_type: 'kick' });
    assert.strictEqual(results.length, 2);
    assert.ok(results.every(r => r.instrument_type === 'kick'));
  });

  it('search by bpm range returns entries within range', () => {
    addEntry(makeEntry({ path: '/test/a.wav', bpm: 100 }));
    addEntry(makeEntry({ path: '/test/b.wav', bpm: 120 }));
    addEntry(makeEntry({ path: '/test/c.wav', bpm: 140 }));
    addEntry(makeEntry({ path: '/test/d.wav', bpm: null }));

    const results = search({ bpm_min: 110, bpm_max: 130 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].bpm, 120);
  });

  it('search by bpm range excludes null-bpm entries', () => {
    addEntry(makeEntry({ path: '/test/a.wav', bpm: null }));
    addEntry(makeEntry({ path: '/test/b.wav', bpm: 80 }));

    const results = search({ bpm_min: 60, bpm_max: 200 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].bpm, 80);
  });

  it('search by key returns matching entries', () => {
    addEntry(makeEntry({ path: '/test/a.wav', key: 'Cmin' }));
    addEntry(makeEntry({ path: '/test/b.wav', key: 'F#maj' }));
    addEntry(makeEntry({ path: '/test/c.wav', key: null }));

    const results = search({ key: 'Cmin' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].key, 'Cmin');
  });

  it('search by text matches filename', () => {
    addEntry(makeEntry({ path: '/test/kick_hard.wav', filename: 'kick_hard.wav' }));
    addEntry(makeEntry({ path: '/test/snare_soft.wav', filename: 'snare_soft.wav' }));

    const results = search({ text: 'kick' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].filename, 'kick_hard.wav');
  });

  it('search by character matches character_tags', () => {
    addEntry(makeEntry({ path: '/test/a.wav', character_tags: ['punchy', 'dark'] }));
    addEntry(makeEntry({ path: '/test/b.wav', character_tags: ['warm'] }));

    const results = search({ character: 'punchy' });
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0].character_tags, ['punchy', 'dark']);
  });

  it('search by format filters by extension', () => {
    addEntry(makeEntry({ path: '/test/a.wav', extension: '.wav' }));
    addEntry(makeEntry({ path: '/test/b.aiff', extension: '.aiff' }));

    const results = search({ format: 'wav' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].extension, '.wav');
  });

  it('search by format handles dot prefix', () => {
    addEntry(makeEntry({ path: '/test/a.wav', extension: '.wav' }));
    addEntry(makeEntry({ path: '/test/b.aiff', extension: '.aiff' }));

    const results = search({ format: '.wav' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].extension, '.wav');
  });

  it('search with limit caps results', () => {
    for (let i = 0; i < 10; i++) {
      addEntry(makeEntry({ path: `/test/sample_${i}.wav` }));
    }

    const results = search({ limit: 3 });
    assert.strictEqual(results.length, 3);
  });

  it('search with combined filters uses AND logic', () => {
    addEntry(makeEntry({ path: '/test/a.wav', instrument_type: 'kick', bpm: 120 }));
    addEntry(makeEntry({ path: '/test/b.wav', instrument_type: 'kick', bpm: 80 }));
    addEntry(makeEntry({ path: '/test/c.wav', instrument_type: 'snare', bpm: 120 }));

    const results = search({ instrument_type: 'kick', bpm_min: 100 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].path, '/test/a.wav');
  });

  it('getStats returns correct counts', () => {
    addEntry(makeEntry({ path: '/test/a.wav', instrument_type: 'kick', extension: '.wav', scan_root: '/test' }));
    addEntry(makeEntry({ path: '/test/b.aiff', instrument_type: 'kick', extension: '.aiff', scan_root: '/test' }));
    addEntry(makeEntry({ path: '/test/c.wav', instrument_type: 'snare', extension: '.wav', scan_root: '/other' }));

    const stats = getStats();
    assert.strictEqual(stats.total_samples, 3);
    assert.strictEqual(stats.by_instrument_type.kick, 2);
    assert.strictEqual(stats.by_instrument_type.snare, 1);
    assert.strictEqual(stats.by_format['.wav'], 2);
    assert.strictEqual(stats.by_format['.aiff'], 1);
    assert.strictEqual(stats.by_scan_root['/test'], 2);
    assert.strictEqual(stats.by_scan_root['/other'], 1);
  });

  it('clearIndex resets all entries', () => {
    addEntry(makeEntry({ path: '/test/a.wav' }));
    addEntry(makeEntry({ path: '/test/b.wav' }));
    assert.strictEqual(getStats().total_samples, 2);

    clearIndex();
    assert.strictEqual(getStats().total_samples, 0);
    assert.strictEqual(getEntryByPath('/test/a.wav'), null);
  });
});

// --- Scanner Guard Tests ---

describe('scanner', () => {
  it('getScanStatus returns scanning false when idle', () => {
    const status = getScanStatus();
    assert.strictEqual(status.scanning, false);
  });
});
