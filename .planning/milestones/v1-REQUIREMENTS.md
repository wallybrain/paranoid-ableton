# Requirements Archive: v1 Paranoid Ableton

**Archived:** 2026-02-07
**Status:** SHIPPED

This is the archived requirements specification for v1.
For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

---

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
- [x] **DEV-05**: Claude can use human-readable parameter names for Ableton native devices *(fulfilled via CLAUDE.md Device Parameter Quick Reference)*
- [~] **DEV-06**: Claude can browse and load presets for native devices *(AbletonOSC limitation — no browser API for preset navigation)*

### Session Awareness

- [x] **SESS-01**: Claude can get a complete session state snapshot (tracks, clips, devices, parameters, routing)
- [x] **SESS-02**: Claude can get project statistics (track counts, clip counts, device chains, tempo overview)

### Sample Intelligence

- [x] **SAMP-01**: Claude can scan user sample directories and index metadata (BPM, key, duration, format)
- [x] **SAMP-02**: Claude can search samples by instrument type, key, BPM, or character
- [x] **SAMP-03**: Claude can load found samples into tracks or instruments

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
| DEV-05 | Phase 8 | Complete (via CLAUDE.md documentation) |
| DEV-06 | Phase 8 | Infeasible (no AbletonOSC browser API) |
| SESS-01 | Phase 7 | Complete |
| SESS-02 | Phase 7 | Complete |
| SAMP-01 | Phase 5 | Complete |
| SAMP-02 | Phase 5 | Complete |
| SAMP-03 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 34 total
- Shipped: 32 (94%)
- Blocked by external limitations: 2 (TRNS-06, DEV-06)

---

## Milestone Summary

**Shipped:** 32 of 34 v1 requirements (94%)

**Adjusted during implementation:**
- DEV-05: Originally "human-readable parameter names in code" → fulfilled via CLAUDE.md documentation + device_get_parameters runtime discovery (Phase 8 decision)

**Blocked (external):**
- TRNS-06: Song name/save — AbletonOSC does not expose these endpoints
- DEV-06: Preset browsing — AbletonOSC has no browser API for preset navigation

---
*Archived: 2026-02-07 as part of v1 milestone completion*
