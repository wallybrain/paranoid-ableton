import { OscClient } from '../osc-client.js';

let oscClient = null;

export function getOscClient() {
  if (!oscClient) {
    oscClient = new OscClient();
  }
  return oscClient;
}

export async function ensureConnected() {
  const client = getOscClient();
  if (!client.isReady) {
    await client.open();
  }
  return client;
}

export function resetClient() {
  oscClient = null;
}
