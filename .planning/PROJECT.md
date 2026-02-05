# Paranoid Ableton

## What This Is

An MCP server that gives Claude bidirectional control over Ableton Live 12 Suite. Claude can read full session state (tracks, clips, devices, mix, transport) and modify it (create tracks, write MIDI, load instruments/effects, set parameters, control transport). Built for electronic music production — creating tracks from scratch with synths, drum machines, samplers, and effects chains.

## Core Value

Claude can see and manipulate an Ableton Live session as a creative co-pilot — understanding the full production context and acting on natural language instructions.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bidirectional session control via MCP (read state + modify session)
- [ ] Transport control (play, stop, record, tempo, time signature)
- [ ] Track management (create, delete, rename, configure MIDI/audio/return tracks)
- [ ] MIDI clip creation and editing (write notes, set loop points, quantize)
- [ ] Scene management (create, fire, name scenes)
- [ ] Load Ableton native instruments and effects from browser
- [ ] Load third-party VST/AU plugins from browser (load only, no deep parameter control in v1)
- [ ] Full parameter control of Ableton native devices (Wavetable, Operator, Drift, Drum Rack, Simpler, effects)
- [ ] Mixer control (volume, pan, sends, mute, solo, arm)
- [ ] Sample library scanning with metadata indexing (tags, folder structure, filename parsing)
- [ ] Metadata-driven sample search (find samples by instrument type, key, BPM, character)
- [ ] Load samples into tracks/instruments from search results
- [ ] Preset browsing and loading for Ableton native devices
- [ ] Session state queries (list tracks, clips, devices, current mix state)

### Out of Scope

- Deep parameter control of third-party VSTs — parameter names are inconsistent across vendors, defer to v2
- Audio analysis/listening — Claude cannot hear audio output, defer to future
- Arrangement View editing — Session View only for v1
- Automation envelope writing — defer to v2
- Ableton Push/controller integration — not relevant to Claude control
- Sample generation via Ollama/Csound — keeping the stack focused on Claude-to-Ableton direct control
- Max for Live device development — using AbletonOSC (Remote Script) as bridge instead

## Context

- User has extensive MCP server experience (n8n, ollama, sqlite, epistemic — all custom Node.js servers)
- AbletonOSC (github.com/ideoforms/AbletonOSC, ~670 stars, MIT) is the proven bridge layer — exposes ~95% of Live Object Model over OSC
- Existing Ableton MCP projects exist (ahujasid/ableton-mcp ~2200 stars, Producer Pal, others) but this build is custom-tailored to user's workflow and production environment
- User runs Ableton Live 12 Suite on the same machine as Claude Code
- Primary genre: electronic music production (synths, drum machines, samplers, effects)
- Standard project structure at `/home/lwb3/ableton-mcp/`

## Constraints

- **Bridge layer**: AbletonOSC as OSC relay (UDP 11000/11001) — no custom Remote Script from scratch
- **Runtime**: Node.js MCP server (consistent with user's other MCP servers)
- **Ableton version**: Live 12 Suite (Max for Live available but not required for bridge)
- **Parameter scope**: v1 limited to Ableton native device parameters only
- **Network**: localhost only (Ableton and MCP server on same machine)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AbletonOSC over custom Remote Script | Proven, maintained, ~95% LOM coverage, MIT license | -- Pending |
| Node.js over Python for MCP server | Consistent with user's existing MCP server stack | -- Pending |
| OSC bridge over Max for Live relay | Simpler architecture, no M4L runtime dependency, keeps M4L free for music | -- Pending |
| Ableton native device params only in v1 | Clean parameter names, consistent API — VST params are inconsistent | -- Pending |
| Build custom over forking existing | Tailored to user's workflow, integrated with existing MCP ecosystem | -- Pending |
| Sample metadata indexing | Enables intelligent sample search by instrument, key, BPM, character | -- Pending |

---
*Last updated: 2026-02-05 after initialization*
