import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setOscClient, resetClient, resetConnectionState } from '../src/tools/shared.js';
import { resolveParameterIndex, buildDeviceSnapshot, setReadOnly } from '../src/tools/helpers.js';
import { handle } from '../src/tools/device.js';

// ---------------------------------------------------------------------------
// Mock OscClient factory
// ---------------------------------------------------------------------------

function createMockClient(responseMap) {
  return {
    isReady: true,
    async open() { this.isReady = true; },
    async close() { this.isReady = false; },
    async ensureConnected() {},
    async reconnect() { return false; },
    async query(address, args) {
      const key = address + (args && args.length ? ':' + args.join(',') : '');
      if (responseMap[key] !== undefined) return responseMap[key];
      if (responseMap[address] !== undefined) return responseMap[address];
      throw new Error('TIMEOUT: No mock response for ' + key);
    }
  };
}

// Common buildDeviceSnapshot mock responses for track 0, device 0
function snapshotMocks(trackIndex, deviceIndex, overrides = {}) {
  const t = trackIndex;
  const d = deviceIndex;
  return {
    ['/live/device/get/name:' + t + ',' + d]: overrides.name || [t, d, 'Wavetable'],
    ['/live/device/get/class_name:' + t + ',' + d]: overrides.class_name || [t, d, 'InstrumentGroupDevice'],
    ['/live/device/get/type:' + t + ',' + d]: overrides.type || [t, d, 2],
    ['/live/device/get/num_parameters:' + t + ',' + d]: overrides.num_parameters || [t, d, 64]
  };
}

// ---------------------------------------------------------------------------
// resolveParameterIndex
// ---------------------------------------------------------------------------

describe('resolveParameterIndex', () => {
  it('returns integer directly for numeric input', async () => {
    const client = createMockClient({});
    const result = await resolveParameterIndex(client, 0, 0, 5);
    assert.equal(result, 5);
  });

  it('resolves string name to parameter index', async () => {
    const client = createMockClient({
      '/live/device/get/parameters/name:0,0': [0, 0, 'Device On', 'Filter Freq', 'Resonance']
    });
    const result = await resolveParameterIndex(client, 0, 0, 'Resonance');
    assert.equal(result, 2);
  });

  it('throws PARAMETER_NOT_FOUND for unknown name', async () => {
    const client = createMockClient({
      '/live/device/get/parameters/name:0,0': [0, 0, 'Device On', 'Filter Freq', 'Resonance']
    });
    await assert.rejects(
      () => resolveParameterIndex(client, 0, 0, 'NonExistent'),
      /PARAMETER_NOT_FOUND/
    );
  });

  it('throws INVALID_PARAMETER for non-string non-number', async () => {
    const client = createMockClient({});
    await assert.rejects(
      () => resolveParameterIndex(client, 0, 0, true),
      /INVALID_PARAMETER/
    );
  });
});

// ---------------------------------------------------------------------------
// buildDeviceSnapshot
// ---------------------------------------------------------------------------

