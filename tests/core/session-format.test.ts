import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SessionFormats, type Recognition } from '../../src/core/session-format.ts';

// `2026-09-27-what-codex-wrote.md` X2, XD7: formats are tried in order, and the first that recognises the input has it.
test('the first format that recognises an input has it; the order is the stricter rule first', async () => {
  const tried: string[] = [];
  const format = (provider: 'codex' | 'claude-code', answer: Recognition) => ({
    provider, recognise: async () => { tried.push(provider); return answer; },
  });

  assert.deepEqual(await new SessionFormats([format('codex', 'recognised'), format('claude-code', 'recognised')]).select('x'), { kind: 'recognised', provider: 'codex' });
  assert.deepEqual(tried, ['codex'], 'a later format is not asked once one recognised the input');
  assert.deepEqual(await new SessionFormats([format('codex', 'unknown'), format('claude-code', 'recognised')]).select('x'), { kind: 'recognised', provider: 'claude-code' });
  assert.deepEqual(await new SessionFormats([format('codex', 'unavailable'), format('claude-code', 'unknown')]).select('x'), { kind: 'unavailable' });
  assert.deepEqual(await new SessionFormats([format('codex', 'unknown'), format('claude-code', 'unknown')]).select('x'), { kind: 'unknown' });
});

test('a provider registered twice is refused, so no key is ambiguous', () => {
  const answer = async (): Promise<Recognition> => 'unknown';
  assert.throws(() => new SessionFormats([{ provider: 'codex', recognise: answer }, { provider: 'codex', recognise: answer }]));
});
