// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { notificationsIn } from '../../../src/adapter/claude-code/contract/task-notifications.ts';

test('notifications are read in the order written, each with the call its tag names', () => {
  const first = '<task-notification><tool-use-id> toolu_a </tool-use-id><result>x</result></task-notification>';
  const second = '<task-notification><status>completed</status></task-notification>';

  assert.deepEqual(notificationsIn(`before ${first} between ${second} after`), [{ callId: 'toolu_a', text: first }, { text: second }]);
});

test('a notification with no closing tag runs to the next one, or to the end', () => {
  const words = '<task-notification><tool-use-id>toolu_a</tool-use-id> cut <task-notification><tool-use-id>toolu_b</tool-use-id>';

  assert.deepEqual(notificationsIn(words).map((notification) => notification.callId), ['toolu_a', 'toolu_b']);
  assert.deepEqual(notificationsIn('no notification here'), []);
});
