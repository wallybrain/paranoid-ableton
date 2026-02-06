import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setOscClient, resetClient } from '../src/tools/shared.js';
import { buildTrackDetailSnapshot, buildSessionSnapshot, buildSessionStats } from '../src/tools/helpers.js';
import { handle } from '../src/tools/session.js';

// ---------------------------------------------------------------------------
// Mock OscClient factory
// ---------------------------------------------------------------------------

function createMockClient(responseMap) {
  return {
    isReady: true,
    async open() { this.isReady = true; },
    async query(address, args) {
      const key = address + (args && args.length ? ':' + args.join(',') : '');
      if (responseMap[key] !== undefined) return responseMap[key];
      if (responseMap[address] !== undefined) return responseMap[address];
      throw new Error('TIMEOUT: No mock response for ' + key);
    }
  };
}

// ---------------------------------------------------------------------------
// Session mock factory: 2 tracks, 3 scenes
// ---------------------------------------------------------------------------

function sessionMocks() {
  return {
    // Track/scene counts
    '/live/song/get/num_tracks': [2],
    '/live/song/get/num_scenes': [3],

    // Transport (7 queries)
    '/live/song/get/tempo': [120],
    '/live/song/get/is_playing': [0],
    '/live/song/get/current_song_time': [0],
    '/live/song/get/metronome': [1],
    '/live/song/get/signature_numerator': [4],
    '/live/song/get/signature_denominator': [4],
    '/live/song/get/session_record_status': [0],

    // Track 0: MIDI track "Bass" with 1 device
    '/live/track/get/name:0': ['Bass'],
    '/live/track/get/volume:0': [0.85],
    '/live/track/get/panning:0': [0],
    '/live/track/get/mute:0': [0],
    '/live/track/get/solo:0': [0],
    '/live/track/get/arm:0': [1],
    '/live/track/get/has_midi_input:0': [1],
    '/live/track/get/has_audio_input:0': [0],
    '/live/track/get/num_devices:0': [1],
    '/live/track/get/input_routing_type:0': [0, 'All Ins'],
    '/live/track/get/output_routing_type:0': [0, 'Master'],
    '/live/track/get/is_foldable:0': [0, 0],
    '/live/track/get/is_grouped:0': [0, 0],
    '/live/track/get/clips/name:0': [0, 'Bass A', '', 'Bass C'],
    '/live/track/get/devices/name:0': [0, 'Wavetable'],
    '/live/track/get/devices/type:0': [0, 2],

    // Track 1: Audio track "Drums" with 2 devices
    '/live/track/get/name:1': ['Drums'],
    '/live/track/get/volume:1': [0.7],
    '/live/track/get/panning:1': [0.5],
    '/live/track/get/mute:1': [0],
    '/live/track/get/solo:1': [0],
    '/live/track/get/arm:1': [0],
    '/live/track/get/has_midi_input:1': [0],
    '/live/track/get/has_audio_input:1': [1],
    '/live/track/get/num_devices:1': [2],
    '/live/track/get/input_routing_type:1': [1, 'Ext. In'],
    '/live/track/get/output_routing_type:1': [1, 'Master'],
    '/live/track/get/is_foldable:1': [1, 0],
    '/live/track/get/is_grouped:1': [1, 0],
    '/live/track/get/clips/name:1': [1, '', 'Drums B', ''],
    '/live/track/get/devices/name:1': [1, 'Compressor', 'EQ Eight'],
    '/live/track/get/devices/type:1': [1, 1, 1]
  };
}

// ---------------------------------------------------------------------------
// buildTrackDetailSnapshot
// ---------------------------------------------------------------------------

