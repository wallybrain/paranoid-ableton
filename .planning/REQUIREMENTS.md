# Requirements: Paranoid Ableton

**Defined:** 2026-02-05
**Core Value:** Claude can see and manipulate an Ableton Live session as a creative co-pilot

## v1 Requirements

### Transport Control

- [ ] **TRNS-01**: Claude can start/stop/continue playback
- [ ] **TRNS-02**: Claude can start/stop recording
- [ ] **TRNS-03**: Claude can get and set tempo (BPM)
- [ ] **TRNS-04**: Claude can get and set transport position
- [ ] **TRNS-05**: Claude can toggle metronome on/off
- [ ] **TRNS-06**: Claude can get current set name and save project

### Track Management

- [ ] **TRCK-01**: Claude can list all tracks (MIDI, audio, return, master)
- [ ] **TRCK-02**: Claude can create and delete MIDI and audio tracks
- [ ] **TRCK-03**: Claude can select a track
- [ ] **TRCK-04**: Claude can arm/disarm tracks for recording
- [ ] **TRCK-05**: Claude can rename tracks

### Mixer

- [ ] **MIX-01**: Claude can get and set track volume
- [ ] **MIX-02**: Claude can get and set track pan
- [ ] **MIX-03**: Claude can mute/unmute and solo/unsolo tracks
- [ ] **MIX-04**: Claude can get and set send levels to return tracks

### Scenes & Clips

- [ ] **CLIP-01**: Claude can list scenes and clips in session view
- [ ] **CLIP-02**: Claude can launch and stop scenes
- [ ] **CLIP-03**: Claude can launch and stop individual clips
- [ ] **CLIP-04**: Claude can create and name scenes

### MIDI Editing

- [ ] **MIDI-01**: Claude can create MIDI clips on tracks
- [ ] **MIDI-02**: Claude can add and remove notes in MIDI clips
- [ ] **MIDI-03**: Claude can get note data from MIDI clips
- [ ] **MIDI-04**: Claude can set loop start, end, and clip length

### Device Control

- [ ] **DEV-01**: Claude can list devices on any track
- [ ] **DEV-02**: Claude can toggle devices on/off
- [ ] **DEV-03**: Claude can get and set device parameters
- [ ] **DEV-04**: Claude can load instruments and effects from browser
- [ ] **DEV-05**: Claude can use human-readable parameter names for Ableton native devices
- [ ] **DEV-06**: Claude can browse and load presets for native devices

### Session Awareness

- [ ] **SESS-01**: Claude can get a complete session state snapshot (tracks, clips, devices, parameters, routing)
- [ ] **SESS-02**: Claude can get project statistics (track counts, clip counts, device chains, tempo overview)

### Sample Intelligence

- [ ] **SAMP-01**: Claude can scan user sample directories and index metadata (BPM, key, duration, format)
- [ ] **SAMP-02**: Claude can search samples by instrument type, key, BPM, or character
- [ ] **SAMP-03**: Claude can load found samples into tracks or instruments

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
| TRNS-01 | TBD | Pending |
| TRNS-02 | TBD | Pending |
| TRNS-03 | TBD | Pending |
| TRNS-04 | TBD | Pending |
| TRNS-05 | TBD | Pending |
| TRNS-06 | TBD | Pending |
| TRCK-01 | TBD | Pending |
| TRCK-02 | TBD | Pending |
| TRCK-03 | TBD | Pending |
| TRCK-04 | TBD | Pending |
| TRCK-05 | TBD | Pending |
| MIX-01 | TBD | Pending |
| MIX-02 | TBD | Pending |
| MIX-03 | TBD | Pending |
| MIX-04 | TBD | Pending |
| CLIP-01 | TBD | Pending |
| CLIP-02 | TBD | Pending |
| CLIP-03 | TBD | Pending |
| CLIP-04 | TBD | Pending |
| MIDI-01 | TBD | Pending |
| MIDI-02 | TBD | Pending |
| MIDI-03 | TBD | Pending |
| MIDI-04 | TBD | Pending |
| DEV-01 | TBD | Pending |
| DEV-02 | TBD | Pending |
| DEV-03 | TBD | Pending |
| DEV-04 | TBD | Pending |
| DEV-05 | TBD | Pending |
| DEV-06 | TBD | Pending |
| SESS-01 | TBD | Pending |
| SESS-02 | TBD | Pending |
| SAMP-01 | TBD | Pending |
| SAMP-02 | TBD | Pending |
| SAMP-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 0
- Unmapped: 34 (pending roadmap creation)

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after initial definition*
