import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { OscClient, TIMEOUTS } from '../src/osc-client.js';

// Mock UDPPort class
class MockUDPPort extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.sentMessages = [];
    this.isOpen = false;
    this.autoRespond = true;
    this.responseMap = new Map();
  }

  open() {
    this.isOpen = true;
    // Emit ready asynchronously to simulate real behavior
    process.nextTick(() => {
      this.emit('ready');
    });
  }

  send(msg) {
    this.sentMessages.push(msg);

    // Auto-respond if enabled and response is configured
    if (this.autoRespond && this.responseMap.has(msg.address)) {
      const response = this.responseMap.get(msg.address);
      // Use queueMicrotask for immediate response
      queueMicrotask(() => {
        this.emit('message', response);
      });
    }
  }

  close() {
    this.isOpen = false;
  }

  // Test helpers
  simulateMessage(msg) {
    this.emit('message', msg);
  }

  simulateError(err) {
    this.emit('error', err);
  }

  setResponse(address, response) {
    this.responseMap.set(address, response);
  }
}

// Helper to create a mock OscClient
function createMockClient(options = {}) {
  const client = new OscClient(options);
  const originalPort = client.udpPort;
  const mockPort = new MockUDPPort(originalPort.options);

  // Remove event listeners from original port
  client.udpPort.removeAllListeners();

  // Replace with mock
  client.udpPort = mockPort;

  // Re-attach event handlers to mock port
  mockPort.on('message', client.handleMessage.bind(client));
  mockPort.on('error', client.handleError.bind(client));
  mockPort.on('ready', () => {
    client.isReady = true;
  });

  return { client, mockPort };
}

describe('OscClient constructor', () => {
  it('creates instance with default ports (11001 send, 11000 receive)', () => {
    const client = new OscClient();
    assert.equal(client.sendPort, 11001);
    assert.equal(client.receivePort, 11000);
  });

  it('accepts custom port configuration', () => {
    const client = new OscClient({ sendPort: 9001, receivePort: 9000 });
    assert.equal(client.sendPort, 9001);
    assert.equal(client.receivePort, 9000);
  });

  it('initializes pendingRequests as empty Map', () => {
    const client = new OscClient();
    assert.ok(client.pendingRequests instanceof Map);
    assert.equal(client.pendingRequests.size, 0);
  });

  it('isReady starts as false', () => {
    const client = new OscClient();
    assert.equal(client.isReady, false);
  });
});

describe('open()', () => {
  it('resolves when ready event fires', async () => {
    const { client, mockPort } = createMockClient();
    const openPromise = client.open();
    await openPromise;
    assert.ok(true); // If we reach here, promise resolved
  });

  it('sets isReady to true after open', async () => {
    const { client, mockPort } = createMockClient();
    assert.equal(client.isReady, false);
    await client.open();
    assert.equal(client.isReady, true);
  });
});

describe('close()', () => {
  it('sets isReady to false', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();
    assert.equal(client.isReady, true);
    await client.close();
    assert.equal(client.isReady, false);
  });

  it('rejects all pending requests with closing error', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    const query1 = client.query('/test/address1', [], 10000);
    const query2 = client.query('/test/address2', [], 10000);

    await client.close();

    await assert.rejects(query1, /Client closing/);
    await assert.rejects(query2, /Client closing/);
  });

  it('clears pending request timeouts', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    mockPort.autoRespond = false;  // Prevent auto-response
    const queryPromise = client.query('/test/address', [], 10000).catch(() => {});  // Catch rejection
    assert.equal(client.pendingRequests.size, 1);

    await client.close();
    assert.equal(client.pendingRequests.size, 0);

    await queryPromise;  // Wait for query to reject cleanly
  });
});

