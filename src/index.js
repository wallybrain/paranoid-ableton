import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getToolDefinitions, handleToolCall } from './tools/registry.js';
import { log } from './logger.js';

async function validateStartup() {
  const nodeMajor = parseInt(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) {
    log('error', 'Node.js v20+ required', { found: process.versions.node });
    process.exit(1);
  }

  try {
    await import('osc');
  } catch {
    log('error', 'Package "osc" not found', { fix: 'Run: npm install' });
    process.exit(1);
  }

  try {
    await import('@modelcontextprotocol/sdk/server/index.js');
  } catch {
    log('error', 'Package "@modelcontextprotocol/sdk" not found', { fix: 'Run: npm install' });
    process.exit(1);
  }

  log('info', 'Startup validation passed');
}

process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

const server = new Server(
  { name: 'paranoid-ableton', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getToolDefinitions() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

async function main() {
  await validateStartup();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', 'MCP server started', { name: 'paranoid-ableton', version: '0.1.0', transport: 'stdio' });
}

main().catch((err) => {
  log('error', 'Fatal startup error', { error: err.message });
  process.exit(1);
});
