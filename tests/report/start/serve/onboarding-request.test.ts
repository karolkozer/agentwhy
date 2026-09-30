import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MOST_NAMES, onboardingChoices } from '../../../../src/report/start/serve/onboarding-request.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 3: the body of `api/onboarding` is the three steps' answers and nothing else.

const BODY = { scope: 'local', watch: true, protect: ['**/contract.pdf'], tell: [], modes: { env: 'tell' }, stopped: false, fine: true };

test('the three steps, as the page sends them', () => {
  assert.deepEqual(onboardingChoices(BODY), { scope: 'local', watch: true, protect: ['**/contract.pdf'], tell: [], modes: { env: 'tell' }, stopped: false, fine: true });
  assert.deepEqual(onboardingChoices({ ...BODY, scope: 'shared', protect: ['  **/data/**  '], tell: [' **/notes.txt '] }), {
    scope: 'shared', watch: true, protect: ['**/data/**'], tell: ['**/notes.txt'], modes: { env: 'tell' }, stopped: false, fine: true,
  });
});

test('a body that holds anything else, or anything missing, is not a request', () => {
  const bad: readonly Record<string, unknown>[] = [
    { ...BODY, project: '-Users-someone-work-shop' },
    { ...BODY, scope: 'everyone' },
    { ...BODY, scope: undefined },
    { ...BODY, watch: 'yes' },
    { ...BODY, stopped: 1 },
    { ...BODY, fine: null },
    { ...BODY, protect: '**/contract.pdf' },
    { ...BODY, protect: [7] },
    { ...BODY, protect: [''] },
    { ...BODY, protect: Array.from({ length: MOST_NAMES + 1 }, (_unused, at) => `**/file-${at}.pdf`) },
    { ...BODY, tell: '**/notes.txt' },
    { ...BODY, modes: ['env'] },
    { ...BODY, modes: { env: 'delete' } },
    { ...BODY, modes: null },
  ];
  for (const fields of bad) assert.equal(typeof onboardingChoices(fields), 'string', JSON.stringify(fields));
});

test('a name R46 would refuse is still a request: refusing it is Finish', () => {
  assert.equal(typeof onboardingChoices({ ...BODY, protect: ['Read(x)'] }), 'object');
});
