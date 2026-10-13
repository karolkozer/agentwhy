// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { cellCommands } from '../../../../src/adapter/codex/events/cell-commands.ts';

/** An array of `tools.exec_command` calls, each line as the panel's agent wrote one on 2026-10-13. */
const calls = (...lines: string[]): string =>
  lines.map((line) => `  tools.exec_command({cmd:${JSON.stringify(line)},"max_output_tokens":4000})`).join(',\n');
const LINES = ['cat docs/AGENTS.md', 'ls -la docs', 'rg --files --hidden docs'];

// `2026-10-13-each-command-its-own-result.md` ECB1: the cell of the maintainer's row, as written.
test('EC1: a cell that settles its commands together and returns each labelled by its place says how it labels', () => {
  const code = `const results = await Promise.allSettled([\n${calls(...LINES)}\n]);\n` +
    'for(let index = 0; index < results.length; index++) text({index,result:results[index]});\n';
  assert.deepEqual(cellCommands(code), { commands: LINES, unread: 0, alone: false, pairing: { by: 'label', label: 'index', spread: false } });
});

// ECB3: the forms measured on disk, and their spelling - each says the label and where the settled result is.
test('EC1: every measured form, however it is spelt', () => {
  const settled = (emission: string, declaration = 'const results'): unknown =>
    cellCommands(`${declaration} = await Promise.allSettled([\n${calls(...LINES)}\n]);\n${emission}`).pairing;
  const label = (name: string, spread: boolean) => ({ by: 'label', label: name, spread });
  assert.deepEqual(settled('results.forEach((r,i)=>text({i,...r}));'), label('i', true));
  assert.deepEqual(settled('results.forEach((x, i) => text(JSON.stringify({i, result: x})));'), label('i', false));
  assert.deepEqual(settled('results.forEach((x, i) => { text({ i, result: x }); });'), label('i', false));
  assert.deepEqual(settled('for (let index = 0; index < results.length; ++index) { text({index: index, result: results[index]}); }'), label('index', false));
  assert.deepEqual(settled('for (let at = 0; at < results.length; at += 1) text({ ...results[at], at })'), label('at', true));
  assert.deepEqual(settled('for (let i = 0; i < r.length; i++) text({result: r[i], i})', 'let r'), label('i', false));
  assert.deepEqual(settled('// each in its place\nresults.forEach((r, i) => text({ i, ...r })) /* done */'), label('i', true));
});

// EC6: the measured spellings of commands run one after another, each emitting its one part at once (ECB6).
test('EC6: statements that each run one command and emit it at once pair by their order', () => {
  const pairing = (code: string): unknown => cellCommands(code).pairing;
  assert.deepEqual(pairing('text(await tools.exec_command({cmd:"ls docs"}));\ntext(await tools.exec_command({cmd:"rg --files docs"}));'),
    { by: 'order', emits: ['result', 'result'] });
  assert.deepEqual(pairing('const r = await tools.exec_command({cmd:"pwd"}); text(r.output);\ntext(await tools.exec_command({cmd:"ls docs"}));'),
    { by: 'order', emits: ['output', 'result'] });
  assert.deepEqual(pairing('const result = await tools.exec_command({cmd:"python3 x.py"});\ntext(result.output);\ntext((await tools.exec_command({cmd:"cat a"})).output);'),
    { by: 'order', emits: ['output', 'output'] });
  assert.deepEqual(pairing('let a = await tools.exec_command({cmd:"ls"}) // first\ntext(a)\ntext(await tools.exec_command({cmd:"pwd"}))'),
    { by: 'order', emits: ['result', 'result'] });
});

// EC6: anything between a command and its part, or a part of no command, says no order.
test('EC6: a step that runs a command and does not emit it at once is no order', () => {
  const pairing = (code: string): unknown => cellCommands(code).pairing;
  // Both run before either emits: the parts' order is the code's, not the commands'.
  assert.equal(pairing('const a = await tools.exec_command({cmd:"ls"});\nconst b = await tools.exec_command({cmd:"pwd"});\ntext(b); text(a);'), undefined);
  // A command that never emits, beside one that does: two steps, one part.
  assert.equal(pairing('const a = await tools.exec_command({cmd:"ls"});\nconst b = await tools.exec_command({cmd:"pwd"});\ntext(b);'), undefined);
  assert.equal(pairing('text("ls:"); text(await tools.exec_command({cmd:"ls"})); text(await tools.exec_command({cmd:"pwd"}));'), undefined);
  assert.equal(pairing('text(await tools.exec_command({cmd:"ls"})); if (ok) text(await tools.exec_command({cmd:"pwd"}));'), undefined);
  assert.equal(pairing('const r = await tools.exec_command({cmd:"ls"}); text(r.output.trim()); text(await tools.exec_command({cmd:"pwd"}));'), undefined);
  assert.equal(pairing('const r = await tools.exec_command({cmd:"ls"}); text(other); text(await tools.exec_command({cmd:"pwd"}));'), undefined);
  assert.equal(pairing('text(await tools.exec_command({cmd:"ls"})); text(await tools.exec_command({cmd:"pwd"})); text("done");'), undefined);
});

