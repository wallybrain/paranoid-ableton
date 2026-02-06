# Requirements: Paranoid Ableton

**Defined:** 2026-02-05
**Core Value:** Claude can see and manipulate an Ableton Live session as a creative co-pilot

## v1 Requirements

### Transport Control

- [x] **TRNS-01**: Claude can start/stop/continue playback
- [x] **TRNS-02**: Claude can start/stop recording
- [x] **TRNS-03**: Claude can get and set tempo (BPM)
- [x] **TRNS-04**: Claude can get and set transport position
- [x] **TRNS-05**: Claude can toggle metronome on/off
- [~] **TRNS-06**: Claude can get current set name and save project *(AbletonOSC limitation — no API available)*

### Track Management

- [x] **TRCK-01**: Claude can list all tracks (MIDI, audio, return, master)
- [x] **TRCK-02**: Claude can create and delete MIDI and audio tracks
- [x] **TRCK-03**: Claude can select a track
- [x] **TRCK-04**: Claude can arm/disarm tracks for recording
- [x] **TRCK-05**: Claude can rename tracks

### Mixer

- [x] **MIX-01**: Claude can get and set track volume
- [x] **MIX-02**: Claude can get and set track pan
- [x] **MIX-03**: Claude can mute/unmute and solo/unsolo tracks
- [x] **MIX-04**: Claude can get and set send levels to return tracks

### Scenes & Clips

- [x] **CLIP-01**: Claude can list scenes and clips in session view
- [x] **CLIP-02**: Claude can launch and stop scenes
- [x] **CLIP-03**: Claude can launch and stop individual clips
- [x] **CLIP-04**: Claude can create and name scenes

### MIDI Editing

- [x] **MIDI-01**: Claude can create MIDI clips on tracks
- [x] **MIDI-02**: Claude can add and remove notes in MIDI clips
- [x] **MIDI-03**: Claude can get note data from MIDI clips
- [x] **MIDI-04**: Claude can set loop start, end, and clip length

### Device Control

- [x] **DEV-01**: Claude can list devices on any track
- [x] **DEV-02**: Claude can toggle devices on/off
- [x] **DEV-03**: Claude can get and set device parameters
- [x] **DEV-04**: Claude can load instruments and effects from browser
- [ ] **DEV-05**: Claude can use human-readable parameter names for Ableton native devices
- [ ] **DEV-06**: Claude can browse and load presets for native devices

### Session Awareness

- [ ] **SESS-01**: Claude can get a complete session state snapshot (tracks, clips, devices, parameters, routing)
- [ ] **SESS-02**: Claude can get project statistics (track counts, clip counts, device chains, tempo overview)

### Sample Intelligence

- [x] **SAMP-01**: Claude can scan user sample directories and index metadata (BPM, key, duration, format)
- [x] **SAMP-02**: Claude can search samples by instrument type, key, BPM, or character
- [x] **SAMP-03**: Claude can load found samples into tracks or instruments

## v2 Requirements

### Arrangement View

- **ARR-01**: Claude can create and edit automation envelopes
- **ARR-02**: Claude can work with arrangement view clips and positioning

### Advanced Plugin Control

- **PLG-01**: Claude can control third-party VST/AU plugin parameters with normalized names
- **PLG-02**: Claude can save and recall plugin states

### Real-Time Performance

- **PERF-01**: Claude can trigger clips with low-latency for live performance use

### Audio Analysis

- **AUD-01**: Claude can analyze audio output characteristics (spectrum, loudness)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom audio engine | Ableton already has world-class audio engine — control it, don't replace it |
| Terminal UI for mixing | Music production is visual/auditory — keep visual work in Ableton |
| Real-time triggering (v1) | MCP has 10-50ms network latency, not suitable for live triggering |
| Audio file streaming | Large binary data inefficient over JSON-RPC — use file paths instead |
| Universal VST/AU parameter mapping | Plugin parameter APIs are inconsistent across vendors — Ableton native only in v1 |
| Max for Live device development | Using AbletonOSC Remote Script as bridge — keeps M4L free for music |
| Multi-model orchestration | One Claude session controls one Live session |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRNS-01 | Phase 3 | Complete |
| TRNS-02 | Phase 3 | Complete |
| TRNS-03 | Phase 3 | Complete |
| TRNS-04 | Phase 3 | Complete |
| TRNS-05 | Phase 3 | Complete |
| TRNS-06 | Phase 3 | Blocked (AbletonOSC limitation) |
| TRCK-01 | Phase 3 | Complete |
| TRCK-02 | Phase 3 | Complete |
| TRCK-03 | Phase 3 | Complete |
| TRCK-04 | Phase 3 | Complete |
| TRCK-05 | Phase 3 | Complete |
| MIX-01 | Phase 3 | Complete |
| MIX-02 | Phase 3 | Complete |
| MIX-03 | Phase 3 | Complete |
| MIX-04 | Phase 3 | Complete |
| CLIP-01 | Phase 3 | Complete |
| CLIP-02 | Phase 3 | Complete |
| CLIP-03 | Phase 3 | Complete |
| CLIP-04 | Phase 3 | Complete |
| MIDI-01 | Phase 4 | Complete |
| MIDI-02 | Phase 4 | Complete |
| MIDI-03 | Phase 4 | Complete |
| MIDI-04 | Phase 4 | Complete |
| DEV-01 | Phase 6 | Complete |
| DEV-02 | Phase 6 | Complete |
| DEV-03 | Phase 6 | Complete |
| DEV-04 | Phase 6 | Complete |
| DEV-05 | Phase 8 | Pending (stretch) |
| DEV-06 | Phase 8 | Pending (stretch) |
| SESS-01 | Phase 7 | Pending |
| SESS-02 | Phase 7 | Pending |
| SAMP-01 | Phase 5 | Complete |
| SAMP-02 | Phase 5 | Complete |
| SAMP-03 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34 (100%)
- Core requirements (Phases 1-7): 32
- Stretch items (Phase 8): 2 (DEV-05, DEV-06)

**Phase Distribution:**
- Phase 1: Infrastructure (addresses 4/7 critical pitfalls)
- Phase 2: Infrastructure (MCP framework)
- Phase 3: 19 requirements (Transport, Tracks, Mixer, Scenes/Clips)
- Phase 4: 4 requirements (MIDI Editing)
- Phase 5: 3 requirements (Sample Intelligence) — parallel with 3-4
- Phase 6: 4 requirements (Device Control core)
- Phase 7: 2 requirements (Session Awareness)
- Phase 8: 2 requirements (Device Control stretch items)

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-06 after Phase 6 completion*
