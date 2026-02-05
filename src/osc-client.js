import osc from 'osc';

/**
 * Context-aware timeout values for different OSC operation types
 */
export const TIMEOUTS = {
  QUERY: 5000,        // Standard query operations
  COMMAND: 7000,      // Command operations that may trigger processing
  LOAD_DEVICE: 10000, // Device loading (slower)
  LOAD_SAMPLE: 10000, // Sample loading (slower)
  HEALTH_CHECK: 3000  // Fast health check
};

/**
 * OscClient - Handles OSC communication with AbletonOSC
 *
 * Features:
 * - Request-response correlation via OSC address patterns
 * - Per-address request queuing (prevents concurrent queries to same address)
 * - Context-aware timeouts
 * - Structured error classification
 * - Health checking
 */
export class OscClient {
  constructor(options = {}) {
    // Port configuration with env var support
    this.sendPort = options.sendPort || parseInt(process.env.OSC_SEND_PORT) || 11001;
    this.receivePort = options.receivePort || parseInt(process.env.OSC_RECEIVE_PORT) || 11000;
    this.host = options.host || process.env.OSC_HOST || '127.0.0.1';

    // State management
    this.isReady = false;
    this.lastError = null;

    // Request correlation: Map<address, {resolve, reject, timeoutId}>
    this.pendingRequests = new Map();

    // Request queuing: Map<address, Promise> - ensures serial execution per address
    this.requestQueues = new Map();

    // Listener support for future Phase 7 (real-time updates)
    this.listeners = new Map();

    // Create UDP port with metadata enabled for type-safe parsing
    this.udpPort = new osc.UDPPort({
      localAddress: this.host,
      localPort: this.receivePort,
      remoteAddress: this.host,
      remotePort: this.sendPort,
      metadata: true // CRITICAL: enables {type, value} objects instead of raw values
    });

    // Wire up event handlers
    this.udpPort.on('message', this.handleMessage.bind(this));
    this.udpPort.on('error', this.handleError.bind(this));
    this.udpPort.on('ready', () => {
      this.isReady = true;
    });
  }

  /**
   * Open the UDP port and wait for ready state
   * @returns {Promise<void>}
   */
  async open() {
    if (this.isReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onReady = () => {
        this.isReady = true;
        cleanup();
        resolve();
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this.udpPort.off('ready', onReady);
        this.udpPort.off('error', onError);
      };

      this.udpPort.once('ready', onReady);
      this.udpPort.once('error', onError);

      try {
        this.udpPort.open();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  /**
   * Close the UDP port and clean up pending requests
   */
  async close() {
    // Clear all pending request timeouts
    for (const [address, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Client closing'));
    }
    this.pendingRequests.clear();
    this.requestQueues.clear();

    // Close UDP port
    if (this.udpPort) {
      this.udpPort.close();
    }

    this.isReady = false;
  }

  /**
   * Send an OSC query and wait for response
   * Queues concurrent requests to the same address to prevent conflicts
   *
   * @param {string} address - OSC address pattern (e.g., '/live/song/get/tempo')
   * @param {Array} args - OSC arguments
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Array>} - Response args as plain values (not metadata objects)
   */
  async query(address, args = [], timeout = TIMEOUTS.QUERY) {
    if (!this.isReady) {
      throw new Error('OSC client not ready. Call open() first.');
    }

    // Queue management: serialize requests to the same address
    if (this.requestQueues.has(address)) {
      // Wait for previous request to complete before sending ours
      await this.requestQueues.get(address).catch(() => {
        // Ignore errors from previous request
      });
    }

    // Create the query promise
    const queryPromise = new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(address);
        this.requestQueues.delete(address);
        reject(new Error(`OSC query timeout after ${timeout}ms for address: ${address}`));
      }, timeout);

      // Store pending request for correlation in handleMessage
      this.pendingRequests.set(address, { resolve, reject, timeoutId });

      // Send OSC message
      const oscArgs = args.map(arg => ({
        type: this.inferType(arg),
        value: arg
      }));

      try {
        this.udpPort.send({
          address,
          args: oscArgs
        });
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(address);
        this.requestQueues.delete(address);
        reject(err);
      }
    });

    // Store in queue for serialization
    this.requestQueues.set(address, queryPromise);

    return queryPromise;
  }