describe('query()', () => {
  it('sends OSC message with correct address and typed args', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    // Set up auto-response
    mockPort.setResponse('/live/song/get/tempo', {
      address: '/live/song/get/tempo',
      args: [{ type: 'f', value: 120.0 }]
    });

    const queryPromise = client.query('/live/song/get/tempo', [120, 'test'], 50);
    await queryPromise;

    assert.equal(mockPort.sentMessages.length, 1);
    assert.equal(mockPort.sentMessages[0].address, '/live/song/get/tempo');
    assert.equal(mockPort.sentMessages[0].args[0].type, 'i');
    assert.equal(mockPort.sentMessages[0].args[0].value, 120);
    assert.equal(mockPort.sentMessages[0].args[1].type, 's');
    assert.equal(mockPort.sentMessages[0].args[1].value, 'test');
  });

  it('resolves with plain values (not metadata objects) when response arrives', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    mockPort.setResponse('/live/song/get/tempo', {
      address: '/live/song/get/tempo',
      args: [
        { type: 'f', value: 120.5 },
        { type: 's', value: 'bpm' }
      ]
    });

    const result = await client.query('/live/song/get/tempo', [], 50);
    assert.deepEqual(result, [120.5, 'bpm']);
    // Ensure no metadata objects
    assert.equal(typeof result[0], 'number');
    assert.equal(typeof result[1], 'string');
  });

  it('rejects with timeout error after configured timeout', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    // Don't set a response - let it timeout
    mockPort.autoRespond = false;

    const queryPromise = client.query('/live/test', [], 50);

    await assert.rejects(
      queryPromise,
      (err) => {
        assert.ok(err.message.includes('timeout'));
        assert.ok(err.message.includes('50ms'));
        assert.ok(err.message.includes('/live/test'));
        return true;
      }
    );
  });

  it('throws if port not ready (isReady = false)', async () => {
    const { client, mockPort } = createMockClient();
    // Don't call open()

    await assert.rejects(
      client.query('/live/test', []),
      /OSC client not ready/
    );
  });

  it('serializes same-address queries (second query waits for first)', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    // Disable auto-respond for manual control
    mockPort.autoRespond = false;

    const query1Promise = client.query('/live/song/get/tempo', [], 100);
    const query2Promise = client.query('/live/song/get/tempo', [], 100);

    // At this point, only first query should have been sent
    assert.equal(mockPort.sentMessages.length, 1);

    // Respond to first query
    setImmediate(() => {
      mockPort.simulateMessage({
        address: '/live/song/get/tempo',
        args: [{ type: 'f', value: 120.0 }]
      });
    });

    const result1 = await query1Promise;
    assert.deepEqual(result1, [120.0]);

    // Now second query should be sent
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mockPort.sentMessages.length, 2);

    // Respond to second query
    setImmediate(() => {
      mockPort.simulateMessage({
        address: '/live/song/get/tempo',
        args: [{ type: 'f', value: 140.0 }]
      });
    });

    const result2 = await query2Promise;
    assert.deepEqual(result2, [140.0]);
  });

  it('allows parallel queries to DIFFERENT addresses', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    mockPort.setResponse('/live/song/get/tempo', {
      address: '/live/song/get/tempo',
      args: [{ type: 'f', value: 120.0 }]
    });
    mockPort.setResponse('/live/track/get/name', {
      address: '/live/track/get/name',
      args: [{ type: 's', value: 'Track 1' }]
    });

    const query1Promise = client.query('/live/song/get/tempo', [], 100);
    const query2Promise = client.query('/live/track/get/name', [0], 100);

    // Both should be sent immediately (not serialized)
    assert.equal(mockPort.sentMessages.length, 2);

    const [result1, result2] = await Promise.all([query1Promise, query2Promise]);
    assert.deepEqual(result1, [120.0]);
    assert.deepEqual(result2, ['Track 1']);
  });
});

