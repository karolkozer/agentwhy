// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
    { ...BODY, hideKeys: 'yes' },
  ];
  for (const fields of bad) assert.equal(typeof onboardingChoices(fields), 'string', JSON.stringify(fields));
});

test('a name R46 would refuse is still a request: refusing it is Finish', () => {
  assert.equal(typeof onboardingChoices({ ...BODY, protect: ['Read(x)'] }), 'object');
});

// `2026-11-05-a-key-in-what-it-read.md` KRD5: the page asks to hide keys by default; a body without the field is a request still.
test('KRD5: hiding keys rides along as true or false, and its absence asks for nothing', () => {
  assert.deepEqual(onboardingChoices({ ...BODY, hideKeys: true }), { ...onboardingChoices(BODY) as object, hideKeys: true });
  assert.deepEqual(onboardingChoices({ ...BODY, hideKeys: false }), { ...onboardingChoices(BODY) as object, hideKeys: false });
  assert.equal('hideKeys' in (onboardingChoices(BODY) as object), false);
});

