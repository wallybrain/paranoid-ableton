# Technology Stack

**Project:** Paranoid Ableton (Ableton Live MCP Server)
**Researched:** 2026-02-05
**Overall Confidence:** MEDIUM-HIGH (verified user's MCP patterns, OSC/audio libs need npm verification)

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `@modelcontextprotocol/sdk` | `^1.25.3` | MCP server framework | **HIGH** ✓ |
| Node.js | `v20.20.0` | Runtime | **HIGH** ✓ |
| `zod` | `^4.3.6` | Schema validation | **HIGH** ✓ |

**Rationale:** All verified from user's existing MCP servers (n8n-mcp, sqlite-mcp, epistemic-mcp). ES modules pattern, stdio transport, tool registration via RequestHandler schemas.

### OSC Communication

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `osc` (npm) | `latest` | OSC protocol (UDP) | **MEDIUM** ⚠ |

**Rationale:** Most actively maintained Node.js OSC library. Supports UDP send/receive for AbletonOSC (ports 11000/11001).

**Alternatives rejected:**
- `node-osc` — less maintained, simpler but less feature-complete
- `osc-js` — adds browser support (unnecessary), more complex API

### AbletonOSC Bridge

| Component | Source | Purpose | Confidence |
|-----------|--------|---------|------------|
| AbletonOSC | `github.com/ideoforms/AbletonOSC` | Remote Script bridging LOM to OSC | **MEDIUM** ⚠ |

**Protocol:**
- Send to Ableton: UDP port 11001
- Receive from Ableton: UDP port 11000
- Message pattern: `/live/[object]/[action]/[property]`
- Examples:
  - `/live/song/get/tempo` — query tempo
  - `/live/song/set/tempo [float]` — set tempo
  - `/live/track/create/midi [int]` — create MIDI track
  - `/live/clip/get/notes [int track] [int clip]` — get MIDI notes

### Sample Metadata

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `music-metadata` | `latest` | Audio file metadata extraction | **MEDIUM** ⚠ |
| `file-type` | `latest` | Audio file type detection | **MEDIUM** ⚠ |
| `fast-glob` | `latest` | Fast file scanning | **MEDIUM** ⚠ |

**Rationale:** `music-metadata` is the standard for Node.js audio metadata extraction. Supports WAV/AIFF/MP3/FLAC. Can extract BPM, key, duration, sample rate, tags.

### Sample Indexing

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `better-sqlite3` | `^12.6.2` | Sample index database | **HIGH** ✓ |

**Rationale:** User already uses in sqlite-mcp-server. Perfect for metadata index with fast search queries.

**Schema:**
```sql
CREATE TABLE samples (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  directory TEXT NOT NULL,
  duration REAL,
  sample_rate INTEGER,
  bpm INTEGER,
  key TEXT,
  instrument_type TEXT,
  tags TEXT,
  mtime INTEGER,
  indexed_at INTEGER NOT NULL
);

CREATE INDEX idx_bpm ON samples(bpm);
CREATE INDEX idx_key ON samples(key);
CREATE INDEX idx_instrument_type ON samples(instrument_type);
```

## NOT Recommended

| Technology | Why Avoid |
|------------|-----------|
| `max-api` (Max for Live) | Adds M4L runtime dependency. AbletonOSC Remote Script is simpler. |
| Python MCP server | User's stack is 100% Node.js. Stay consistent. |
| WebSocket bridge | Adds complexity over UDP OSC. Keep it simple. |
| Custom Remote Script | AbletonOSC already provides ~95% LOM coverage. Don't reinvent. |
| External tools (ffmpeg, sox) | Adds system dependencies. `music-metadata` is pure Node.js. |
| JSON file for index | No indexing, slow search. SQLite is proven in user's stack. |

## Verified Patterns (from user's existing servers)

**ES modules:** `"type": "module"` in package.json

**MCP SDK imports:**
```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
```

**Server initialization:**
```javascript
const server = new Server(
  { name: "ableton-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);
```

**Error handling:** try/catch in tool handlers, return `{ isError: true }` on failure.

## Project Structure

```
/home/lwb3/ableton-mcp/
├── package.json
├── .env                      # OSC ports, sample directories
├── .gitignore
├── CLAUDE.md
├── src/
│   ├── index.js              # MCP server entry (stdio transport)
│   ├── osc-client.js         # OSC communication layer
│   ├── sample-indexer.js     # Sample scanning & metadata extraction
│   ├── sample-db.js          # SQLite database operations
│   └── tools/
│       ├── transport.js      # play, stop, record, tempo
│       ├── tracks.js         # create, delete, list tracks
│       ├── clips.js          # create clips, write MIDI notes
│       ├── devices.js        # load instruments/effects, parameters
│       ├── mixer.js          # volume, pan, sends, mute, solo
│       ├── samples.js        # search samples, load to track
│       └── session.js        # query full session state
└── data/
    └── samples.db            # SQLite index (gitignored)
```

## Installation

```bash
cd /home/lwb3/ableton-mcp
npm init -y

npm install @modelcontextprotocol/sdk@^1.25.3 \
            osc \
            music-metadata \
            file-type \
            fast-glob \
            better-sqlite3@^12.6.2 \
            zod@^4.3.6
```

## Open Questions

1. AbletonOSC installation path on Ubuntu (may differ from macOS)
2. AbletonOSC Live 12 Suite compatibility confirmation
3. `osc` npm package current version and maintenance status
4. `music-metadata` reliability for BPM/key extraction from WAV/AIFF
5. User's sample library formats (WAV, AIFF, MP3, FLAC?)
