// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Run by `npm run check:package` inside Claude Code's own test kit, as `claude plugin test` on the packed plugin; `npm test` cannot load
// a module of the engine's. What the lines hold is `terminal-card.test.ts`'s; here is where the card is drawn and where it is not.
import { expect, test } from 'claude-code/testing';

const TOOL = 'mcp__plugin_agentwhy_agentwhy__what_happened';
const LIST = {
  about: 'list', scope: 'project', asked: '7d', checked: { read: 2, of: 2 }, groups: { attention: 1, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 1, partly: 0, failed: 0 },
  rows: [], recent: 0, rowsMore: 0, often: [], oftenMore: 0, namedOnly: 0,
};
const sent = (answer: object) => [{ type: 'text', text: 'words', _meta: { 'agentwhy/answer': answer } }];
const GOOD = sent({ about: 'okay', lang: 'en', list: LIST });
const call = (output: unknown, more: object = {}) => ({ tool_use_id: 'toolu_1', tool: TOOL, input: { about: 'okay' }, isRunning: false, isErrored: false, isInterrupted: false, output, ...more });
const beneath = (on: any) => on('ui.render', ($: any, e: any) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text>; });
const mounted = async ($: any, component: string, props: object, surface = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'agentwhy', surface, component, viewport: { columns: 100, rows: 50 }, props } as any);
  const found = { cards: (await ui.findAll({ type: 'Text', text: /^ agentwhy $/ })).length, engine: (await ui.find({ type: 'Text', text: /^engine$/ })) !== undefined };
  await ui.unmount();
  return found;
};
const CARD = { cards: 1, engine: false };
const LEFT = { cards: 0, engine: true };

test('the card is drawn for agentwhy’s own answer in the terminal', async ($, on) => {
  beneath(on);
  expect(await mounted($, 'ToolUse', call(GOOD))).toEqual(CARD);
});

test('another surface, another tool, a call still running, in error, cut short or shown in full is left to Claude Code', async ($, on) => {
  beneath(on);
  for (const surface of ['desktop', 'vscode', 'mobile']) {
    expect(await mounted($, 'ToolUse', call(GOOD), surface)).toEqual(LEFT);
    expect(await mounted($, 'ToolGroup', { calls: [call(GOOD)], isActive: false, isExpanded: false, isCallsOnly: true }, surface)).toEqual(LEFT);
  }
  for (const more of [{ tool: 'Bash' }, { tool: 'mcp__other__what_happened' }, { isRunning: true, output: undefined }, { isErrored: true, output: 'no' }, { isInterrupted: true }, { isExpanded: true }]) {
    expect(await mounted($, 'ToolUse', call(GOOD, more))).toEqual(LEFT);
  }
});

test('a shape it does not know is left to Claude Code', async ($, on) => {
  beneath(on);
  for (const output of [undefined, 'words', [], [{ type: 'text', text: 'words' }], sent({ about: 'okay', lang: 'en' }), sent({ about: 'okay', list: { ...LIST, groups: {} } }), sent({ about: 'summary', list: LIST })]) {
    expect(await mounted($, 'ToolUse', call(output))).toEqual(LEFT);
  }
});

test('in a folded run of calls the card stands for the line, or under it where other calls are in it', async ($, on) => {
  beneath(on);
  const other = { ...call({ stdout: '' }), tool: 'Bash' };
  const group = (calls: object[], more: object = {}) => mounted($, 'ToolGroup', { calls, isActive: false, isExpanded: false, isCallsOnly: true, ...more });
  expect(await group([call(GOOD)])).toEqual(CARD);
  expect(await group([call(GOOD), call(GOOD)])).toEqual({ cards: 2, engine: false });
  expect(await group([other, call(GOOD)])).toEqual({ cards: 1, engine: true });
  expect(await group([call(GOOD)], { isCallsOnly: false })).toEqual({ cards: 1, engine: true });
  expect(await group([call(GOOD)], { isExpanded: true })).toEqual(LEFT);
  expect(await group([other])).toEqual(LEFT);
  expect(await group([call(undefined, { isRunning: true })])).toEqual(LEFT);
  expect(await group([call(GOOD), call('no', { isErrored: true })])).toEqual({ cards: 1, engine: true });
});
