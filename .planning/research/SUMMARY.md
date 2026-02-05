# Project Research Summary

**Project:** Paranoid Ableton (Ableton Live MCP Server)
**Domain:** Music production tooling / DAW automation
**Researched:** 2026-02-05
**Confidence:** MEDIUM-HIGH

## Executive Summary

Paranoid Ableton is an MCP server that bridges Claude Code to Ableton Live via OSC (Open Sound Control). The standard approach uses AbletonOSC, a mature Remote Script that exposes ~95% of Ableton's Live Object Model over UDP ports 11000/11001. This three-layer architecture (Claude → MCP Server → AbletonOSC → Ableton) is proven across multiple community projects and aligns perfectly with the user's existing Node.js MCP server patterns.

The recommended stack leverages the user's verified toolchain: `@modelcontextprotocol/sdk` v1.25.3, Node.js v20.20.0, `zod` for validation, and `better-sqlite3` for sample indexing. The two core differentiators are (1) full session awareness—providing Claude with complete LOM state snapshots rather than per-operation queries—and (2) intelligent sample library management through metadata indexing. These features move beyond basic remote control toward true AI-assisted music production.

The primary risks are UDP-related: packet loss, request-response correlation failures, and silent OSC errors. Mitigation requires acknowledgment patterns, promise-based request queuing, and generous timeouts. Sample scanning performance (5+ minutes for 10k+ files) demands async background processing, never blocking startup. AbletonOSC's 95% LOM coverage is strong, but pre-validate planned features against its API tables to avoid discovering gaps mid-build.

## Key Findings

### Recommended Stack

The stack builds on the user's proven MCP server patterns from n8n-mcp, sqlite-mcp, and epistemic-mcp. All core dependencies are verified working in the user's environment (Node.js v20.20.0, Ubuntu Linux). The only new dependencies are `osc` (UDP communication), `music-metadata` (audio file parsing), and `fast-glob` (directory scanning)—all standard, actively maintained npm packages.

**Core technologies:**
- `@modelcontextprotocol/sdk` v1.25.3: MCP server framework—verified in user's 3 existing servers, ES modules pattern, stdio transport, tool registration via RequestHandler schemas
- `osc` (npm): OSC protocol over UDP—most actively maintained Node.js OSC library, handles send/receive to AbletonOSC ports 11000/11001
- `better-sqlite3` v12.6.2: Sample metadata index—already used in user's sqlite-mcp-server, perfect for fast BPM/key/instrument type queries
- `music-metadata`: Audio file metadata extraction—industry standard for Node.js, supports WAV/AIFF/MP3/FLAC with BPM, key, duration, sample rate parsing
- AbletonOSC Remote Script: Bridge between OSC and Live Object Model—mature open-source project (github.com/ideoforms/AbletonOSC), provides ~95% LOM coverage

**Explicitly rejected:**
- Max for Live (M4L) approach: Adds runtime dependency, AbletonOSC Remote Script is simpler and doesn't require M4L license
- Python MCP server: User's stack is 100% Node.js, stay consistent
- Custom Remote Script: AbletonOSC already provides comprehensive API, don't reinvent

### Expected Features

Ableton MCP servers fall into two categories: basic remote controls (transport, tracks, clips) and intelligent assistants (session awareness, sample intelligence). The research identified four table-stakes features and two high-value differentiators.

**Must have (table stakes):**
- Transport control (play/stop/record/tempo) and track management (create/delete/arm/mute/solo/volume/pan)—every DAW controller needs this
- Scene and clip operations (list/launch/stop/create)—core workflow in Ableton's session view
- Device access (list devices, toggle on/off, get/set parameters)—necessary for sound design control
- MIDI clip editing (create clips, add/remove notes, set loop points)—enables Claude to compose

