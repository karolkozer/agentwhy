// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { permissionsOf } from '../../../../src/adapter/codex/events/turn-permissions.ts';

// X22: an approver the contract does not list is unrecognised, and the record incomplete - a name every object inherits
// (`toString`, `constructor`) included, which a lookup with `in` would have found on the prototype.
test('an approver named like an inherited property is unrecognised, never a function', () => {
  for (const approver of ['toString', 'constructor', '__proto__']) {
    const permissions = permissionsOf({ approvals_reviewer: approver });
    assert.equal(permissions.approver, 'unrecognised', approver);
    assert.equal(permissions.complete, false, approver);
  }
  assert.equal(permissionsOf({ approvals_reviewer: 'auto_review' }).approver, 'reviewer');
});
