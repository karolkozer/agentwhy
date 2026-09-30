import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeSessionDiscovery } from '../../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { protectedAccesses } from '../../../../src/core/access/protected-access.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { loadOracle } from '../../../helpers/oracle.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

// Every assertion here is a count. The session holds live secrets, so a failure message must not be able to
// carry a path or a value out of it.

const REFERENCE_SESSION = process.env.AGENTWHY_REFERENCE_SESSION;

test(
  'the leak of the motivating case is found on the unredacted session, from the result',
  { skip: REFERENCE_SESSION === undefined && 'set AGENTWHY_REFERENCE_SESSION to the session the corpus was made from' },
  async () => {
    assert.ok(REFERENCE_SESSION);

    const accesses = protectedAccesses(await source.read(REFERENCE_SESSION), DEFAULT_POLICY);
    const fromResult = accesses.filter((access) => access.source === 'result').length;
    const fromInput = accesses.filter((access) => access.source === 'input').length;

    assert.ok(accesses.length > 0, 'the session is the one whose incident this project exists to explain');
    assert.ok(fromResult > 0, `a protected path reached a result (input ${fromInput}, result ${fromResult})`);
  },
);

// The corpus preserves structure and identifiers, and replaces the text around them - so the paths that made
// the incident visible are gone from it. That is the redaction working, and it is also a limit worth stating:
// this one blocking case can only be exercised against the unredacted session.
test('the redacted corpus cannot exercise the leak path, which is the redaction working', async () => {
  const fixture = fileURLToPath(new URL(`../../../fixtures/redacted/${loadOracle().source.sessionId}`, import.meta.url));

  const accesses = protectedAccesses(await source.read(fixture), DEFAULT_POLICY);

  assert.deepEqual(accesses, [], 'no protected path survives redaction, so none can be found here');
});
