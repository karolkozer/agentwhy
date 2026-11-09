// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `2026-11-05-a-key-in-what-it-read.md` KR1, KRB11: `agentwhy hide-keys` runs on every call of a person who turned it on, so a
// start must cost the scanner and no more. What it is linked to is held here, as `tests/architecture.test.ts` holds `cli.ts`.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const LINKED = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm;

function linkedFrom(file: string): readonly string[] {
  const source = readFileSync(join(SRC, file), 'utf8');
  return [...source.matchAll(LINKED)].flatMap((match) => {
    const specifier = match[1] ?? '';
    return specifier.startsWith('node:') ? [specifier] : specifier.startsWith('.') ? [relative(SRC, resolve(dirname(join(SRC, file)), specifier))] : [`package:${specifier}`];
  });
}

test('KR1: the hook reaches the scanner and its words, never the shell, the composition root, a package or a file', () => {
  const reached = new Set<string>();
  const queue = ['cli/hide-keys.ts'];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (reached.has(file)) continue;
    reached.add(file);
    if (file.startsWith('node:') || file.startsWith('package:')) continue;
    assert.ok(existsSync(join(SRC, file)), file);
    queue.push(...linkedFrom(file));
  }
  const offending = [...reached].filter((file) =>
    file === 'composition-root.ts' || file === 'cli/shell.ts' || file.startsWith('infrastructure/') || file.startsWith('package:') || file === 'node:fs' || file === 'node:fs/promises' || file === 'node:child_process');
  assert.deepEqual(offending, []);
  assert.ok(reached.has('core/redaction/swap-keys.ts'), 'the walk reached the scanner');
  assert.ok(!reached.has('cli/chosen-language.ts') && !reached.has('report/watch/preferences.ts'), 'the language is loaded only where there is a line to write');
  // `2026-11-09-codex-hides-keys.md` CH2: Codex runs it in every folder, so the project's switch is read only where a key was found.
  assert.ok(!reached.has('adapter/claude-code/settings/key-swap-project.ts') && !reached.has('adapter/claude-code/settings/hook-entries.ts'), 'the switch is read only where a key was found');
  assert.ok(reached.has('adapter/codex/hooks/tool-result-input.ts'), 'the walk reached Codex\'s input');
});

test('KR1: `cli.ts` reaches it by loading it, after the Node check, and links nothing new', () => {
  const entry = readFileSync(join(SRC, 'cli.ts'), 'utf8');
  assert.ok(entry.indexOf('floorVerdict(') < entry.indexOf("cli/hide-keys.ts'"));
  assert.deepEqual([...linkedFrom('cli.ts')].sort(), ['infrastructure/newer-node.ts', 'shared/node-floor.ts']);
});

test('KR10: the plugin gains no hook, so its users pay nothing unless they turn the switch on', () => {
  const hooks = readFileSync(fileURLToPath(new URL('../hooks/hooks.json', import.meta.url)), 'utf8');
  assert.ok(!hooks.includes('hide-keys') && !hooks.includes('PostToolUse'));
});
