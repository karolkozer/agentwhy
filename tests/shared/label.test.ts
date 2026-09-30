import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ABSENT_LABEL, INVALID_LABEL, toLabel } from '../../src/shared/label.ts';

test('labels keep identifiers and replace anything that could be free text', () => {
  assert.equal(toLabel('permission-rule'), 'permission-rule');
  assert.equal(toLabel('mcp__claude_ai_Notion__notion-search'), 'mcp__claude_ai_Notion__notion-search');
  assert.equal(toLabel('2.1.268'), '2.1.268');
  assert.equal(toLabel(2), '2');
  assert.equal(toLabel(true), 'true');
  assert.equal(toLabel(undefined), ABSENT_LABEL);

  assert.equal(toLabel('confirm what URL and secret it uses'), INVALID_LABEL);
  assert.equal(toLabel('line one\nline two'), INVALID_LABEL);
  assert.equal(toLabel('x'.repeat(65)), INVALID_LABEL);
  assert.equal(toLabel(''), INVALID_LABEL);
  assert.equal(toLabel({ nested: true }), INVALID_LABEL);
  assert.equal(toLabel(null), INVALID_LABEL);
});

test('known limit: an identifier-shaped value in a structural position is kept as a label', () => {
  // Documented in label.ts. The label guard stops free text; recognising secrets is the scanner's job (spec §5.4).
  assert.equal(toLabel('looks_like_an_identifier_but_could_be_a_token'), 'looks_like_an_identifier_but_could_be_a_token');
});