describe('inferType()', () => {
  let client;

  beforeEach(() => {
    client = new OscClient();
  });

  it('integer number returns i', () => {
    assert.equal(client.inferType(42), 'i');
    assert.equal(client.inferType(0), 'i');
    assert.equal(client.inferType(-100), 'i');
  });

  it('float number returns f', () => {
    assert.equal(client.inferType(3.14), 'f');
    assert.equal(client.inferType(120.5), 'f');
    assert.equal(client.inferType(-0.5), 'f');
  });

  it('string returns s', () => {
    assert.equal(client.inferType('hello'), 's');
    assert.equal(client.inferType(''), 's');
    assert.equal(client.inferType('Track 1'), 's');
  });

  it('boolean true returns T', () => {
    assert.equal(client.inferType(true), 'T');
  });

  it('boolean false returns F', () => {
    assert.equal(client.inferType(false), 'F');
  });

  it('null returns N', () => {
    assert.equal(client.inferType(null), 'N');
  });
});

describe('classifyError()', () => {
  let client;

  beforeEach(() => {
    client = new OscClient();
  });

  it('returns PORT_NOT_READY when isReady is false', () => {
    client.isReady = false;
    const result = client.classifyError(new Error('any error'));
    assert.equal(result.type, 'PORT_NOT_READY');
    assert.ok(result.message.includes('not ready'));
    assert.equal(result.recoverable, true);
  });

  it('returns TIMEOUT when error message contains timeout', () => {
    client.isReady = true;
    const result = client.classifyError(new Error('Query timeout occurred'));
    assert.equal(result.type, 'TIMEOUT');
    assert.ok(result.message.includes('timed out'));
    assert.equal(result.recoverable, true);
  });

  it('returns PORT_IN_USE when error has EADDRINUSE', () => {
    client.isReady = true;
    const err = new Error('bind EADDRINUSE');
    err.code = 'EADDRINUSE';
    const result = client.classifyError(err);
    assert.equal(result.type, 'PORT_IN_USE');
    assert.ok(result.message.includes('already in use'));
    assert.equal(result.recoverable, false);
  });

  it('returns UNKNOWN for unrecognized errors', () => {
    client.isReady = true;
    const result = client.classifyError(new Error('Random error'));
    assert.equal(result.type, 'UNKNOWN');
    assert.ok(result.message);
    assert.equal(result.recoverable, false);
  });

  it('all error types have message and recoverable fields', () => {
    client.isReady = true;

    const errors = [
      new Error('any error'), // UNKNOWN (isReady=true)
      new Error('timeout'),   // TIMEOUT
      { code: 'EADDRINUSE', message: 'port in use' } // PORT_IN_USE
    ];

    // Also test PORT_NOT_READY
    client.isReady = false;
    errors.push(new Error('test'));

    for (const err of errors) {
      const result = client.classifyError(err);
      assert.ok(result.type);
      assert.ok(typeof result.message === 'string');
      assert.ok(typeof result.recoverable === 'boolean');
    }
  });
});

describe('healthCheck()', () => {
  it('returns true when /live/test response is ok', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    mockPort.setResponse('/live/test', {
      address: '/live/test',
      args: [{ type: 's', value: 'ok' }]
    });

    const result = await client.healthCheck();
    assert.equal(result, true);
  });

  it('returns false when query times out', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    // Disable auto-respond to let it timeout
    mockPort.autoRespond = false;

    // Use a shorter timeout for faster testing
    const originalQuery = client.query.bind(client);
    client.query = async function(address, args = [], timeout = 50) {
      return originalQuery.call(this, address, args, timeout);
    };

    const result = await client.healthCheck();
    assert.equal(result, false);
  });
});

describe('ensureConnected()', () => {
  it('resolves when healthCheck returns true', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    mockPort.setResponse('/live/test', {
      address: '/live/test',
      args: [{ type: 's', value: 'ok' }]
    });

    await client.ensureConnected();
    assert.ok(true); // If we reach here, it resolved
  });

  it('throws descriptive error when healthCheck returns false', async () => {
    const { client, mockPort } = createMockClient();
    await client.open();

    // Disable auto-respond to let it timeout
    mockPort.autoRespond = false;

    // Override query for faster timeout
    const originalQuery = client.query.bind(client);
    client.query = async function(address, args = [], timeout = 50) {
      return originalQuery.call(this, address, args, timeout);
    };

    await assert.rejects(
      client.ensureConnected(),
      /AbletonOSC health check failed/
    );
  });
});
