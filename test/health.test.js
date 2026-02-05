import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle, tools } from '../src/tools/health.js';
import { resetClient, setOscClient } from '../src/tools/shared.js';

function createMockOscClient(overrides = {}) {
  return {
    isReady: true,
    host: '127.0.0.1',
    sendPort: 11001,
    receivePort: 11000,
    async open() { this.isReady = true; },
    async healthCheck() { return true; },
    classifyError(err) {
      const msg = err?.message?.toLowerCase() || '';
      if (msg.includes('timeout')) return { type: 'TIMEOUT', message: err.message, recoverable: true };
      if (err?.code === 'EADDRINUSE') return { type: 'PORT_IN_USE', message: err.message, recoverable: false };
      if (!this.isReady) return { type: 'PORT_NOT_READY', message: 'not ready', recoverable: true };
      return { type: 'UNKNOWN', message: err.message, recoverable: false };
    },
    ...overrides
  };
}

describe('health tool definition', () => {
  it('exports tools array with ableton_status', () => {
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'ableton_status');
  });
});

describe('handle() - routing', () => {
  it('returns null for unknown tool name', async () => {
    const result = await handle('other_tool', {});
    assert.equal(result, null);
  });
});

describe('handle() - success path', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns connected:true when healthCheck succeeds', async () => {
    setOscClient(createMockOscClient());
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.connected, true);
  });

  it('response includes host, sendPort, receivePort', async () => {
    setOscClient(createMockOscClient());
    const result = await handle('ableton_status', {});
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.host, '127.0.0.1');
    assert.equal(data.sendPort, 11001);
    assert.equal(data.receivePort, 11000);
  });

  it('content type is "text"', async () => {
    setOscClient(createMockOscClient());
    const result = await handle('ableton_status', {});
    assert.equal(result.content[0].type, 'text');
  });

  it('content text is valid JSON', async () => {
    setOscClient(createMockOscClient());
    const result = await handle('ableton_status', {});
    assert.doesNotThrow(() => JSON.parse(result.content[0].text));
  });

  it('content array has exactly one element', async () => {
    setOscClient(createMockOscClient());
    const result = await handle('ableton_status', {});
    assert.equal(result.content.length, 1);
  });
});

describe('handle() - health check fails (Ableton not reachable)', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns isError:true when healthCheck returns false', async () => {
    setOscClient(createMockOscClient({
      async healthCheck() { return false; }
    }));
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, true);
  });

  it('error text starts with CONNECTION_FAILED', async () => {
    setOscClient(createMockOscClient({
      async healthCheck() { return false; }
    }));
    const result = await handle('ableton_status', {});
    assert.ok(result.content[0].text.startsWith('CONNECTION_FAILED'));
  });
});

describe('handle() - connection not established (open throws)', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns isError:true when open() throws', async () => {
    setOscClient(createMockOscClient({
      isReady: false,
      async open() { throw new Error('Cannot connect'); }
    }));
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, true);
  });

  it('error text starts with CONNECTION_FAILED for PORT_NOT_READY', async () => {
    const mock = createMockOscClient({
      isReady: false,
      async open() { throw new Error('Cannot connect'); }
    });
    setOscClient(mock);
    const result = await handle('ableton_status', {});
    assert.ok(result.content[0].text.startsWith('CONNECTION_FAILED'));
  });
});

describe('handle() - timeout', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns isError:true on timeout', async () => {
    setOscClient(createMockOscClient({
      async healthCheck() { throw new Error('Query timeout after 3000ms'); }
    }));
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, true);
  });

  it('error text starts with TIMEOUT', async () => {
    setOscClient(createMockOscClient({
      async healthCheck() { throw new Error('Query timeout after 3000ms'); }
    }));
    const result = await handle('ableton_status', {});
    assert.ok(result.content[0].text.startsWith('TIMEOUT'));
  });
});

describe('handle() - port conflict', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns isError:true on EADDRINUSE', async () => {
    const err = new Error('bind EADDRINUSE 127.0.0.1:11000');
    err.code = 'EADDRINUSE';
    setOscClient(createMockOscClient({
      isReady: false,
      async open() { throw err; }
    }));
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, true);
  });

  it('error text starts with PORT_CONFLICT', async () => {
    const err = new Error('bind EADDRINUSE 127.0.0.1:11000');
    err.code = 'EADDRINUSE';
    setOscClient(createMockOscClient({
      isReady: false,
      async open() { throw err; }
    }));
    const result = await handle('ableton_status', {});
    assert.ok(result.content[0].text.startsWith('PORT_CONFLICT'));
  });
});

describe('handle() - internal error', () => {
  beforeEach(() => {
    resetClient();
  });

  it('returns isError:true with INTERNAL_ERROR for unknown errors', async () => {
    setOscClient(createMockOscClient({
      async healthCheck() { throw new Error('Something unexpected'); }
    }));
    const result = await handle('ableton_status', {});
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.startsWith('INTERNAL_ERROR'));
  });
});
