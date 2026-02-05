# Paranoid Ableton

An MCP server that gives Claude bidirectional control over Ableton Live 12 — turning it into a creative co-pilot for electronic music production.

Claude can see your entire session (tracks, clips, devices, mix state, transport) and act on it through natural language. Create tracks, write MIDI patterns, load instruments, shape sounds, manage scenes, and search your sample library — all from a conversation.

## How It Works

```
Claude Code ←→ MCP Server (Node.js) ←→ AbletonOSC ←→ Ableton Live 12
              stdio              UDP 11000/11001        Remote Script
```

The server bridges Claude and Ableton through [AbletonOSC](https://github.com/ideoforms/AbletonOSC), a proven open-source Remote Script that exposes ~95% of Ableton's Live Object Model over OSC. No Max for Live dependency, no custom Remote Scripts — just a clean UDP bridge.

## Capabilities

**Transport** — Play, stop, record, set tempo and time signature, save and load projects.

**Tracks** — Create, delete, rename, and configure MIDI, audio, and return tracks.

**Mixer** — Volume, pan, sends, mute, solo, arm. Full mix control.

**Scenes & Clips** — Create scenes, launch and stop clips, manage Session View.

**MIDI Editing** — Create MIDI clips, write and remove notes with pitch, velocity, and timing. Set loop points, read note data back.

**Devices** — Load Ableton native instruments and effects, toggle devices, get and set parameters. Full control over Wavetable, Operator, Drift, Drum Rack, Simpler, and the entire effects library.

**Sample Intelligence** — Scan sample directories with metadata extraction (BPM, key, instrument type). Search samples semantically and load them into tracks.

**Session Awareness** — Full state snapshots of the entire Live session. Project-level statistics and context that inform Claude's creative decisions.

## Why Build Another One?

Existing Ableton MCP projects exist. This one is different because:

- **Full session awareness** — Claude doesn't just send commands blindly. It reads the complete session state and makes context-aware decisions about what to do next.
- **Sample intelligence** — Metadata-driven sample search with SQLite indexing. Find the right kick drum by character, not by scrolling through folders.
- **Custom-tailored** — Built to integrate with an existing MCP ecosystem (n8n, Ollama, SQLite, Epistemic) on a specific production workflow, not as a general-purpose tool.

## Prerequisites

- [Ableton Live 12 Suite](https://www.ableton.com/en/live/) running on the same machine
- [AbletonOSC](https://github.com/ideoforms/AbletonOSC) Remote Script installed
- Node.js v20+

## Status

**Planning phase.** Architecture, requirements, and an 8-phase roadmap are complete. Implementation has not started.

The roadmap moves through: OSC client foundation → MCP server shell → core controllers → MIDI editing → sample indexer → device control → session awareness → integration.

## License

MIT
