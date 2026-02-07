# Paranoid Ableton

MCP server for Claude to Ableton Live 12 control via AbletonOSC. Server name: `ableton`. All tools are prefixed `mcp__ableton__` when called from Claude Code.

## Architecture

```
src/
  index.js            -- MCP server entry, stdio transport, startup validation
  osc-client.js       -- UDP client with request correlation, timeouts, reconnection
  logger.js           -- Structured JSON logger (writes to stderr, never stdout)
  tools/
    shared.js         -- OscClient singleton, ensureConnected()
    helpers.js        -- Shared utilities: snapshots, validation, volume/pan conversion
    registry.js       -- Tool aggregator, utility tools (undo, redo, batch, read-only)
    health.js         -- ableton_status
    transport.js      -- Transport control
    track.js          -- Track CRUD
    mixer.js          -- Volume, pan, sends, mute, solo
    scene.js          -- Scene and clip launch/stop
    clip.js           -- MIDI clip editing
    device.js         -- Device chain and parameter control
    sample.js         -- Sample index search
    session.js        -- Session snapshots and stats
  sample-index/
    scanner.js        -- Filesystem scanner with metadata extraction
    index-store.js    -- In-memory index with search
```

OSC communication pattern: every query sends a UDP message to Ableton (port 11001) and waits for a correlated response on port 11000. Requests to the same OSC address are queued (not concurrent). Timeouts: QUERY 5s, COMMAND 7s, LOAD_DEVICE 10s, HEALTH 3s.

## Tool Reference

### Health (1 tool)

| Tool | Description |
|------|-------------|
| `ableton_status` | Check Ableton Live connectivity and return connection status |

### Transport (10 tools)

| Tool | Description |
|------|-------------|
| `transport_play` | Start playback from current position |
| `transport_stop` | Stop playback (also stops recording) |
| `transport_continue` | Continue playback from where it was stopped |
| `transport_record` | Toggle session recording (checks status first) |
| `transport_get_tempo` | Get current tempo in BPM |
| `transport_set_tempo` | Set tempo (absolute BPM or relative: "+5", "-10", "double", "half") |
| `transport_get_position` | Get current playback position in beats |
| `transport_set_position` | Set playback position in beats |
| `transport_get_metronome` | Get metronome on/off state |
| `transport_set_metronome` | Enable or disable metronome |

### Track (6 tools)

| Tool | Description |
|------|-------------|
| `track_list` | List all tracks with properties (MIDI/audio only, no returns/master) |
| `track_create` | Create MIDI or audio track at position or end |
| `track_delete` | Two-step delete: preview contents, then confirm |
| `track_select` | Select track in session view |
| `track_set_arm` | Arm or disarm track for recording |
| `track_rename` | Rename a track |

### Mixer (8 tools)

| Tool | Description |
|------|-------------|
| `mixer_get_volume` | Get track volume (normalized + dB) |
| `mixer_set_volume` | Set volume (0.0-1.0 normalized or dB string like "-6dB") |
| `mixer_get_pan` | Get track pan (normalized + MIDI) |
| `mixer_set_pan` | Set pan (MIDI: 0=left, 64=center, 127=right) |
| `mixer_set_mute` | Mute or unmute a track |
| `mixer_set_solo` | Solo or unsolo a track |
| `mixer_get_send` | Get send level for a return track |
| `mixer_set_send` | Set send level for a return track |

### Scene and Clip Launch (7 tools)

| Tool | Description |
|------|-------------|
| `scene_list` | List all scenes with clip slot population |
| `scene_launch` | Launch a scene (all clips in row) |
| `scene_stop` | Stop all playing clips |
| `clip_launch` | Launch a specific clip by track and scene |
| `clip_stop` | Stop a specific clip |
| `scene_create` | Create empty scene at position or end |
| `scene_rename` | Rename a scene |

### MIDI Clip Editing (8 tools)

| Tool | Description |
|------|-------------|
| `clip_create` | Create empty MIDI clip (length in beats, MIDI tracks only) |
| `clip_delete` | Delete a clip from a slot |
| `clip_get` | Get clip properties (name, length, loop, note count) |
| `clip_set_name` | Set clip name |
| `clip_add_notes` | Add MIDI notes (additive, does not replace) |
| `clip_remove_notes` | Remove notes by pitch/time range (or all) |
| `clip_get_notes` | Read MIDI notes with optional pitch/time filter |
| `clip_set_loop` | Set loop start, end, and enable/disable |

### Device (9 tools)

