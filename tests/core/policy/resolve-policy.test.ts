// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { resolvePolicy } from '../../../src/core/policy/resolve-policy.ts';
import type { Policy } from '../../../src/core/policy/policy.ts';

const fromFile: Policy = {
  level: 'no-disclose',
  protected: [{ pattern: '**/vault/**' }],
  allowed: [],
  origin: { kind: 'file', path: '/work/agentwhy.policy.json' },
};

const fromSettings: Policy = {
  level: 'no-read',
  protected: [{ pattern: '**/.env*' }],
  allowed: [],
  origin: { kind: 'settings', path: '/work/.claude/settings.json', used: 1, ignored: 2 },
};

test('an explicit file wins over the environment and the default', () => {
  const resolved = resolvePolicy({ file: { policy: fromFile }, settings: fromSettings });

  assert.deepEqual(resolved, { policy: fromFile });
});

test('without a file, the environment\'s own rules are used', () => {
  assert.deepEqual(resolvePolicy({ settings: fromSettings }), { policy: fromSettings });
});

test('with nothing configured, the default is used and says so', () => {
  const resolved = resolvePolicy({});

  assert.deepEqual(resolved, { policy: DEFAULT_POLICY });
  assert.equal(DEFAULT_POLICY.origin.kind, 'default');
});

// Falling back here would analyse the session under rules nobody chose, while the header claimed a policy was in
// force. Absence falls through; breakage stops.
test('a policy file that cannot be read stops the run rather than falling back', () => {
  const resolved = resolvePolicy({ file: { errors: ['"version" must be 1'] }, settings: fromSettings });

  assert.deepEqual(resolved, { errors: ['"version" must be 1'] });
});