describe('buildDeviceSnapshot', () => {
  it('returns correct snapshot structure', async () => {
    const client = createMockClient(snapshotMocks(0, 0));
    const result = await buildDeviceSnapshot(client, 0, 0);
    assert.deepEqual(result, {
      track_index: 0,
      device_index: 0,
      name: 'Wavetable',
      class_name: 'InstrumentGroupDevice',
      type: 'instrument',
      type_id: 2,
      parameter_count: 64
    });
  });

  it('maps type 1 to audio_effect', async () => {
    const client = createMockClient(snapshotMocks(0, 0, { type: [0, 0, 1] }));
    const result = await buildDeviceSnapshot(client, 0, 0);
    assert.equal(result.type, 'audio_effect');
  });

  it('maps unknown type to "unknown"', async () => {
    const client = createMockClient(snapshotMocks(0, 0, { type: [0, 0, 99] }));
    const result = await buildDeviceSnapshot(client, 0, 0);
    assert.equal(result.type, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// device handle() - tool handlers
// ---------------------------------------------------------------------------

describe('device handle()', () => {
  afterEach(() => {
    resetClient();
    resetConnectionState();
    setReadOnly(false);
  });

  it('device_list returns devices in chain order', async () => {
    const mock = createMockClient({
      '/live/track/get/num_devices:0': [0, 2],
      '/live/track/get/devices/name:0': [0, 'Reverb', 'Compressor'],
      '/live/track/get/devices/type:0': [0, 1, 1],
      '/live/track/get/devices/class_name:0': [0, 'Reverb', 'Compressor']
    });
    setOscClient(mock);

    const result = await handle('device_list', { track: 0 });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.device_count, 2);
    assert.equal(data.devices.length, 2);
    assert.equal(data.devices[0].name, 'Reverb');
    assert.equal(data.devices[0].type, 'audio_effect');
    assert.equal(data.devices[1].name, 'Compressor');
    assert.equal(data.devices[1].type, 'audio_effect');
  });

  it('device_list returns empty for track with no devices', async () => {
    const mock = createMockClient({
      '/live/track/get/num_devices:0': [0, 0]
    });
    setOscClient(mock);

    const result = await handle('device_list', { track: 0 });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.device_count, 0);
    assert.deepEqual(data.devices, []);
  });

  it('device_toggle uses parameter 0 when it is "Device On"', async () => {
    const mock = createMockClient({
      '/live/device/get/parameter/name:0,0,0': [0, 0, 0, 'Device On'],
      '/live/device/set/parameter/value:0,0,0,0': [],
      ...snapshotMocks(0, 0)
    });
    setOscClient(mock);

    const result = await handle('device_toggle', { track: 0, device: 0, enabled: false });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.enabled, false);
    assert.equal(data.toggle_parameter_index, 0);
  });

  it('device_toggle searches all params when param 0 is not "Device On"', async () => {
    const mock = createMockClient({
      '/live/device/get/parameter/name:0,0,0': [0, 0, 0, 'Some Other Param'],
      '/live/device/get/parameters/name:0,0': [0, 0, 'Some Other Param', 'Device On', 'Filter'],
      '/live/device/set/parameter/value:0,0,1,1': [],
      ...snapshotMocks(0, 0)
    });
    setOscClient(mock);

    const result = await handle('device_toggle', { track: 0, device: 0, enabled: true });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.toggle_parameter_index, 1);
    assert.equal(data.enabled, true);
  });

  it('device_set_parameter rejects value outside range', async () => {
    const mock = createMockClient({
      '/live/device/get/parameters/min:0,0': [0, 0, 0.0, 0.0, 20.0],
      '/live/device/get/parameters/max:0,0': [0, 0, 1.0, 1.0, 20000.0]
    });
    setOscClient(mock);

    const result = await handle('device_set_parameter', { track: 0, device: 0, parameter: 2, value: 99999 });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('VALUE_OUT_OF_RANGE'));
  });

  it('device_load selects track before inserting', async () => {
    const queryCalls = [];
    const mock = createMockClient({
      '/live/view/set/selected_track:0': [],
      '/live/track/insert_device:0,Reverb': [1],
      ...snapshotMocks(0, 1, {
        name: [0, 1, 'Reverb'],
        class_name: [0, 1, 'Reverb'],
        type: [0, 1, 1],
        num_parameters: [0, 1, 10]
      })
    });
    // Wrap query to track call order
    const originalQuery = mock.query.bind(mock);
    mock.query = async function(address, args) {
      queryCalls.push(address);
      return originalQuery(address, args);
    };
    setOscClient(mock);

    const result = await handle('device_load', { track: 0, device_name: 'Reverb' });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.name, 'Reverb');
    // Verify track selection happened before insert
    const selectIdx = queryCalls.indexOf('/live/view/set/selected_track');
    const insertIdx = queryCalls.indexOf('/live/track/insert_device');
    assert.ok(selectIdx < insertIdx, 'selected_track should be called before insert_device');
  });

  it('returns null for non-device tool names', async () => {
    const result = await handle('clip_create', {});
    assert.equal(result, null);
  });

  it('write tools blocked in read-only mode', async () => {
    setReadOnly(true);
    const mock = createMockClient({});
    setOscClient(mock);

    const result = await handle('device_toggle', { track: 0, device: 0, enabled: true });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('READ_ONLY'));
  });

  it('device_set_parameter blocked in read-only mode', async () => {
    setReadOnly(true);
    const mock = createMockClient({});
    setOscClient(mock);

    const result = await handle('device_set_parameter', { track: 0, device: 0, parameter: 0, value: 0.5 });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('READ_ONLY'));
  });

  it('device_load blocked in read-only mode', async () => {
    setReadOnly(true);
    const mock = createMockClient({});
    setOscClient(mock);

    const result = await handle('device_load', { track: 0, device_name: 'Reverb' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('READ_ONLY'));
  });

  it('device_delete blocked in read-only mode', async () => {
    setReadOnly(true);
    const mock = createMockClient({});
    setOscClient(mock);

    const result = await handle('device_delete', { track: 0, device: 0 });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('READ_ONLY'));
  });

  it('device_select blocked in read-only mode', async () => {
    setReadOnly(true);
    const mock = createMockClient({});
    setOscClient(mock);

    const result = await handle('device_select', { track: 0, device: 0 });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('READ_ONLY'));
  });
});