| Tool | Description |
|------|-------------|
| `device_list` | List all devices on a track with name, type, class |
| `device_get` | Get detailed device info |
| `device_toggle` | Toggle device on/off via "Device On" parameter |
| `device_get_parameters` | List all parameters with values, ranges, quantization |
| `device_get_parameter` | Get single parameter by index or name (with value string) |
| `device_set_parameter` | Set parameter by index or name (validates min/max) |
| `device_select` | Select device in Ableton UI |
| `device_delete` | Delete device from chain (indices shift after) |
| `device_load` | Load instrument/effect from browser (requires PR #173 patch) |

### Sample (4 tools)

| Tool | Description |
|------|-------------|
| `sample_scan` | Scan directories, extract metadata (BPM, key, type, character) |
| `sample_search` | Search by instrument, key, BPM, text, character, format, duration |
| `sample_get_stats` | Index statistics: counts by type, format, directory |
| `sample_load` | Get file path for a sample (drag-and-drop instructions) |

### Session (2 tools)

| Tool | Description |
|------|-------------|
| `session_snapshot` | Full session state: transport, all tracks, clips, devices, routing |
| `session_stats` | Aggregate stats: track counts, clip count, device summary |

### Utility (4 tools)

| Tool | Description |
|------|-------------|
| `undo` | Undo last action |
| `redo` | Redo last undone action |
| `set_read_only` | Toggle read-only mode (blocks all writes when enabled) |
| `batch_commands` | Execute multiple tools in sequence (no nesting) |

**Total: 59 tools across 10 domains.**

## Workflow Patterns

Three interaction modes depending on user preference:

### Autonomous ("Make me a beat")

Claude drives the entire process. Typical sequence:

1. `session_snapshot` -- understand current state
2. `track_create` (type: midi) -- create drum track
3. `device_load` (device_name: "Drum Rack") -- load instrument
4. `clip_create` -- create 4-bar clip
5. `clip_add_notes` -- write kick/snare/hat pattern
6. `track_create` + `device_load` (device_name: "Wavetable") -- bass track
7. `clip_add_notes` -- write bassline
8. `mixer_set_volume` / `mixer_set_pan` -- balance mix
9. Iterate: add variation, adjust parameters, layer sounds

Narrate what you are doing at each step so the user follows along.

### Collaborative ("Help me build a beat")

Claude proposes each step and waits for approval. Suggest specific instruments, patterns, and mix moves. Adjust based on feedback. Use `session_snapshot` frequently to stay in sync.

### Educational ("Walk me through making a beat")

Claude explains concepts and lets the user make decisions. Teach music theory, production techniques, and Ableton workflow. Execute the user's choices, explain what happened and why.

## Device Parameter Quick Reference

Common parameter names for Ableton native devices. Use these with `device_get_parameter` and `device_set_parameter`.

**Always call `device_get_parameters` first** to see exact names for the specific device instance. The names below are typical but may vary.

### Wavetable
- `Osc 1 Pos` (wavetable position), `Osc 1 Transp` (transpose)
- `Filter Freq` (filter cutoff), `Filter Res` (resonance)
- `Amp Env Attack`, `Amp Env Decay`, `Amp Env Sustain`, `Amp Env Release`
- `LFO 1 Rate`, `LFO 1 Amount`

### Operator
- `Osc-A Level`, `Osc-A Coarse`, `Osc-A Fine`
- `Filter Freq`, `Filter Res`
- `Volume`

### Drift
- `Osc Shape`
- `Filter Freq`, `Filter Res`
- `Amp Attack`, `Amp Decay`, `Amp Sustain`, `Amp Release`

### Simpler
- `Filter Freq`, `Filter Res`
- `Vol < Vel` (velocity sensitivity)
- `S Start` (sample start), `S Length` (sample length)
- `Mode` (Classic / 1-Shot / Slice)

### Drum Rack
- Access individual pads via chain index. Each pad contains its own Simpler or other device.
- Use `device_list` on the track, then target the specific pad's device.

### EQ Eight
- `1 Frequency A`, `1 Gain A`, `1 Resonance A` (band 1)
- Bands numbered 1 through 8

### Compressor
- `Threshold`, `Ratio`, `Attack`, `Release`, `Knee`, `Output Gain`

### Reverb
- `Decay Time`, `Room Size`, `Dry/Wet`

### Delay
- `L Time`, `R Time`, `Feedback`, `Dry/Wet`

### Auto Filter
- `Frequency`, `Resonance`, `Filter Type`, `LFO Amount`, `LFO Rate`

### Utility
- `Gain`, `Channel Mode`, `Panorama`

## Error Recovery

**Connection timeout**: The server auto-reconnects on failure. If repeated, tell the user to check that Ableton Live is running and AbletonOSC is enabled in MIDI preferences. Use `ableton_status` to diagnose.

**Parameter out of range**: Use `device_get_parameters` to check the valid min/max range for the parameter. Report the valid range to the user.

**Device not found (device_load)**: Check spelling -- use exact Ableton browser names like "Wavetable", "EQ Eight", "Compressor", "Auto Filter". Run `device_list` after to confirm the device appeared.

**Read-only mode**: If a write tool returns a blocked error, remind the user that read-only mode is active. Use `set_read_only` with `enabled: false` to disable it.

**Track not found**: Track can be referenced by 0-based index or name string. Use `track_list` to see available tracks and their indices.

## Important Conventions

- **Track indices**: 0-based. Only regular tracks (MIDI, audio) are accessible. Return tracks and master track are not exposed by AbletonOSC.
- **Volume**: 0.0 to 1.0 normalized. 0.85 is approximately 0 dB (unity gain). Also accepts dB strings: "0dB", "-6dB", "-inf".
- **Pan**: MIDI convention for `mixer_set_pan`: 0 = hard left, 64 = center, 127 = hard right. Internally stored as -1.0 to 1.0.
- **MIDI notes**: Pitch 0-127 (60 = middle C / C4). Velocity 1-127. Duration in beats.
- **Beat timing**: 1.0 = one quarter note. 4.0 = one bar at 4/4 time.
- **Scene/clip indices**: 0-based. Scene = row, clip slot = intersection of track column and scene row.
- **Device indices**: 0-based within a track's device chain. Indices shift after deletion.

## Known Limitations

- **No return tracks or master track access** (AbletonOSC limitation)
- **No song name or project save** (AbletonOSC does not expose these)
- **device_load requires PR #173 patch** -- all other device tools work without it
- **No preset browsing** (AbletonOSC has no browser API for preset navigation)
- **Sample loading is path-only** -- no direct drag-and-drop automation into tracks yet
