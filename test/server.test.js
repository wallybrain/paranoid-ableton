import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getToolDefinitions, handleToolCall } from '../src/tools/registry.js';

describe('getToolDefinitions()', () => {
  it('returns an array', () => {
    const tools = getToolDefinitions();
    assert.ok(Array.isArray(tools));
  });

  it('includes ableton_status tool', () => {
    const tools = getToolDefinitions();
    const names = tools.map(t => t.name);
    assert.ok(names.includes('ableton_status'));
  });

  it('ableton_status has name, description, and inputSchema', () => {
    const tools = getToolDefinitions();
    const status = tools.find(t => t.name === 'ableton_status');
    assert.ok(status);
    assert.equal(typeof status.name, 'string');
    assert.equal(typeof status.description, 'string');
    assert.ok(status.inputSchema);
  });

  it('ableton_status inputSchema has type "object"', () => {
    const tools = getToolDefinitions();
    const status = tools.find(t => t.name === 'ableton_status');
    assert.equal(status.inputSchema.type, 'object');
  });
});

describe('handleToolCall()', () => {
  it('returns isError:true with UNKNOWN_TOOL for nonexistent tool', async () => {
    const result = await handleToolCall('nonexistent_tool', {});
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.startsWith('UNKNOWN_TOOL'));
  });

  it('UNKNOWN_TOOL response has content array with type "text"', async () => {
    const result = await handleToolCall('nonexistent_tool', {});
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, 'text');
  });

  it('UNKNOWN_TOOL message includes the tool name', async () => {
    const result = await handleToolCall('some_random_tool', {});
    assert.ok(result.content[0].text.includes('some_random_tool'));
  });
});
