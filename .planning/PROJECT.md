# Paranoid Ableton

## What This Is

An MCP server that gives Claude bidirectional control over Ableton Live 12 Suite. 59 tools across 10 domains: transport, tracks, mixer, scenes, MIDI clip editing, device control, sample library search, session awareness, and utilities. Built for electronic music production with synths, drum machines, samplers, and effects chains. Shipped v1 with 3,595 LOC, 123 tests, production logging, and automatic reconnection.

## Core Value

Claude can see and manipulate an Ableton Live session as a creative co-pilot — understanding the full production context and acting on natural language instructions.

## Requirements

### Validated

- Bidirectional session control via MCP (read state + modify session) — v1
- Transport control (play, stop, record, tempo, position, metronome) — v1
- Track management (create, delete, rename, select, arm MIDI/audio tracks) — v1
- MIDI clip creation and editing (write notes, set loop points, read note data) — v1
- Scene management (create, launch, stop, rename scenes; launch/stop individual clips) — v1
- Load Ableton native instruments and effects from browser — v1
- Full parameter control of Ableton native devices (by name or index, with validation) — v1
- Mixer control (volume in dB/normalized, pan, sends, mute, solo) — v1
- Sample library scanning with metadata indexing (BPM, key, duration, instrument type, character) — v1
- Metadata-driven sample search (instrument type, key, BPM range, character, text) — v1
- Load samples from search results (file path with drag-and-drop instructions) — v1
- Session state queries (full snapshot + aggregate statistics) — v1
- Human-readable device parameter names (via CLAUDE.md quick reference + runtime discovery) — v1

### Active

(None — define with `/gsd:new-milestone` for v2)

### Out of Scope

- Deep parameter control of third-party VSTs — parameter names are inconsistent across vendors
- Audio analysis/listening — Claude cannot hear audio output
- Arrangement View editing — Session View only in v1
- Automation envelope writing — v2 candidate
- Ableton Push/controller integration — not relevant to Claude control
- Sample generation via Ollama/Csound — keeping focused on Claude-to-Ableton direct control
- Max for Live device development — using AbletonOSC (Remote Script) as bridge
- Preset browsing and loading — AbletonOSC has no browser API for preset navigation
- Song name retrieval and project save — AbletonOSC does not expose these endpoints

## Context

- Shipped v1 with 3,595 LOC JavaScript (Node.js v20, ES modules)
- 59 MCP tools, 123 passing tests, 10 domain modules
- AbletonOSC (github.com/ideoforms/AbletonOSC) as bridge layer — UDP ports 11000/11001
- Registered as "ableton" MCP server in Claude Code
- Tech stack: Node.js, osc package, @modelcontextprotocol/sdk, music-metadata
- User has extensive MCP server experience (n8n, ollama, sqlite, epistemic)
- Primary genre: electronic music production
- Project location: `/home/user/ableton-mcp/`

## Constraints

- **Bridge layer**: AbletonOSC as OSC relay (UDP 11000/11001) — no custom Remote Script
- **Runtime**: Node.js MCP server (consistent with user's other MCP servers)
- **Ableton version**: Live 12 Suite (Max for Live available but not required)
- **Parameter scope**: Ableton native device parameters only (VST params inconsistent)
- **Network**: localhost only (Ableton and MCP server on same machine)
- **AbletonOSC limitations**: No return tracks/master track access, no song name/save, no preset browsing, no arrangement view

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AbletonOSC over custom Remote Script | Proven, maintained, ~95% LOM coverage, MIT license | Good — delivered 59 tools without custom RS |
| Node.js over Python for MCP server | Consistent with user's existing MCP server stack | Good — patterns reused from epistemic, n8n servers |
| OSC bridge over Max for Live relay | Simpler architecture, no M4L runtime dependency | Good — kept architecture clean |
| Domain-module registry pattern | Each module exports tools[] and handle(), registry aggregates | Good — scaled to 10 modules cleanly |
| Per-address request queuing | Prevent response mismatching on concurrent queries | Good — transparent to callers |
| DEV-05 via documentation not code | CLAUDE.md quick reference + device_get_parameters discovery | Good — avoids brittle parameter maps |
| Ableton native params only in v1 | Clean parameter names, consistent API | Good — clear scope boundary |
| Build custom over forking existing | Tailored to user's workflow, integrated with MCP ecosystem | Good — full control of architecture |
| Sample metadata indexing | Enables intelligent search by instrument, key, BPM, character | Good — 1ms search on 10k entries |
| Structured JSON logger to stderr | MCP uses stdout for JSON-RPC, must not contaminate | Good — zero console.log in src/ |

---
*Last updated: 2026-02-07 after v1 milestone*
