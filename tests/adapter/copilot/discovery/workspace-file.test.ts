// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseWorkspace } from '../../../../src/adapter/copilot/discovery/workspace-file.ts';
import { PROJECT, SESSION, workspaceYaml } from '../../../helpers/copilot-session.ts';

test('workspace.yaml gives the session its id, folder, title, app and forks (§2.8, CPB35)', () => {
  assert.deepEqual(parseWorkspace(workspaceYaml({ id: SESSION, cwd: PROJECT, name: 'Fix the contact form', client: 'github/autopilot', forkCount: 1 })), {
    id: SESSION, project: PROJECT, title: 'Fix the contact form', client: 'github/autopilot', forkCount: 1,
  });
});

test('an empty name is no title, as a session closed before a message has (CPB35)', () => {
  assert.equal(parseWorkspace('id: x\nname:\ncwd: /Users/someone/p\n').title, undefined);
  assert.equal(parseWorkspace('id: x\nname: \n').title, undefined);
});

test('a quoted title is read the way YAML quotes it', () => {
  assert.equal(parseWorkspace("name: 'It''s: done'\n").title, "It's: done");
  assert.equal(parseWorkspace('name: "A \\"quoted\\" title: yes"\n').title, 'A "quoted" title: yes');
  assert.equal(parseWorkspace('name: plain words # a comment\n').title, 'plain words');
});

test('a value in a form no measurement covered is not read, rather than read wrong', () => {
  for (const value of ['|', '>-', '&anchor x', '*alias', '[a, b]', '{a: b}', "'unclosed", '"unclosed']) {
    assert.equal(parseWorkspace(`name: ${value}\n`).title, undefined, value);
  }
});

test('only top-level keys are read: an indented line, a list item and a comment are passed over', () => {
  const parsed = parseWorkspace('name: Top\n  name: nested\n- name: item\n# name: comment\nfork_count: two\n');
  assert.deepEqual(parsed, { title: 'Top' }, 'a fork count that is no number is not read');
});
