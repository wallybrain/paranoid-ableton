# Pitfalls Research

**Project:** Paranoid Ableton (Ableton Live MCP Server)
**Researched:** 2026-02-05
**Confidence:** MEDIUM

## Critical Pitfalls

### 1. UDP Packet Loss on Localhost
**What:** Even localhost UDP can drop packets under high load, causing silent command failures.
**Why:** UDP has no delivery guarantee. If Ableton's OSC handler is busy, incoming packets may be dropped.
**Consequences:** Commands silently fail — Claude thinks it set a parameter but nothing changed.
**Prevention:**
- Implement acknowledgment pattern: after every set command, immediately query the value back
- Add retry logic with exponential backoff (max 3 retries)
- Log all sent/received messages for debugging
**Warning signs:** Intermittent "it worked sometimes" behavior, state drift between expected and actual
**Phase:** Phase 1 (OSC Client Foundation)

### 2. Request-Response Correlation
**What:** Async UDP with no built-in correlation IDs leads to response mismatching.
**Why:** AbletonOSC sends responses to the same address pattern as the query. If two queries arrive close together, responses may be matched to the wrong request.
**Consequences:** Wrong data returned to wrong tool call. Claude gets incorrect state.
**Prevention:**
- Serialize queries per address pattern (don't send two `/live/song/get/tempo` simultaneously)
- Use a promise queue: one outstanding request per address at a time
- Match responses by address pattern, not by order
**Warning signs:** Occasionally getting wrong values, especially under rapid tool calls
**Phase:** Phase 1 (OSC Client Foundation)

### 3. AbletonOSC LOM Coverage Gaps
**What:** AbletonOSC covers ~95% of the LOM but the missing 5% may include features you need.
**Why:** Some LOM operations are complex to expose over OSC (browser hierarchy, Drum Rack internals, automation envelopes).
**Consequences:** Discover mid-build that a planned feature can't be implemented via AbletonOSC.
**Prevention:**
- Before starting each phase, verify that AbletonOSC supports all needed operations
- Read AbletonOSC's README API tables thoroughly
- Have a fallback plan: contribute PRs to AbletonOSC or add a supplementary Remote Script
**Warning signs:** Can't find an OSC address for a needed operation
**Phase:** Phase 0 (Pre-build validation)

### 4. Ableton Busy State
**What:** Heavy operations (loading large samples, rendering, complex Live Sets) block Ableton's main thread, including the OSC handler.
**Why:** AbletonOSC runs as a Remote Script on Ableton's main thread. When Ableton is busy, OSC processing pauses.
**Consequences:** Timeouts that look like connection failures. False "Ableton not responding" errors.
**Prevention:**
- Use generous timeouts for operations that trigger heavy work (load instrument: 10s, load sample: 10s, general query: 5s)
- Distinguish between "no response" (timeout) and "Ableton busy" (delayed response)
- Add context-aware timeout values per operation type
**Warning signs:** Timeouts only during specific operations (loading plugins, creating many tracks)
**Phase:** Phase 1 (OSC Client Foundation)

### 5. OSC Port Conflicts
**What:** Other applications may already be using ports 11000/11001 (other OSC apps, TouchOSC, Oscleton, etc.).
**Why:** AbletonOSC uses hardcoded default ports. No negotiation protocol.
**Consequences:** Silent failure — server starts, sends messages, but nothing is listening. Or receives messages from wrong source.
**Prevention:**
- On startup, check if ports are available before binding
- Make ports configurable via .env file
- Include a connection health check that sends a test message and expects a response
**Warning signs:** Server starts "successfully" but all queries timeout
**Phase:** Phase 1 (OSC Client Foundation)

### 6. Sample Library Scan Performance
**What:** Scanning 10k+ sample files with metadata extraction can take 5+ minutes.
**Why:** Each file needs to be opened, parsed for metadata, and indexed. Audio metadata parsing is I/O bound.
**Consequences:** If done at startup, blocks server initialization. If done synchronously, blocks tool calls.
**Prevention:**
- Never scan at startup — scan only when explicitly requested via `scan_library` tool
- Use async/background scanning with progress reporting
- Implement incremental scanning (track mtime, only re-index changed files)
- Batch SQLite inserts (use transactions for 100+ inserts)
**Warning signs:** Server takes minutes to start, or `scan_library` tool times out
**Phase:** Phase 5 (Sample Indexer)

### 7. Metadata Format Inconsistency
**What:** WAV, AIFF, MP3, and FLAC use different metadata schemas. Many samples have no metadata at all.
**Why:** No universal standard for audio sample metadata. Producer sample packs vary wildly in tagging quality.
**Consequences:** BPM/key fields empty for most samples. Index is sparse and less useful.
**Prevention:**
- Never rely solely on embedded metadata — always parse filename and folder structure as fallback
- Priority order: embedded metadata > filename parsing > folder structure > unknown
- Build a normalization layer that merges all metadata sources
- Tolerate missing data gracefully (null fields are fine)
**Warning signs:** Most samples have null BPM/key after indexing
**Phase:** Phase 5 (Sample Indexer)

## Moderate Pitfalls

### 8. Tool Granularity Mismatch
**What:** Too many tiny tools (500+) overwhelms Claude's tool selection. Too few mega-tools makes parameters complex.
**Why:** Tempting to expose every OSC address as its own tool.
**Prevention:** Aim for 30-50 tools total, grouped by user intent. One tool per action, not per parameter.
**Phase:** Phase 2 (MCP Server Shell)

### 9. State Caching Without Invalidation
**What:** Caching session state but not invalidating when the user changes things in Ableton's UI.
**Why:** User clicks in Ableton don't trigger MCP updates unless listeners are active.
**Prevention:** Use listeners for frequently-queried state (tempo, track list). Query on demand for everything else. Never assume cache is fresh.
**Phase:** Phase 7 (Session Awareness)

### 10. Error Propagation Opacity
**What:** OSC errors silently disappear. Claude doesn't know why something failed.
**Why:** AbletonOSC may silently ignore invalid messages rather than returning an error.
**Prevention:** Build error classification early (timeout, invalid args, Ableton busy, not connected). Return clear error messages to Claude.
**Phase:** Phase 1-2 (Foundation)

### 11. MIDI Note Number Conventions
**What:** Confusion between MIDI note numbers (0-127) and note names (C3, C4). Different DAWs use different octave numbering.
**Why:** Ableton uses C3 = MIDI 60. Some libraries use C4 = MIDI 60.
**Prevention:** Standardize on MIDI note numbers internally. Provide note name ↔ number conversion. Document which convention is used.
**Phase:** Phase 4 (MIDI Editing)

### 12. OSC Bundle Ordering
**What:** Assuming OSC bundles execute in order. UDP doesn't guarantee order.
**Why:** If you send "create track" then "add device to track" as separate messages, the second may arrive first.
**Prevention:** For multi-step operations, wait for confirmation of each step before sending the next. Never fire-and-forget sequences.
**Phase:** Phase 1 (OSC Client Foundation)

## Minor Pitfalls

### 13. Clip Name vs Index Confusion
**What:** Referencing clips by name vs by track/scene index. Names can be duplicated.
**Prevention:** Always use track_index + scene_index for clip identification. Names are display-only.

### 14. Device Parameter Name Variability
**What:** Same Ableton device may have slightly different parameter names across Live versions.
**Prevention:** Query parameter names dynamically, never hardcode.

### 15. Sample File Path Portability
**What:** Absolute paths in sample index break if sample directories move.
**Prevention:** Store both absolute path and path relative to configured sample root.

## Phase-Specific Warnings

| Phase | Key Risk | Mitigation |
|-------|----------|------------|
| 1: OSC Foundation | Port conflicts, correlation bugs | Health check on startup, promise queue |
| 2: MCP Shell | Too many/few tools | Design around user intent, aim for 30-50 |
| 3: Core Controllers | Ableton busy timeouts | Context-aware timeouts per operation |
| 4: MIDI Editing | Note number conventions | Standardize on MIDI numbers, provide conversion |
| 5: Sample Indexer | Scan performance, sparse metadata | Background scanning, filename parsing fallback |
| 6: Device Control | AbletonOSC gaps for browser/presets | Verify capabilities before building |
| 7: Session Awareness | Stale cache | Listeners for hot state, on-demand for cold state |

## Pre-Build Validation Checklist

Before writing any code, verify:

- [ ] AbletonOSC installs and loads in Live 12 Suite on Ubuntu
- [ ] OSC round-trip works (send tempo query, get response)
- [ ] Ports 11000/11001 are available on this machine
- [ ] AbletonOSC supports needed operations (check API tables for each planned tool)
- [ ] `osc` npm package handles UDP send/receive correctly
- [ ] Sample directories exist and contain scannable audio files
- [ ] `music-metadata` can parse user's sample formats
- [ ] `better-sqlite3` builds on this system (native addon)