describe('buildTrackDetailSnapshot', () => {
  it('returns track with routing, grouping, clips, and devices', async () => {
    const client = createMockClient(sessionMocks());
    const result = await buildTrackDetailSnapshot(client, 0, 3);

    // Base fields from buildTrackSnapshot
    assert.equal(result.name, 'Bass');
    assert.equal(result.type, 'midi');
    assert.equal(result.device_count, 1);

    // Routing
    assert.equal(result.input_routing, 'All Ins');
    assert.equal(result.output_routing, 'Master');

    // Grouping
    assert.equal(result.is_group, false);
    assert.equal(result.is_grouped, false);

    // Clips: scenes 0 and 2 have clips, scene 1 is empty ''
    assert.equal(result.clips.length, 2);
    assert.deepEqual(result.clips[0], { scene: 0, name: 'Bass A', has_clip: true });
    assert.deepEqual(result.clips[1], { scene: 2, name: 'Bass C', has_clip: true });

    // Devices
    assert.equal(result.devices.length, 1);
    assert.deepEqual(result.devices[0], { index: 0, name: 'Wavetable', type: 'instrument' });
  });

  it('excludes empty clip slots', async () => {
    const client = createMockClient(sessionMocks());
    const result = await buildTrackDetailSnapshot(client, 1, 3);

    // Track 1 has 1 populated slot out of 3 (scene 1 = 'Drums B')
    assert.equal(result.clips.length, 1);
    assert.equal(result.clips[0].scene, 1);
    assert.equal(result.clips[0].name, 'Drums B');
  });

  it('returns empty devices array when device_count is 0', async () => {
    const mocks = {
      // Track 2 with 0 devices
      '/live/track/get/name:2': ['Empty'],
      '/live/track/get/volume:2': [0.5],
      '/live/track/get/panning:2': [0],
      '/live/track/get/mute:2': [0],
      '/live/track/get/solo:2': [0],
      '/live/track/get/arm:2': [0],
      '/live/track/get/has_midi_input:2': [1],
      '/live/track/get/has_audio_input:2': [0],
      '/live/track/get/num_devices:2': [0],
      '/live/track/get/input_routing_type:2': [2, 'All Ins'],
      '/live/track/get/output_routing_type:2': [2, 'Master'],
      '/live/track/get/is_foldable:2': [2, 0],
      '/live/track/get/is_grouped:2': [2, 0],
      '/live/track/get/clips/name:2': [2, '', '']
    };
    const client = createMockClient(mocks);
    const result = await buildTrackDetailSnapshot(client, 2, 2);

    assert.deepEqual(result.devices, []);
    assert.equal(result.device_count, 0);
  });
});

// ---------------------------------------------------------------------------
// buildSessionSnapshot
// ---------------------------------------------------------------------------

describe('buildSessionSnapshot', () => {
  it('returns complete session with transport and all tracks', async () => {
    const client = createMockClient(sessionMocks());
    const result = await buildSessionSnapshot(client);

    // Transport
    assert.equal(result.transport.tempo, 120);
    assert.equal(result.transport.is_playing, false);

    // Counts
    assert.equal(result.track_count, 2);
    assert.equal(result.scene_count, 3);

    // Tracks
    assert.equal(result.tracks.length, 2);
    assert.equal(result.tracks[0].name, 'Bass');
    assert.equal(result.tracks[1].name, 'Drums');
    assert.equal(result.tracks[0].clips.length, 2);
    assert.equal(result.tracks[1].clips.length, 1);
  });
});

// ---------------------------------------------------------------------------
// buildSessionStats
// ---------------------------------------------------------------------------

describe('buildSessionStats', () => {
  it('returns correct track type counts and totals', async () => {
    const client = createMockClient(sessionMocks());
    const result = await buildSessionStats(client);

    // Track counts
    assert.equal(result.track_counts.total, 2);
    assert.equal(result.track_counts.midi, 1);
    assert.equal(result.track_counts.audio, 1);
    assert.equal(result.track_counts.group, 0);

    // Scene count
    assert.equal(result.scene_count, 3);

    // Clip totals (2 from Bass + 1 from Drums)
    assert.equal(result.total_clips, 3);

    // Device totals (1 from Bass + 2 from Drums)
    assert.equal(result.total_devices, 3);

    // Device summary
    assert.equal(result.device_summary.Wavetable, 1);
    assert.equal(result.device_summary.Compressor, 1);
    assert.equal(result.device_summary['EQ Eight'], 1);
  });
});

// ---------------------------------------------------------------------------
// session handle() - tool handlers
// ---------------------------------------------------------------------------

describe('session handle()', () => {
  afterEach(() => {
    resetClient();
  });

  it('session_snapshot returns JSON response', async () => {
    setOscClient(createMockClient(sessionMocks()));
    const result = await handle('session_snapshot', {});
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.track_count, 2);
    assert.equal(data.tracks.length, 2);
  });

  it('session_stats returns JSON response', async () => {
    setOscClient(createMockClient(sessionMocks()));
    const result = await handle('session_stats', {});
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.track_counts.total, 2);
    assert.equal(data.total_clips, 3);
  });

  it('returns null for non-session tool names', async () => {
    const result = await handle('device_list', {});
    assert.equal(result, null);
  });
});