**Should have (competitive differentiators):**
- Full session awareness—complete LOM state snapshot (tracks, routing, devices, clips, parameters) allowing Claude to make context-aware decisions rather than blind per-operation commands. Complexity: Medium (1500-2500 LOC). This is the primary differentiator over existing projects.
- Sample library metadata indexing—scan user sample directories, extract BPM/key/duration/format, parse filenames for instrument type/character, enable metadata-driven search ("find me a punchy kick in C"). Complexity: Medium (1300-2000 LOC). Unique feature not seen in competitor projects.

**Defer (v2+):**
- Arrangement view operations (automation envelopes, waveform data)—session view is the primary Ableton workflow for electronic music production
- Universal VST/AU plugin control—plugin parameter APIs are inconsistent, focus on Ableton native devices first
- Real-time performance control—MCP has 10-50ms network latency, not suitable for live triggering
- Audio file streaming—large binary data inefficient over JSON-RPC, use file paths instead

### Architecture Approach

The architecture follows a three-layer design with clear separation of concerns. The MCP server (Node.js) sits between Claude Code (stdio transport) and Ableton Live (OSC over UDP), with a separate SQLite-backed sample indexer as an independent subsystem. Component boundaries are organized by domain (transport, tracks, clips, devices, mixer, samples, session) with each tool module handling a specific area of functionality.

