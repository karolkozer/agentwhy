import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePolicy } from '../../../src/core/policy/parse-policy.ts';

const PATH = '/work/agentwhy.policy.json';

function errorsOf(document: object): readonly string[] {
  const result = parsePolicy(JSON.stringify(document), PATH);
  assert.ok('errors' in result, 'expected the document to be refused');
  return result.errors;
}

function policyOf(document: object) {
  const result = parsePolicy(JSON.stringify(document), PATH);
  assert.ok('policy' in result, `expected the document to be accepted: ${JSON.stringify(result)}`);
  return result.policy;
}

test('a well-formed policy is read, with its origin', () => {
  const policy = policyOf({
    version: 1,
    level: 'no-read',
    protected: ['**/.env*', '**/.npmrc'],
    allowed: ['**/.env.example'],
  });

  assert.equal(policy.level, 'no-read');
  assert.deepEqual(policy.protected, [{ pattern: '**/.env*' }, { pattern: '**/.npmrc' }]);
  assert.deepEqual(policy.allowed, ['**/.env.example']);
  assert.deepEqual(policy.origin, { kind: 'file', path: PATH });
});

// Accepting the richer shape today is what keeps a file written today valid when levels start being enforced.
test('an entry may carry its own level, which is read and kept', () => {
  const policy = policyOf({
    version: 1,
    level: 'no-read',
    protected: ['**/.env*', { path: '**/secrets/**', level: 'no-disclose' }],
  });

  assert.deepEqual(policy.protected, [{ pattern: '**/.env*' }, { pattern: '**/secrets/**', level: 'no-disclose' }]);
});

// A typo that silently disables a rule is worse than no policy file: it reads as a decision someone took.
test('an unknown key is refused rather than ignored', () => {
  const errors = errorsOf({ version: 1, level: 'no-read', protected: ['**/.env*'], protcted: ['**/.npmrc'] });

  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? '', /unknown key protcted/);
});

test('a missing version is refused, so a later format change is detected', () => {
  assert.match(errorsOf({ level: 'no-read', protected: ['x'] }).join('\n'), /"version" must be 1/);
  assert.match(errorsOf({ version: 2, level: 'no-read', protected: ['x'] }).join('\n'), /"version" must be 1/);
});

test('an unusable level or an empty protected list is refused', () => {
  assert.match(errorsOf({ version: 1, level: 'no-touching', protected: ['x'] }).join('\n'), /"level" must be one of/);
  assert.match(errorsOf({ version: 1, level: 'no-read', protected: [] }).join('\n'), /non-empty array/);
  assert.match(errorsOf({ version: 1, level: 'no-read', protected: [{ level: 'no-read' }] }).join('\n'), /entry 1 has no "path"/);
});

test('every problem in one document is reported at once', () => {
  const errors = errorsOf({ level: 'nope', protected: ['x'], nonsense: true });

  assert.equal(errors.length, 3, 'version, level and the unknown key');
});

test('text that is not a JSON object is refused by name', () => {
  const result = parsePolicy('["**/.env*"]', PATH);

  assert.ok('errors' in result);
  assert.match(result.errors.join(''), /is not a JSON object/);
});
