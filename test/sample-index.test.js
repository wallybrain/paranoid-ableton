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