**Major components:**
1. **OSC Client (osc-client.js)** — Manages UDP send/receive to AbletonOSC ports 11000/11001, implements request-response correlation via promise queue (critical: UDP has no correlation IDs), connection health checks, timeouts
2. **Tool Modules (tools/*.js)** — Domain-specific implementations (transport, tracks, clips, devices, mixer, scenes, samples, session), each tool calls OSC client for Ableton operations or sample DB for search operations
3. **Sample Indexer (sample-indexer.js + sample-db.js)** — Independent subsystem: scans directories with fast-glob, extracts metadata via music-metadata, parses filenames for instrument type/key/BPM, stores in SQLite with indexes on searchable fields
4. **MCP Server (index.js)** — Tool registration, request routing, stdio transport—follows exact pattern from user's existing servers (n8n-mcp, sqlite-mcp, epistemic-mcp)

**Critical patterns:**
- Request-response correlation: Promise queue per OSC address pattern, prevents mismatched responses when multiple queries are in flight
- Graceful degradation: Check connection health on startup, return clear error messages when Ableton not running or AbletonOSC not loaded
- State caching strategy: Use listeners for hot state (tempo, playing, track list), query on demand for cold state (device parameters), build session snapshots from cached + fresh queries
- Sample scanning: Never block startup, scan only when explicitly requested, use async background processing, incremental re-indexing via mtime tracking

### Critical Pitfalls

Research identified seven critical pitfalls with concrete prevention strategies. Most relate to UDP's unreliable nature and OSC's lack of built-in error handling.

1. **UDP packet loss on localhost** — Even localhost UDP can drop packets under load. Prevention: Implement acknowledgment pattern (after every set command, query value back), retry logic with exponential backoff (max 3 retries), log all sent/received messages. Warning signs: Intermittent "worked sometimes" behavior. Phase 1 (OSC Client Foundation).

2. **Request-response correlation** — Async UDP with no correlation IDs leads to response mismatching. Prevention: Serialize queries per address pattern (don't send two `/live/song/get/tempo` simultaneously), use promise queue (one outstanding request per address at a time). Warning signs: Occasionally getting wrong values. Phase 1 (OSC Client Foundation).

3. **AbletonOSC LOM coverage gaps** — AbletonOSC covers ~95% of LOM but missing features include browser hierarchy, Drum Rack internals, automation envelopes. Prevention: Before each phase, verify AbletonOSC supports all needed operations, read API tables thoroughly, have fallback plan (contribute PRs or supplementary Remote Script). Phase 0 (Pre-build validation).

4. **Ableton busy state** — Heavy operations (loading samples, rendering, complex Live Sets) block Ableton's main thread including OSC handler. Prevention: Use context-aware timeouts (load instrument: 10s, load sample: 10s, general query: 5s), distinguish "no response" from "delayed response". Warning signs: Timeouts during specific operations. Phase 1 (OSC Client Foundation).

5. **Sample library scan performance** — Scanning 10k+ files with metadata extraction takes 5+ minutes. Prevention: Never scan at startup, scan only on explicit `scan_library` tool call, use async background processing with progress reporting, incremental scanning (track mtime), batch SQLite inserts. Phase 5 (Sample Indexer).

## Implications for Roadmap

Based on architectural dependencies and risk mitigation priorities, recommend 8 phases with clear build order. Phases 1-4 form the critical path to MVP. Phase 5 (Sample Indexer) can run in parallel with Phases 3-4 as it has no OSC dependency.

### Phase 1: OSC Client Foundation
**Rationale:** All Ableton control depends on reliable OSC communication. Must solve UDP correlation, timeouts, and error handling before building higher-level features. This phase addresses 4 of 7 critical pitfalls.
**Delivers:** osc-client.js with send/receive, promise-based request queue, connection health check, context-aware timeouts, acknowledgment patterns
**Avoids:** UDP packet loss (pitfall 1), request-response correlation bugs (pitfall 2), OSC port conflicts (pitfall 5), Ableton busy state mishandling (pitfall 4)
**Research needs:** SKIP—OSC protocol and `osc` npm package are well-documented, standard patterns exist

### Phase 2: MCP Server Shell
**Rationale:** Establish MCP SDK integration before building tools. Follows user's proven pattern from 3 existing servers. Decisions made here (tool granularity, error handling, schema validation) affect all subsequent phases.
**Delivers:** index.js with MCP SDK setup, stdio transport, tool registration framework, error propagation to Claude
**Uses:** `@modelcontextprotocol/sdk` v1.25.3 (verified in user's stack), `zod` for schema validation
**Avoids:** Tool granularity mismatch (pitfall 8)—aim for 30-50 tools total, grouped by user intent
**Research needs:** SKIP—User has 3 working examples (n8n-mcp, sqlite-mcp, epistemic-mcp), directly replicate pattern

### Phase 3: Core Controllers (Transport, Tracks, Mixer, Scenes)
**Rationale:** These are table-stakes features that establish basic Ableton control. Simple 1:1 OSC message mappings, low risk. Provides immediate value and foundation for MIDI editing and device control.
**Delivers:** tools/transport.js (play/stop/record/tempo), tools/tracks.js (create/delete/list), tools/mixer.js (volume/pan/sends/mute/solo/arm), tools/scenes.js (list/launch/create)
**Addresses:** Table stakes features—transport control, track management, scene operations
**Research needs:** SKIP—Straightforward OSC address mappings, well-documented in AbletonOSC API tables

### Phase 4: MIDI Clip Editing
**Rationale:** Enables Claude to compose (create clips, add notes, set loop points). Depends on Phase 3 (tracks must exist before creating clips). Moderate complexity: MIDI note number conventions, note timing validation.
**Delivers:** tools/clips.js (create clips, get/add/remove notes, set loop points, clip properties)
**Addresses:** Table stakes—MIDI clip editing
**Avoids:** MIDI note number convention confusion (pitfall 11)—standardize on MIDI numbers (0-127), provide note name conversion utilities
**Research needs:** LIGHT—MIDI note timing and Ableton's quantization behavior may need phase-specific research

### Phase 5: Sample Indexer (PARALLEL with Phases 3-4)
**Rationale:** Independent subsystem with no OSC dependency. Can develop in parallel with core controllers. Delivers high-value differentiator (metadata-driven sample search). Performance-critical: must handle 10k+ files without blocking.
**Delivers:** sample-db.js (SQLite operations), sample-indexer.js (scan/parse/index), tools/samples.js (search samples, get info)
**Addresses:** Differentiator—sample library metadata indexing with search
**Uses:** `better-sqlite3` (verified in user's stack), `music-metadata`, `fast-glob`
**Avoids:** Sample scan performance issues (pitfall 6)—async background scanning, incremental re-indexing; metadata format inconsistency (pitfall 7)—filename parsing fallback, merge multiple metadata sources
**Research needs:** MEDIUM—Filename parsing heuristics for instrument type/key/BPM need testing with user's actual sample library formats

### Phase 6: Device Control
**Rationale:** Depends on Phase 3 (tracks must exist). Enables sound design control (load instruments/effects, adjust parameters). Moderate risk: verify AbletonOSC supports needed device operations and preset browsing.
**Delivers:** tools/devices.js (list devices on track, load instrument/effect, get/set parameters, device on/off)
**Addresses:** Table stakes—device access; potential differentiator—device-specific parameter names (human-readable vs raw indexes)
**Avoids:** Device parameter name variability (pitfall 14)—query parameter names dynamically, never hardcode
**Research needs:** MEDIUM—Need to verify AbletonOSC's device browser API and preset loading capabilities (potential coverage gap per pitfall 3)

### Phase 7: Session Awareness
**Rationale:** Depends on Phases 3, 4, 6 (needs all state sources: tracks, clips, devices). Delivers primary differentiator. Builds complete LOM snapshot by combining cached state (from listeners) and fresh queries (devices, clips). Moderate risk: cache invalidation strategy.
**Delivers:** tools/session.js (full session state snapshot, track routing graph, device chain visualization, project statistics)
**Addresses:** Differentiator—full session awareness, enabling Claude to make intelligent context-aware decisions
**Avoids:** State caching without invalidation (pitfall 9)—use listeners for hot state, query on demand for cold state, never assume cache is fresh
**Research needs:** LIGHT—May need to research optimal wildcard query patterns for bulk LOM data retrieval

### Phase 8: Integration & Polish
**Rationale:** Ties together sample indexer (Phase 5) and device control (Phase 6). Enables workflow: search samples → load to track → add device → adjust parameters. Final refinements: connection management, graceful degradation, error message clarity.
**Delivers:** Sample-to-track loading, preset browsing integration, connection health monitoring, improved error classification
**Addresses:** Complete workflows combining all previous phases
**Avoids:** Error propagation opacity (pitfall 10)—clear error messages for timeout, invalid args, Ableton busy, not connected states
**Research needs:** SKIP—Integration testing, no new technical domains

### Phase Ordering Rationale

- **Critical path 1 → 2 → 3 → 4 = MVP:** OSC foundation enables MCP server, which enables core controllers, which enable MIDI editing. This delivers basic Ableton remote control.
- **Parallel work:** Phase 5 (Sample Indexer) can develop alongside 3-4 because it has no OSC dependency—pure file system and SQLite operations.
- **Dependency-driven:** Phase 6 (Devices) requires Phase 3 (tracks). Phase 7 (Session Awareness) requires Phases 3, 4, 6 (all state sources). Phase 8 (Integration) requires Phases 5 and 6.
- **Risk mitigation first:** Phase 1 addresses 4 of 7 critical pitfalls. Getting UDP correlation and error handling right upfront prevents cascading failures in higher-level features.
- **Value delivery:** Phases 3-4 deliver table-stakes features quickly. Phases 5, 7 deliver differentiators. Phase 6 bridges to Phase 8's complete workflows.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4 (MIDI Editing):** Ableton's note timing quantization and velocity curve behavior may need phase-specific research if users want fine-grained control
- **Phase 5 (Sample Indexer):** Filename parsing heuristics must adapt to user's actual sample library naming conventions—may need phase research with real sample paths
- **Phase 6 (Device Control):** AbletonOSC's device browser and preset loading API coverage is uncertain—need phase research to verify capabilities and design workarounds if gaps exist

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (OSC Foundation):** OSC protocol is standard, `osc` npm package well-documented
- **Phase 2 (MCP Server):** User has 3 working examples to replicate
- **Phase 3 (Core Controllers):** Straightforward 1:1 OSC message mappings per AbletonOSC API tables
- **Phase 7 (Session Awareness):** Builds on established Phase 3-6 patterns, no new technical domains
- **Phase 8 (Integration):** Testing and refinement, no new research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Core MCP dependencies verified from user's 3 existing servers. Only unknowns: `osc` npm version/stability and `music-metadata` BPM/key extraction reliability for user's sample formats |
| Features | **MEDIUM-HIGH** | Table stakes features verified across competitor projects. Differentiators (session awareness, sample indexing) are novel but technically feasible with known tools |
| Architecture | **HIGH** | Three-layer design is proven pattern. Component boundaries clear. OSC request-response correlation solution is well-understood from UDP programming literature |
| Pitfalls | **MEDIUM** | UDP issues well-documented. AbletonOSC coverage gaps identified but need validation. Sample scanning performance predictable but user's library size unknown |

**Overall confidence:** MEDIUM-HIGH

Research quality is strong for stack and architecture (verified from user's environment + established patterns). Feature confidence slightly lower because differentiators are untested in combination. Pitfall confidence medium because some risks (AbletonOSC gaps, sample library characteristics) require validation during implementation.

### Gaps to Address

- **AbletonOSC installation on Ubuntu:** Research verified macOS installation path and API capabilities, but user is on Ubuntu Linux. Installation directory may differ. Verify during Phase 0 setup.
- **AbletonOSC Live 12 Suite compatibility:** Research assumes compatibility based on project maintenance activity, but not explicitly verified. Test during Phase 0 setup.
- **User's sample library formats and naming conventions:** Research assumes standard formats (WAV/AIFF/MP3/FLAC) and recommends filename parsing heuristics, but user's actual library unknown. Validate during Phase 5 planning.
- **`osc` npm package current version:** Research recommends `osc` as most maintained option but didn't verify current version number or recent maintenance activity. Verify during Phase 1 npm install.
- **`music-metadata` BPM/key extraction accuracy:** Research confirms library supports these tags but accuracy depends on metadata presence and quality. Test with user's samples during Phase 5.
- **Device browser API in AbletonOSC:** Research identified browser navigation as "limited" but didn't verify exact capabilities. Investigate during Phase 6 planning to design preset browsing feature or defer to v2 if unsupported.

## Sources

### Primary (HIGH confidence)
- User's existing MCP servers at `/home/lwb3/n8n-mcp-server/`, `/home/lwb3/sqlite-mcp-server/`, `/home/lwb3/epistemic-mcp/`—verified package.json dependencies, SDK import patterns, tool registration schemas, error handling conventions
- `@modelcontextprotocol/sdk` v1.25.3 documentation—MCP protocol specification, server implementation patterns
- AbletonOSC GitHub repository (`github.com/ideoforms/AbletonOSC`)—API tables, OSC address patterns, LOM coverage, installation instructions

### Secondary (MEDIUM confidence)
- `osc` npm package README—UDP send/receive patterns, message format
- `better-sqlite3` documentation—schema design, indexing strategies (also verified from user's sqlite-mcp-server)
- `music-metadata` npm package documentation—supported formats, metadata extraction API
- Open Sound Control (OSC) protocol specification—UDP transport, message structure, bundle ordering
- Community MCP projects (ahujasid, Producer Pal)—feature comparison, architectural patterns (training knowledge)

### Tertiary (LOW confidence)
- Ableton Live 12 Suite feature set—inference from training knowledge, not verified against official changelog
- Sample library filename conventions—generic heuristics based on training knowledge, not user-specific data
- AbletonOSC browser API limitations—noted as "limited" in documentation but exact capabilities unclear

---
*Research completed: 2026-02-05*
*Ready for roadmap: yes*
