import * as health from './health.js';

const modules = [health];

export function getToolDefinitions() {
  const tools = modules.flatMap(m => m.tools);

  const seen = new Set();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      console.error(`WARNING: Duplicate tool name "${tool.name}" detected in registry`);
    }
    seen.add(tool.name);
  }

  return tools;
}

export async function handleToolCall(name, args) {
  for (const mod of modules) {
    const result = await mod.handle(name, args);
    if (result !== null) return result;
  }

  return {
    content: [{ type: 'text', text: `UNKNOWN_TOOL: No handler for tool '${name}'` }],
    isError: true
  };
}
