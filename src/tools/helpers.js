import { TIMEOUTS } from '../osc-client.js';

// Volume unity point: 0.85 normalized = 0dB is from community AbletonOSC
// implementations. This needs empirical verification against actual Ableton
// Live 12 values. The mapping may differ slightly per version.

// ---------------------------------------------------------------------------
// Volume conversion (dB <-> normalized 0.0-1.0)
// ---------------------------------------------------------------------------

/**
 * Convert dB value to Ableton's normalized 0.0-1.0 range.
 * -70dB or below -> 0.0, 0dB -> 0.85 (unity), +6dB -> 1.0
 */
export function dbToNormalized(db) {
  if (db <= -70) return 0.0;
  if (db <= 0) {
    return Math.min(1.0, Math.max(0.0, 0.85 * Math.pow(10, db / 20)));
  }
  // 0 to +6dB: linear interpolation from 0.85 to 1.0
  return Math.min(1.0, Math.max(0.0, 0.85 + (db / 6) * 0.15));
}

/**
 * Convert Ableton's normalized 0.0-1.0 value back to dB.
 */
export function normalizedToDb(value) {
  if (value < 1e-7) return -Infinity;
  if (value <= 0.85) {
    return 20 * Math.log10(value / 0.85);
  }
  // Above 0.85: linear mapping back to 0-6dB
  return Math.min(6, ((value - 0.85) / 0.15) * 6);
}

/**
 * Parse volume input from various formats.
 * Accepts: "0db", "-6dB", "-inf", 0.0-1.0 float
 */
export function parseVolumeInput(input) {
  if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    if (lower === '-inf' || lower === '-infinity') return 0.0;
    if (lower.endsWith('db')) {
      const db = parseFloat(lower);
      if (isNaN(db)) throw new Error('INVALID_VOLUME: Cannot parse dB value from "' + input + '"');
      return dbToNormalized(db);
    }
    // Try parsing as number
    const num = parseFloat(lower);
    if (isNaN(num)) throw new Error('INVALID_VOLUME: Cannot parse volume from "' + input + '"');
    if (num < 0 || num > 1) throw new Error('INVALID_VOLUME: Normalized volume must be 0.0-1.0, got ' + num);
    return num;
  }
  if (typeof input === 'number') {
    if (input < 0 || input > 1) throw new Error('INVALID_VOLUME: Normalized volume must be 0.0-1.0, got ' + input);
    return input;
  }
  throw new Error('INVALID_VOLUME: Expected number or string, got ' + typeof input);
}

// ---------------------------------------------------------------------------
// Pan conversion (MIDI 0-127 <-> float -1.0 to 1.0)
// ---------------------------------------------------------------------------

/**
 * Convert MIDI pan value (0-127) to float (-1.0 to 1.0).
 * 0 = hard left, 64 = center, 127 = hard right
 */
export function midiPanToFloat(midiValue) {
  const clamped = Math.min(127, Math.max(0, Math.round(midiValue)));
  return (clamped - 64) / 64;
}

/**
 * Convert float pan (-1.0 to 1.0) to MIDI (0-127).
 */
export function floatPanToMidi(floatValue) {
  const raw = Math.round(floatValue * 64 + 64);
  return Math.min(127, Math.max(0, raw));
}

/**
 * Parse pan input (MIDI 0-127 convention per user decision).
 */
export function parsePanInput(input) {
  const value = typeof input === 'string' ? parseInt(input, 10) : input;
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('INVALID_PAN: Expected integer 0-127, got "' + input + '"');
  }
  if (value < 0 || value > 127) {
    throw new Error('INVALID_PAN: MIDI pan must be 0-127, got ' + value);
  }
  return midiPanToFloat(value);
}

// ---------------------------------------------------------------------------
// Track resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a track reference (index or name) to a 0-based track index.
 * Numbers are returned as-is (0-based per user decision).
 * Strings trigger an OSC query to find the track by name.
 */
export async function resolveTrackIndex(client, trackRef) {
  if (typeof trackRef === 'number') {
    return trackRef;
  }
  if (typeof trackRef !== 'string') {
    throw new Error('INVALID_TRACK: Expected number or string, got ' + typeof trackRef);
  }

  const [numTracks] = await client.query('/live/song/get/num_tracks');

  for (let i = 0; i < numTracks; i++) {
    const [name] = await client.query('/live/track/get/name', [i]);
    if (name === trackRef) return i;
  }

  throw new Error('TRACK_NOT_FOUND: No track named "' + trackRef + '"');
}

