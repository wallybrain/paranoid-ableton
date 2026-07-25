# Paranoid Ableton

An MCP server that gives Claude bidirectional control over Ableton Live 12, turning it into a creative co-pilot for electronic music production. Claude can see your entire session (tracks, clips, devices, mix state, transport) and act on it through natural language.

## How It Works

```
Claude Code <---> MCP Server (Node.js, stdio) <---> AbletonOSC (UDP) <---> Ableton Live 12
                                                   port 11000 send
                                                   port 11001 receive
```

The server bridges Claude and Ableton through [AbletonOSC](https://github.com/ideoforms/AbletonOSC), an open-source Remote Script that exposes Ableton's Live Object Model over OSC. No Max for Live dependency, no custom Remote Scripts.

## Prerequisites

- **Ableton Live 12 Suite** running on the same machine
- **[AbletonOSC](https://github.com/ideoforms/AbletonOSC)** Remote Script installed (copy to `MIDI Remote Scripts/AbletonOSC/`, enable in Preferences > Link/Tempo/MIDI)
- **Node.js v20+**
- Optional: AbletonOSC `insert_device` patch ([PR #173](https://github.com/ideoforms/AbletonOSC/pull/173)) for `device_load` support
- Optional: a custom AbletonOSC extension (not published upstream -- see [Limitations](#limitations)) for master/return track mixer control and clip automation tools

## Quick Start

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/wallybrain/paranoid-ableton.git
   cd paranoid-ableton
   npm install
   ```

2. Install AbletonOSC in Ableton's MIDI Remote Scripts directory and enable it in Preferences.

3. Add the MCP server to `~/.claude/settings.json`:
   ```json
   {
     "mcpServers": {
       "ableton": {
         "command": "node",
         "args": ["/path/to/paranoid-ableton/src/index.js"]
       }
     }
   }
   ```

4. Open Ableton Live and verify AbletonOSC is active (check MIDI preferences).

5. Start Claude Code and try: "What tracks are in my Ableton session?"

## Capabilities

**Transport** -- Play, stop, record, tempo control, position seeking, metronome toggle. Tools: `transport_play`, `transport_set_tempo`, `transport_get_position`.

**Tracks** -- Create, delete, rename, select, and arm MIDI and audio tracks. Tools: `track_list`, `track_create`, `track_rename`.

**Mixer** -- Volume, pan, sends, mute, and solo. Accepts dB strings or normalized floats. Tools: `mixer_set_volume`, `mixer_set_pan`, `mixer_set_send`.

**Master and Return Tracks** -- Master volume/pan, and return track volume/pan/mute/name by index. Tools: `mixer_get_master`, `mixer_set_master`, `mixer_list_returns`, `mixer_set_return`. Requires the custom AbletonOSC extension -- see [Limitations](#limitations).

**Scenes and Clips** -- Launch and stop scenes or individual clips, create and rename scenes. Tools: `scene_list`, `scene_launch`, `clip_launch`.

**MIDI Editing** -- Create clips, write and remove notes with pitch/velocity/timing, set loop points, read note data back. Tools: `clip_create`, `clip_add_notes`, `clip_get_notes`.

**Clip Automation** -- Write step automation envelopes for any device parameter into a clip. Tools: `clip_add_automation`, `clip_clear_automation`. Requires the custom AbletonOSC extension -- see [Limitations](#limitations).

**Devices** -- Load native instruments and effects, toggle devices, get and set any parameter by name or index. Tools: `device_load`, `device_get_parameters`, `device_set_parameter`.

**Samples** -- Scan directories with metadata extraction (BPM, key, instrument type), search semantically, get file paths for loading. Tools: `sample_scan`, `sample_search`.

**Session Awareness** -- Full session snapshots and aggregate statistics to inform creative decisions. Tools: `session_snapshot`, `session_stats`.

**Utilities** -- Undo/redo, read-only mode for safe exploration, batch command execution. Tools: `undo`, `set_read_only`, `batch_commands`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Logging verbosity: debug, info, warn, error |
| `OSC_SEND_PORT` | `11000` | UDP port for sending to AbletonOSC (AbletonOSC listen port) |
| `OSC_RECEIVE_PORT` | `11001` | UDP port for receiving from AbletonOSC (AbletonOSC response port) |
| `OSC_HOST` | `127.0.0.1` | Host address for OSC communication |

## Limitations

**Samples can be found, not loaded.** `sample_scan` and `sample_search` index and query your sample library (BPM, key, instrument type, character tags), but AbletonOSC has no API to load an arbitrary audio file into a track -- there's no equivalent of dragging a file onto the timeline. `sample_load` returns the file path and instructions; you still have to drag it into Ableton yourself. This applies to every sample type, not just drums.

**`device_load` only reaches Live's own browser, and only the top level of it.** It searches `browser.instruments`, `.audio_effects`, `.midi_effects`, `.drums`, and `.sounds` for a name match (exact match preferred, substring as fallback) and calls `browser.load_item()` on the first hit. That means:
- Stock Ableton devices load fine (e.g. `"Reverb"`, `"Wavetable"`, `"Drift"`, `"Glue Compressor"`).
- Third-party VST/AU plugins are not searched (they live under a separate `browser.plugins` category AbletonOSC doesn't expose here) and won't load.
- Nested items -- factory presets inside a device's own preset browser, user presets, Max for Live device variants -- aren't searched either, only the top-level device itself.
- Requires the `insert_device` OSC handler, which is not in stock AbletonOSC (see Prerequisites).

**Master/return mixer control and clip automation require a second, unpublished AbletonOSC patch.** Unlike `insert_device` (cherry-picked from a public upstream PR), the `/live/master/*`, `/live/return/*`, and `/live/clip/*/automation` OSC handlers behind `mixer_get_master`, `mixer_list_returns`, `clip_add_automation`, etc. are a custom extension written for this project that has not been published anywhere yet. If you clone this repo and connect it to a stock (or even `insert_device`-patched) AbletonOSC install, those tools will silently time out. Until the patch is published, treat them as available only on machines where it's been applied by hand.

**No real-time state updates.** AbletonOSC supports `start_listen`/`stop_listen` for push-based property updates, but this server doesn't use them -- Claude only sees session state when it explicitly queries (`session_snapshot`, `track_list`, etc.), not live as things change in Ableton.

## Troubleshooting

**"Connection timeout"** -- Verify Ableton Live is running, AbletonOSC is enabled in MIDI preferences, and ports 11000/11001 are not blocked by firewall.

**"Port already in use"** -- Another OSC client is bound to port 11000. Close it, or set `OSC_RECEIVE_PORT` to an unused port.

**"Device loading fails"** -- The `device_load` tool requires the AbletonOSC `insert_device` patch ([PR #173](https://github.com/ideoforms/AbletonOSC/pull/173)). All other device tools work without it.

**"Master/return/automation tools time out"** -- These require the custom, unpublished AbletonOSC extension described in [Limitations](#limitations), not the `insert_device` patch. A stock AbletonOSC install (patched or not for `insert_device`) does not have these handlers.

**"Failed to parse MCP response"** -- Likely stdout contamination from `console.log`. The server uses stderr for all logging. Check for stray `console.log` calls in custom code.

## License

MIT
