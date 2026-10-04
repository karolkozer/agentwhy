// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OsNotifier } from '../../src/infrastructure/os-notifier.ts';

// The macOS path is not run here: a test must not put a notification on the machine running it. It was measured by hand
// (B4f), and `tests/e2e/watch.test.ts` runs `watch` with the terminal channel only for the same reason.
test('on a platform it does not support, the answer is false and nothing is run', async () => {
  assert.equal(await new OsNotifier('linux').notify('agentwhy', 'words'), false);
});