// ---------------------------------------------------------------------------
// Tempo parsing
// ---------------------------------------------------------------------------

/**
 * Parse tempo input: absolute BPM, relative change, or keyword.
 * Accepts: number (absolute), '+5'/'-10' (relative), 'double'/'half' (multiply).
 * Validates result is 20-999 BPM.
 */
export function parseTempoInput(input, currentTempo) {
  let result;

  if (typeof input === 'number') {
    result = input;
  } else if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    if (lower === 'double') {
      result = currentTempo * 2;
    } else if (lower === 'half') {
      result = currentTempo / 2;
    } else if (lower.startsWith('+') || lower.startsWith('-')) {
      result = currentTempo + parseFloat(lower);
    } else {
      result = parseFloat(lower);
    }
  } else {
    throw new Error('INVALID_TEMPO: Expected number or string, got ' + typeof input);
  }

  if (isNaN(result)) {
    throw new Error('INVALID_TEMPO: Cannot parse tempo from "' + input + '"');
  }
  if (result < 20 || result > 999) {
    throw new Error('INVALID_TEMPO: Tempo must be 20-999 BPM, got ' + result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Snapshot builders (async -- query OSC)
// ---------------------------------------------------------------------------

/**
 * Build a transport state snapshot from live OSC queries.
 */
export async function buildTransportSnapshot(client) {
  const [tempo] = await client.query('/live/song/get/tempo');
  const [isPlaying] = await client.query('/live/song/get/is_playing');
  const [currentTime] = await client.query('/live/song/get/current_song_time');
  const [metronome] = await client.query('/live/song/get/metronome');
  const [sigNum] = await client.query('/live/song/get/signature_numerator');
  const [sigDen] = await client.query('/live/song/get/signature_denominator');
  const [recordStatus] = await client.query('/live/song/get/session_record_status');

  return {
    tempo,
    is_playing: !!isPlaying,
    recording: recordStatus === 1 || recordStatus === 2,
    current_time: currentTime,
    metronome: !!metronome,
    time_signature: sigNum + '/' + sigDen
  };
}

/**
 * Build a track state snapshot from live OSC queries.
 */
export async function buildTrackSnapshot(client, trackIndex) {
  const [name] = await client.query('/live/track/get/name', [trackIndex]);
  const [volume] = await client.query('/live/track/get/volume', [trackIndex]);
  const [panning] = await client.query('/live/track/get/panning', [trackIndex]);
  const [mute] = await client.query('/live/track/get/mute', [trackIndex]);
  const [solo] = await client.query('/live/track/get/solo', [trackIndex]);
  const [arm] = await client.query('/live/track/get/arm', [trackIndex]);
  const [hasMidi] = await client.query('/live/track/get/has_midi_input', [trackIndex]);
  const [hasAudio] = await client.query('/live/track/get/has_audio_input', [trackIndex]);
  const [numDevices] = await client.query('/live/track/get/num_devices', [trackIndex]);

  let type = 'unknown';
  if (hasMidi) type = 'midi';
  else if (hasAudio) type = 'audio';

  return {
    index: trackIndex,
    name,
    type,
    volume: {
      normalized: volume,
      db: normalizedToDb(volume)
    },
    pan: {
      normalized: panning,
      midi: floatPanToMidi(panning)
    },
    mute: !!mute,
    solo: !!solo,
    arm: !!arm,
    device_count: numDevices
  };
}

// ---------------------------------------------------------------------------
// Read-only mode gating
// ---------------------------------------------------------------------------

let readOnlyMode = false;

export function isReadOnly() {
  return readOnlyMode;
}

export function setReadOnly(enabled) {
  readOnlyMode = !!enabled;
}

export function guardWrite(toolName) {
  if (readOnlyMode) {
    return {
      content: [{
        type: 'text',
        text: 'READ_ONLY: Tool "' + toolName + '" blocked. Read-only mode is active. Use set_read_only(false) to disable.'
      }],
      isError: true
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Two-step delete state
// ---------------------------------------------------------------------------

const pendingDeletes = new Map();

export function getPendingDelete(trackIndex) {
  return pendingDeletes.get(trackIndex);
}

export function setPendingDelete(trackIndex, snapshot) {
  pendingDeletes.set(trackIndex, snapshot);
}

export function clearPendingDelete(trackIndex) {
  pendingDeletes.delete(trackIndex);
}

export function clearAllPendingDeletes() {
  pendingDeletes.clear();
}

// ---------------------------------------------------------------------------
// Note serialization (structured JSON <-> flat OSC array)
// ---------------------------------------------------------------------------

export function notesToFlatArray(notes) {
  const flat = [];
  for (const note of notes) {
    flat.push(
      note.pitch,
      note.start_time,
      note.duration,
      note.velocity !== undefined ? note.velocity : 100,
      note.mute ? 1 : 0
    );
  }
  return flat;
}

export function flatArrayToNotes(flat) {
  if (!flat || flat.length === 0) return [];
  const notes = [];
  for (let i = 0; i + 4 < flat.length; i += 5) {
    notes.push({
      pitch: flat[i],
      start_time: flat[i + 1],
      duration: flat[i + 2],
      velocity: flat[i + 3],
      mute: !!flat[i + 4]
    });
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Note validation
// ---------------------------------------------------------------------------

export function validateNote(note, index) {
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
    throw new Error('INVALID_NOTE[' + index + ']: pitch must be integer 0-127, got ' + note.pitch);
  }
  if (typeof note.start_time !== 'number' || note.start_time < 0) {
    throw new Error('INVALID_NOTE[' + index + ']: start_time must be >= 0, got ' + note.start_time);
  }
  if (typeof note.duration !== 'number' || note.duration <= 0) {
    throw new Error('INVALID_NOTE[' + index + ']: duration must be > 0, got ' + note.duration);
  }
  if (note.velocity !== undefined) {
    if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
      throw new Error('INVALID_NOTE[' + index + ']: velocity must be 1-127, got ' + note.velocity);
    }
  }
  return null;
}

export function validateNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new Error('INVALID_NOTES: notes array must not be empty');
  }
  for (let i = 0; i < notes.length; i++) {
    validateNote(notes[i], i);
  }
}

// ---------------------------------------------------------------------------
// Clip snapshot builder
// ---------------------------------------------------------------------------

export async function buildClipSnapshot(client, trackIndex, clipIndex) {
  const [, , name] = await client.query('/live/clip/get/name', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const [, , length] = await client.query('/live/clip/get/length', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const [, , loopStart] = await client.query('/live/clip/get/loop_start', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const [, , loopEnd] = await client.query('/live/clip/get/loop_end', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const [, , looping] = await client.query('/live/clip/get/looping', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const [, , isMidi] = await client.query('/live/clip/get/is_midi_clip', [trackIndex, clipIndex], TIMEOUTS.QUERY);

  const noteResponse = await client.query('/live/clip/get/notes', [trackIndex, clipIndex], TIMEOUTS.QUERY);
  const noteData = noteResponse.slice(2);
  const noteCount = Math.floor(noteData.length / 5);

  return {
    track_index: trackIndex,
    clip_index: clipIndex,
    name,
    length,
    loop_start: loopStart,
    loop_end: loopEnd,
    looping: !!looping,
    is_midi: !!isMidi,
    note_count: noteCount
  };
}

// ---------------------------------------------------------------------------
// Parameter resolution
// ---------------------------------------------------------------------------

export async function resolveParameterIndex(client, trackIndex, deviceIndex, paramRef) {
  if (typeof paramRef === 'number') {
    return paramRef;
  }
  if (typeof paramRef !== 'string') {
    throw new Error('INVALID_PARAMETER: Expected number or string, got ' + typeof paramRef);
  }

  const namesResp = await client.query('/live/device/get/parameters/name', [trackIndex, deviceIndex], TIMEOUTS.QUERY);
  const names = namesResp.slice(2);
  const idx = names.findIndex(n => n === paramRef);
  if (idx === -1) {
    throw new Error('PARAMETER_NOT_FOUND: No parameter named "' + paramRef + '" on device ' + deviceIndex);
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Device snapshot builder
// ---------------------------------------------------------------------------

const deviceTypeNames = { 1: 'audio_effect', 2: 'instrument', 4: 'midi_effect' };

export async function buildDeviceSnapshot(client, trackIndex, deviceIndex) {
  const [, , name] = await client.query('/live/device/get/name', [trackIndex, deviceIndex], TIMEOUTS.QUERY);
  const [, , className] = await client.query('/live/device/get/class_name', [trackIndex, deviceIndex], TIMEOUTS.QUERY);
  const [, , type] = await client.query('/live/device/get/type', [trackIndex, deviceIndex], TIMEOUTS.QUERY);
  const [, , numParams] = await client.query('/live/device/get/num_parameters', [trackIndex, deviceIndex], TIMEOUTS.QUERY);

  return {
    track_index: trackIndex,
    device_index: deviceIndex,
    name,
    class_name: className,
    type: deviceTypeNames[type] || 'unknown',
    type_id: type,
    parameter_count: numParams
  };
}

// ---------------------------------------------------------------------------
// Session snapshot builders (aggregate state across all tracks)
// ---------------------------------------------------------------------------

export async function buildTrackDetailSnapshot(client, trackIndex, numScenes) {
  const base = await buildTrackSnapshot(client, trackIndex);

  const inputResp = await client.query('/live/track/get/input_routing_type', [trackIndex]);
  const inputType = inputResp[1];

  const outputResp = await client.query('/live/track/get/output_routing_type', [trackIndex]);
  const outputType = outputResp[1];

  const foldableResp = await client.query('/live/track/get/is_foldable', [trackIndex]);
  const isFoldable = foldableResp[1];

  const groupedResp = await client.query('/live/track/get/is_grouped', [trackIndex]);
  const isGrouped = groupedResp[1];

  const clipNamesResp = await client.query('/live/track/get/clips/name', [trackIndex]);
  const clipNames = clipNamesResp.slice(1);

  const clips = [];
  for (let s = 0; s < numScenes; s++) {
    if (clipNames[s] && clipNames[s] !== '') {
      clips.push({ scene: s, name: clipNames[s], has_clip: true });
    }
  }

  const devices = [];
  if (base.device_count > 0) {
    const namesResp = await client.query('/live/track/get/devices/name', [trackIndex]);
    const devNames = namesResp.slice(1);

    const typesResp = await client.query('/live/track/get/devices/type', [trackIndex]);
    const devTypes = typesResp.slice(1);

    for (let d = 0; d < base.device_count; d++) {
      devices.push({ index: d, name: devNames[d], type: deviceTypeNames[devTypes[d]] || 'unknown' });
    }
  }

  return {
    ...base,
    input_routing: inputType,
    output_routing: outputType,
    is_group: !!isFoldable,
    is_grouped: !!isGrouped,
    clips,
    devices
  };
}

export async function buildSessionSnapshot(client) {
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const [numScenes] = await client.query('/live/song/get/num_scenes');
  const transport = await buildTransportSnapshot(client);

  const tracks = [];
  for (let t = 0; t < numTracks; t++) {
    tracks.push(await buildTrackDetailSnapshot(client, t, numScenes));
  }

  return { transport, track_count: numTracks, scene_count: numScenes, tracks };
}

export async function buildSessionStats(client) {
  const transport = await buildTransportSnapshot(client);
  const [numTracks] = await client.query('/live/song/get/num_tracks');
  const [numScenes] = await client.query('/live/song/get/num_scenes');

  let midiCount = 0;
  let audioCount = 0;
  let groupCount = 0;
  let totalClips = 0;
  let totalDevices = 0;
  const deviceSummary = {};

  for (let t = 0; t < numTracks; t++) {
    const [hasMidi] = await client.query('/live/track/get/has_midi_input', [t]);
    const [hasAudio] = await client.query('/live/track/get/has_audio_input', [t]);
    const foldableResp = await client.query('/live/track/get/is_foldable', [t]);
    const isFoldable = foldableResp[1];
    const [numDevices] = await client.query('/live/track/get/num_devices', [t]);

    if (isFoldable) groupCount++;
    else if (hasMidi) midiCount++;
    else if (hasAudio) audioCount++;

    totalDevices += numDevices;

    const clipNamesResp = await client.query('/live/track/get/clips/name', [t]);
    const clipNames = clipNamesResp.slice(1);
    totalClips += clipNames.filter(n => n && n !== '').length;

    if (numDevices > 0) {
      const devNamesResp = await client.query('/live/track/get/devices/name', [t]);
      const devNames = devNamesResp.slice(1);
      for (const name of devNames) {
        deviceSummary[name] = (deviceSummary[name] || 0) + 1;
      }
    }
  }

  return {
    transport,
    track_counts: { total: numTracks, midi: midiCount, audio: audioCount, group: groupCount },
    scene_count: numScenes,
    total_clips: totalClips,
    total_devices: totalDevices,
    device_summary: deviceSummary
  };
}
