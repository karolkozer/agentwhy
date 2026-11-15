// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { modelChips } from '../../../../src/report/render/report-page/model-chips.ts';

/** The English words alone, each tag a space. */
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[^<]*<\/span>/g, '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// `2026-11-15-which-model-it-ran-on.md` MR3d: one model is its id; more than one is a path the same AI took, said so.
test('one model is its id alone, and none is nothing', () => {
  assert.equal(modelChips(['claude-opus-5-5'], 'c'), '<code class="c model-chip">claude-opus-5-5</code>');
  assert.equal(modelChips([], 'c'), '');
});

test('two models are a path, and one line says the same AI changed model', () => {
  assert.equal(english(modelChips(['claude-fable-5-1', 'claude-opus-5-5'], 'c')), 'claude-fable-5-1 → claude-opus-5-5 The model changed while it worked.');
});

test('each arrow is held to the model it points at, so a narrow column breaks between models alone', () => {
  const html = modelChips(['a-1', 'b-2', 'c-3'], 'c');
  assert.equal(english(html), 'a-1 → b-2 → c-3 The model changed while it worked.');
  assert.equal([...html.matchAll(/<span class="model-next"><span class="model-arrow" aria-hidden="true">→<\/span> <code class="c model-chip">[^<]+<\/code><\/span>/g)].length, 2);
});

test('every language says the change, and an id is escaped', () => {
  const html = modelChips(['m<1', 'm-2'], 'c');
  assert.ok(html.includes('<span class="i18n" lang="pl">Model zmienił się w trakcie pracy.</span>'));
  assert.ok(html.includes('<span class="i18n" lang="de">Das Modell wechselte während der Arbeit.</span>'));
  assert.ok(html.includes('<code class="c model-chip">m&lt;1</code>') && !html.includes('m<1'));
});
