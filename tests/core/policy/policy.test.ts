import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { matchesGlob } from '../../../src/core/policy/glob.ts';
import { protectionOf, protects, type Policy } from '../../../src/core/policy/policy.ts';

function policyOf(patterns: readonly string[], allowed: readonly string[] = []): Policy {
  return {
    level: 'no-read',
    protected: patterns.map((pattern) => ({ pattern })),
    allowed,
    origin: { kind: 'default' },
  };
}

test('** crosses directories and * does not', () => {
  assert.equal(matchesGlob('apps/web/.env.development', '**/.env*'), true);
  assert.equal(matchesGlob('.env', '**/.env*'), true, '**/ also matches nothing at all');
  assert.equal(matchesGlob('/Users/someone/.ssh/id_rsa', '**/.ssh/**'), true);
  assert.equal(matchesGlob('apps/web/.env', '*/.env'), false, '* stops at a separator');
  assert.equal(matchesGlob('apps/.env', '*/.env'), true);
});

test('a pattern is anchored, and its dots are literal', () => {
  assert.equal(matchesGlob('config/.npmrc', '**/.npmrc'), true);
  assert.equal(matchesGlob('config/.npmrc.bak', '**/.npmrc'), false, 'anchored at the end');
  assert.equal(matchesGlob('config/anpmrc', '**/.npmrc'), false, 'the dot is not a wildcard');
});

// `**/secrets/**` matches `secrets/` and not `secrets`, and a command writes the directory both ways.
test('a protected directory is recognised with or without its trailing separator', () => {
  const policy = policyOf(['**/secrets/**']);

  assert.equal(protects(policy, 'secrets/'), true);
  assert.equal(protects(policy, 'secrets'), true);
  assert.equal(protects(policy, 'apps/secrets/api.key'), true);
  assert.equal(protects(policy, 'secretsmanager.ts'), false, 'and a file that merely starts the same is not');
});

test('a protected path reports which pattern protects it', () => {
  const policy = policyOf(['**/.env*', '**/secrets/**']);

  assert.equal(protectionOf(policy, 'apps/web/.env.development')?.pattern, '**/.env*');
  assert.equal(protects(policy, 'src/index.ts'), false);
});

// The exception is deliberate and therefore outranks every rule that would otherwise cover the path.
test('an exception wins over every protecting pattern', () => {
  const policy = policyOf(['**/.env*'], ['**/.env.example']);

  assert.equal(protects(policy, 'apps/web/.env.example'), false);
  assert.equal(protects(policy, 'apps/web/.env'), true);
});

// A tool that decides on its own that a template is safe will hide the case where someone left a real value in
// one. That exception is the user's to write, not ours to assume (spec §8.2).
test('the default policy grants no exceptions by itself', () => {
  assert.deepEqual(DEFAULT_POLICY.allowed, []);
  assert.equal(protects(DEFAULT_POLICY, 'apps/web/.env.example'), true);
  assert.equal(DEFAULT_POLICY.origin.kind, 'default');
});

// Found by measurement, not by imagination: with `**/.env*` one of the five refused calls of the measured
// session named no path the policy knew, because the file was not called `.env` but `<something>.env`.
test('an environment file is protected whether the name starts or ends with .env', () => {
  for (const path of ['.env', 'apps/web/.env.local', 'config/production.env']) {
    assert.equal(protects(DEFAULT_POLICY, path), true, path);
  }
  for (const path of ['src/environment.ts', 'docs/configuration.environment.json']) {
    assert.equal(protects(DEFAULT_POLICY, path), false, `${path} is a mention of the word, not a secret file`);
  }
});
