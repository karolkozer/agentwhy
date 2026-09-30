import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isOlder, plainVersion } from '../../src/shared/plain-version.ts';

// `nothing-updates-by-itself` U1, U2: only a release is compared, and nothing else is guessed at.
test('a plain version is three numbers, and nothing else is one', () => {
  assert.deepEqual(plainVersion('0.3.0'), [0, 3, 0]);
  assert.deepEqual(plainVersion('10.20.30'), [10, 20, 30]);
  for (const text of ['0.0.0-dev', '0.3.0-beta.1', '0.3', '0.3.0.1', '01.2.3', 'v0.3.0', '^0.3.0', '', 'latest']) {
    assert.equal(plainVersion(text), undefined, text);
  }
});

test('older is decided part by part, and never where either side is not plain', () => {
  assert.equal(isOlder('0.2.0', '0.3.0'), true);
  assert.equal(isOlder('0.2.9', '0.10.0'), true);
  assert.equal(isOlder('1.0.0', '0.9.9'), false);
  assert.equal(isOlder('0.3.0', '0.3.0'), false);
  assert.equal(isOlder('0.3.1', '0.3.0'), false);
  assert.equal(isOlder('0.2.0', '0.0.0-dev'), false);
  assert.equal(isOlder('0.3.0-beta.1', '0.3.0'), false);
});
