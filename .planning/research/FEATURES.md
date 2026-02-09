# Features Research: Ableton MCP Servers

**Project:** Paranoid Ableton
**Date:** 2026-02-05
**Confidence:** MEDIUM (training knowledge + web research)

## Table Stakes (Must-Have)

Every Ableton MCP server needs these or it's unusable:

### Transport Control
- Play/Stop/Continue/Record
- Tempo Get/Set
- Transport position control
- Metronome on/off

### Track Management
- List tracks (MIDI, audio, return, master)
- Track selection
- Arm/Disarm for recording
- Mute/Unmute/Solo
- Volume and Pan control

### Device Access
- List devices on tracks
- Device on/off toggle
- Get device parameters
- Set device parameter values

### Scene/Clip Operations
- List scenes and clips
- Launch scenes
- Launch individual clips
- Stop clips on track

### Basic File Operations
- Get current set name
- Save project

## Differentiating Features

### Full Session Awareness (HIGH VALUE - Core Differentiator)
- Complete LOM state snapshot
- Track routing graph understanding
- Device chain visualization
- Project statistics aggregation
- **Complexity:** Medium (1500-2500 LOC)
- **Why:** Most MCP servers provide per-operation access. Full session awareness allows Claude to make intelligent decisions based on complete context.

### Sample Library Scanning with Metadata Indexing (HIGH VALUE - Unique)
- File system crawler for user sample libraries
- Audio file metadata extraction (BPM, key, duration, format)
- Folder structure and filename parsing
- Metadata-driven sample search
- **Complexity:** Medium (1300-2000 LOC)
- **Why:** Sample hunting is a massive time sink. Metadata-driven search lets Claude suggest samples that fit musical context.

### Ableton Native Device Parameter Control (MEDIUM VALUE - Quality)
- Device-specific parameter names (human-readable)
- Parameter value validation (min/max/units)
- Macro control mapping
- **Complexity:** Medium-High (depends on device coverage)
- **Why:** Generic "set parameter X to value Y" is brittle. Device-aware control with validation is more robust.

### Preset Browsing and Loading (MEDIUM VALUE)
- Browse Ableton native device presets
- Load presets by name/category
- **Complexity:** Medium
- **Depends on:** Device Access, Browser API in AbletonOSC

## Anti-Features (Deliberately Avoid)

### Custom Audio Engine
- Don't build audio processing inside MCP server
- Ableton already has world-class audio engine
- **Do instead:** Control Ableton's native devices

### Visual UI in Terminal
- Don't build TUI for mixing/arranging
- Music production is inherently visual/auditory
- **Do instead:** Use MCP for command/automation, keep visual work in Ableton

### Real-Time Performance Control
- Don't use MCP for live performance triggering
- MCP has network latency (10-50ms)
- **Do instead:** Use MCP for setup/composition, not real-time triggering

### Audio File Hosting/Streaming
- Don't serve audio files through MCP server
- Large binary data inefficient over JSON-RPC
- **Do instead:** Use file paths, let Ableton load audio directly

### Plugin Wrapper Layer (v1)
- Don't try to provide universal VST/AU control abstraction
- Plugins have inconsistent parameter APIs
- **Do instead:** Focus on Ableton native devices in v1

## AbletonOSC Capabilities

### Available
- Transport control (play/stop/record/tempo/position)
- Track operations (arm/mute/solo/volume/pan/sends)
- Device control (list/on-off/parameters/get/set)
- Clip operations (list/launch/stop/create/notes)
- Scene operations (list/launch/create)
- MIDI note data (get/add/remove notes in clips)
- Listener subscriptions (beat, position, track changes)
- Wildcard queries for bulk data
- Undo/redo

### Limited/Not Available
- Browser navigation (limited)
- Automation envelope data
- Audio clip waveform data
- Plugin internal state beyond exposed parameters
- Max for Live device internals

## Feature Dependencies

```
AbletonOSC Connection
    ├── Transport Control
    ├── Track Management
    ├── Scene/Clip Control
    └── Device Access
         └── Parameter Control (native devices)

File System Access
    ├── Sample Library Scanning
    ├── Metadata Extraction
    └── Sample Search/Index

LOM State Queries
    └── Full Session Awareness
         └── Intelligent Suggestions
```

## Complexity Assessment

| Feature Category | Complexity | Risk |
|------------------|-----------|------|
| Transport Control | Low | Low |
| Track Management | Low | Low |
| Device Control (Basic) | Low | Low |
| Scene/Clip Operations | Low | Low |
| MIDI Clip Editing | Medium | Low |
| Session Awareness | Medium | Medium |
| Sample Scanning | Low-Medium | Low |
| Sample Metadata | Medium | Medium |
| Sample Search | Low | Low |
| Device Parameter Mapping | Medium-High | Medium |
| Preset Browsing | Medium | Medium |

## Competitor Feature Matrix

| Feature | ahujasid | Producer Pal | Paranoid (planned) |
|---------|----------|-------------|-------------------|
| Transport | Yes | Yes | Yes |
| Track CRUD | Yes | Yes | Yes |
| MIDI Notes | Yes | Yes | Yes |
| Device Params | Basic | Yes | Native-device-aware |
| Browser Load | Yes | Yes | Yes |
| Session Snapshot | No | Partial | Full |
| Sample Search | No | No | Metadata-driven |
| Preset Browse | No | Yes | Yes |
| Arrangement View | No | No | No (v2) |

## MVP Recommendation

1. **Foundation** — AbletonOSC connection, transport, tracks, scenes/clips
2. **Session Awareness** — Complete state snapshot, LOM traversal
3. **MIDI + Devices** — Clip editing, native device parameters, preset loading
4. **Sample Intelligence** — Library scanning, metadata indexing, search
5. **Production Environment** — Plugin browser, templates, signal chain awareness
