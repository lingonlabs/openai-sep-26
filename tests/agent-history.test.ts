import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentHistory } from '../apps/server/src/agent.js';

test('legacy completion handoffs use structured assistant content for SDK continuation', () => {
  const input = [{ role: 'assistant' as const, content: 'Completion check: select a cell' }, { role: 'user' as const, content: 'Done' }];
  const result = normalizeAgentHistory(input);
  assert.deepEqual(result[0], { role: 'assistant', content: [{ type: 'output_text', text: 'Completion check: select a cell' }] });
  assert.equal(result[1], input[1]);
  assert.deepEqual(normalizeAgentHistory(result), result);
  assert.equal(input[0].content, 'Completion check: select a cell');
});