// EC7: a forEach over the array that ran the commands, calling `text` once for each - `Promise.all` or `allSettled`.
test('EC7: a forEach that emits each element once pairs by the array’s order', () => {
  const pairing = (settle: string, emission: string): unknown =>
    cellCommands(`const results = await ${settle}([\n${calls(...LINES)}\n]);\n${emission}`).pairing;
  const order = (emit: string) => ({ by: 'order', emits: [emit, emit, emit] });
  assert.deepEqual(pairing('Promise.allSettled', 'results.forEach(r => text(r.status === "fulfilled" ? r.value : r.reason));'), order('result'));
  assert.deepEqual(pairing('Promise.allSettled', 'results.forEach((result, index) => text({folder: index === 0 ? "docs" : "src", result}));'), order('result'));
  assert.deepEqual(pairing('Promise.allSettled', 'results.forEach((result,index)=>text({index,...(result.status==="fulfilled"?{value:result.value}:{error:String(result.reason)})}));'), order('result'));
  assert.deepEqual(pairing('Promise.allSettled', 'results.forEach(text);'), order('result'));
  assert.deepEqual(pairing('Promise.all', 'results.forEach((r) => text(r.output));'), order('output'));
  assert.deepEqual(pairing('Promise.all', 'results.forEach((r, i) => { text(r); });'), order('result'));
  assert.deepEqual(pairing('Promise.all', 'results.forEach((r, i) => text(`--- ${i} ---\\n${r.output}`));'), order('result'), 'paired, though its parts hold no result object');
  // `.output` of a settled result is nothing; a forEach that emits twice, calls a tool or holds a function is no order.
  assert.deepEqual(pairing('Promise.allSettled', 'results.forEach((r) => text(r.output));'), order('result'));
  assert.equal(pairing('Promise.all', 'results.forEach((r) => { text("x"); text(r.output); });'), undefined);
  assert.equal(pairing('Promise.all', 'results.forEach((r) => text(tools.exec_command({cmd:"ls"})));'), undefined);
  assert.equal(pairing('Promise.all', 'results.forEach((r) => text([r].map((x) => x.output)));'), undefined);
  assert.equal(pairing('Promise.all', 'results.forEach((r) => text(r.output)); text("done");'), undefined);
  assert.equal(pairing('Promise.all', 'others.forEach((r) => text(r.output));'), undefined);
});

// EC3: anything that does not say whose each part is - or could emit a part of its own - pairs nothing.
test('EC3: a cell that neither labels each result by its place nor emits each in order pairs nothing', () => {
  const pairing = (code: string): unknown => cellCommands(code).pairing;
  const array = `const results = await Promise.allSettled([\n${calls(...LINES)}\n]);\n`;
  // A loop labelled by a place the code moved, or not over the array's places, is no EC1 - nor a forEach, EC7's.
  assert.equal(pairing(array + 'for (let i = 1; i < results.length; i++) text({i, result: results[i]});'), undefined);
  assert.equal(pairing(array + 'for (let i = 0; i <= results.length; i++) text({i, result: results[i]});'), undefined);
  assert.equal(pairing(array + 'for (let i = 0; i < results.length; i++) text({i, result: results[0]});'), undefined);
  assert.equal(pairing(array + 'other.forEach((r, i) => text({i, ...r}));'), undefined);
  // A statement more, before or after, could emit a part of its own.
  assert.equal(pairing(array + 'results.forEach((r, i) => text({i, ...r})); text("done");'), undefined);
  assert.equal(pairing('text("start");\n' + array + 'results.forEach((r, i) => text({i, ...r}));'), undefined);
  // A label the code moved is no label; the forEach still emits each element once, in the array's order (EC7).
  assert.deepEqual(pairing(array + 'results.forEach((r, i) => text({i: i + 1, ...r}));'), { by: 'order', emits: ['result', 'result', 'result'] });
});

test('EC3: an array that holds anything but written commands is no settled cell', () => {
  const settled = (elements: string): unknown =>
    cellCommands(`const results = await Promise.allSettled([\n${elements}\n]);\nresults.forEach((r, i) => text({i, ...r}));`).pairing;
  // ECO4: another tool beside the commands.
  assert.equal(settled(`${calls('ls')},\n  tools.web__run({q:"x"})`), undefined);
  // ECO2: a command built while the code runs.
  assert.equal(settled(`${calls('ls')},\n  tools.exec_command({cmd:"head -n 45 " + path})`), undefined);
  // An element that is more than one call.
  assert.equal(settled(`${calls('ls')},\n  ready ? tools.exec_command({cmd:"pwd"}) : null`), undefined);
  assert.equal(settled(`${calls('ls')},\n  tools.exec_command({cmd:"pwd"}).then((r) => r)`), undefined);
  // A trailing comma is the language's, and changes nothing.
  assert.deepEqual(settled(`${calls('ls', 'pwd')},`), { by: 'label', label: 'i', spread: true });
});