  /**
   * Handle incoming OSC messages
   * Correlates responses with pending requests via address pattern
   *
   * @param {Object} msg - OSC message {address, args}
   */
  handleMessage(msg) {
    const { address, args } = msg;

    // Check for pending request
    if (this.pendingRequests.has(address)) {
      const pending = this.pendingRequests.get(address);
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(address);
      this.requestQueues.delete(address);

      // Extract plain values from metadata objects
      const plainValues = args.map(arg => arg.value);
      pending.resolve(plainValues);
      return;
    }

    // Check for registered listeners (Phase 7 support)
    if (this.listeners.has(address)) {
      const listener = this.listeners.get(address);
      const plainValues = args.map(arg => arg.value);
      listener(plainValues);
      return;
    }

    // Unhandled message - log at debug level if needed
    // (In production, this would use a logger)
  }

  /**
   * Infer OSC type tag from JavaScript value
   *
   * @param {*} val - JavaScript value
   * @returns {string} - OSC type tag
   */
  inferType(val) {
    if (val === null || val === undefined) {
      return 'N'; // OSC Nil
    }
    if (typeof val === 'boolean') {
      return val ? 'T' : 'F'; // OSC True/False
    }
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'i' : 'f'; // Integer or Float
    }
    if (typeof val === 'string') {
      return 's'; // String
    }
    // Default to string for unknown types
    return 's';
  }

  /**
   * Handle OSC errors
   *
   * @param {Error} err - Error object
   */
  handleError(err) {
    this.lastError = err;
    const classified = this.classifyError(err);

    if (classified.type === 'PORT_IN_USE') {
      console.error(`OSC Port Error: ${classified.message}`);
      console.error(`Check if another process is using port ${this.receivePort}`);
    }
  }

  /**
   * Classify an error for better error handling
   *
   * @param {Error} err - Error object
   * @returns {Object} - {type, message, recoverable}
   */
  classifyError(err) {
    const errMsg = err?.message?.toLowerCase() || '';

    // Port not ready
    if (!this.isReady) {
      return {
        type: 'PORT_NOT_READY',
        message: 'OSC client not ready. Call open() and wait for ready event.',
        recoverable: true
      };
    }

    // Timeout
    if (errMsg.includes('timeout')) {
      return {
        type: 'TIMEOUT',
        message: 'OSC request timed out. Check if AbletonOSC is running and responding.',
        recoverable: true
      };
    }

    // Port in use
    if (err?.code === 'EADDRINUSE' || errMsg.includes('address already in use')) {
      return {
        type: 'PORT_IN_USE',
        message: `Port ${this.receivePort} already in use. Close other OSC clients or change OSC_RECEIVE_PORT.`,
        recoverable: false
      };
    }

    // Unknown error
    return {
      type: 'UNKNOWN',
      message: err?.message || 'Unknown OSC error',
      recoverable: false
    };
  }

  /**
   * Health check: send /live/test and verify 'ok' response
   *
   * @returns {Promise<boolean>} - true if healthy, false otherwise
   */
  async healthCheck() {
    try {
      const response = await this.query('/live/test', [], TIMEOUTS.HEALTH_CHECK);
      return response[0] === 'ok';
    } catch (err) {
      return false;
    }
  }

  /**
   * Ensure connection is healthy, throw if not
   *
   * @throws {Error} - If health check fails
   */
  async ensureConnected() {
    const healthy = await this.healthCheck();
    if (!healthy) {
      throw new Error(
        'AbletonOSC health check failed. Troubleshooting steps:\n' +
        '1. Ensure Ableton Live 12 is running\n' +
        '2. Check that AbletonOSC is installed and enabled\n' +
        '3. Verify OSC ports: send=' + this.sendPort + ', receive=' + this.receivePort + '\n' +
        '4. Check firewall settings for UDP port ' + this.receivePort
      );
    }
  }
}
