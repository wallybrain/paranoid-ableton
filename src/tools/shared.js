import { OscClient } from '../osc-client.js';
import { log } from '../logger.js';

let oscClient = null;
let hasVerifiedConnection = false;
let healthCheckPromise = null;

export function getOscClient() {
  if (!oscClient) {
    oscClient = new OscClient();
  }
  return oscClient;
}

export async function ensureConnected() {
  const client = getOscClient();

  try {
    if (!client.isReady) {
      await client.open();
    }

    if (!hasVerifiedConnection) {
      if (!healthCheckPromise) {
        healthCheckPromise = client.ensureConnected()
          .then(() => { hasVerifiedConnection = true; })
          .finally(() => { healthCheckPromise = null; });
      }
      await healthCheckPromise;
    }

    return client;
  } catch (err) {
    log('warn', 'Connection failed, attempting reconnect', { error: err.message });
    return attemptReconnect(client);
  }
}

async function attemptReconnect(client) {
  const success = await client.reconnect();

  if (success) {
    log('info', 'Reconnection successful, resetting connection state');
    resetConnectionState();
    return client;
  }

  resetClient();
  throw new Error(
    'CONNECTION_LOST: Failed to reconnect to Ableton after 3 attempts.\n' +
    'Troubleshooting:\n' +
    '1. Ensure Ableton Live is running\n' +
    '2. Check AbletonOSC is enabled in Preferences > Link/Tempo/MIDI\n' +
    '3. Verify no other process is using UDP ports 11000/11001'
  );
}

export function resetConnectionState() {
  hasVerifiedConnection = false;
  healthCheckPromise = null;
  log('info', 'Connection state reset, next call will re-verify');
}

export function resetClient() {
  oscClient = null;
}

export function setOscClient(client) {
  oscClient = client;
}
