import { getOscClient, ensureConnected } from './shared.js';

export const tools = [
  {
    name: 'ableton_status',
    description: 'Check Ableton Live connectivity and return connection status. Call this before starting a session to verify Ableton is reachable.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export async function handle(name, args) {
  if (name !== 'ableton_status') return null;

  let client;
  try {
    client = getOscClient();

    if (!client.isReady) {
      await client.open();
    }

    const healthy = await client.healthCheck();

    if (healthy) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: true,
            host: client.host,
            sendPort: client.sendPort,
            receivePort: client.receivePort
          })
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `CONNECTION_FAILED: Ableton not reachable on port ${client.sendPort}. Ensure Ableton Live is running with AbletonOSC.`
      }],
      isError: true
    };
  } catch (err) {
    if (!client) {
      try { client = getOscClient(); } catch { /* no client available */ }
    }
    const classified = client
      ? client.classifyError(err)
      : { type: 'UNKNOWN', message: err.message };

    let errorText;
    switch (classified.type) {
      case 'PORT_NOT_READY':
        errorText = `CONNECTION_FAILED: OSC client not ready on port ${client?.sendPort || 'unknown'}`;
        break;
      case 'TIMEOUT':
        errorText = `TIMEOUT: No response from Ableton within 3000ms`;
        break;
      case 'PORT_IN_USE':
        errorText = `PORT_CONFLICT: Port ${client?.receivePort || 'unknown'} already in use`;
        break;
      default:
        errorText = `INTERNAL_ERROR: ${err.message}`;
        break;
    }

    return {
      content: [{ type: 'text', text: errorText }],
      isError: true
    };
  }
}
