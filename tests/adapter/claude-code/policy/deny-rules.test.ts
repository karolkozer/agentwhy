import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { policyFromDenyRules, readDenyRules } from '../../../../src/adapter/claude-code/policy/deny-rules.ts';
import { protects } from '../../../../src/core/policy/policy.ts';

const SETTINGS = JSON.stringify({
  permissions: {
    deny: [
      'Read(./.env*)',
      'Read(./**/.npmrc)',
      'Edit(~/.claude/projects/**)',
      'Bash(cat:*.env*)',
      'Bash(strings:*.env*)',
      'WebFetch(domain:example.com)',
    ],
  },
});

// Test A7 from the other side: a deny rule names a tool and a route, not a resource. Reading the command
// patterns as paths would hand the reader a policy the tool never applied.
test('file rules become path patterns and command rules are counted as ignored', () => {
  const rules = readDenyRules(SETTINGS);

  assert.deepEqual(rules?.patterns, ['**/.env*', '**/.npmrc', '**/.claude/projects/**']);
  assert.equal(rules?.used, 3);
  assert.equal(rules?.ignored, 3, 'two Bash patterns and one WebFetch rule');
});

test('the resulting policy protects what the file rules named, and says where it came from', () => {
  const rules = readDenyRules(SETTINGS);
  assert.ok(rules !== undefined);

  const policy = policyFromDenyRules(rules, '/work/.claude/settings.json');

  assert.equal(protects(policy, 'apps/web/.env.development'), true);
  assert.equal(protects(policy, '/Users/someone/.claude/projects/x/y.jsonl'), true);
  assert.deepEqual(policy.origin, { kind: 'settings', path: '/work/.claude/settings.json', used: 3, ignored: 3 });
});

test('settings without a deny list yield nothing at all, rather than an empty policy', () => {
  assert.equal(readDenyRules('{}'), undefined);
  assert.equal(readDenyRules('{"permissions":{}}'), undefined);
  assert.equal(readDenyRules('not json'), undefined);
});
