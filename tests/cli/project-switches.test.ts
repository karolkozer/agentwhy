import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { CommandResult } from '../../src/cli/cli-command.ts';
import { EXIT_CODE } from '../../src/cli/exit-codes.ts';
import { runSwitching, type RunIn, type SwitchAnswer, type SwitchSeams } from '../../src/cli/project-switches.ts';

const done = (output: string): CommandResult => ({ kind: 'completed', output, exitCode: EXIT_CODE.ok });

/** A run per folder, driven by the test: it can switch, say its address, and end. */
function runs() {
  const started: { folder: string; argv: readonly string[]; seams: SwitchSeams; end: (result: CommandResult) => void }[] = [];
  const runIn: RunIn = (folder, argv, seams) =>
    new Promise((resolve) => {
      started.push({ folder, argv, seams, end: resolve });
    });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return { runIn, started, tick };
}

// which-project V14, V18: one process, one run shown at a time, the terminal given back when the last one ends.
test('a switch starts start in the chosen folder, answers with its address, and the process waits for it', async () => {
  const { runIn, started, tick } = runs();
  const written: CommandResult[] = [];
  const chain = runSwitching(runIn, '/work/shop', ['--since', '7d'], (result) => written.push(result));
  await tick();
  const [shop] = started;
  assert.deepEqual([shop?.folder, shop?.argv, shop?.seams.handedOver, shop?.seams.arrivedFrom], ['/work/shop', ['--since', '7d'], undefined, undefined], 'the first run is handed nothing');

  const asked = (shop?.seams as SwitchSeams).switchTo('/work/blog', '7d', 'window');
  await tick();
  const blog = started[1];
  assert.deepEqual([blog?.folder, blog?.argv, blog?.seams.arrivedFrom], ['/work/blog', ['start', '--since', '7d'], 'window'], 'V16: the run is told where the page asked from');
  blog?.seams.handedOver?.('http://127.0.0.1:50000/tok/index.html');
  assert.deepEqual(await asked, { url: 'http://127.0.0.1:50000/tok/index.html' });

  shop?.end(done(''));
  await tick();
  assert.deepEqual(written, [done('')], 'the run switched from is written as it ends');
  blog?.end(done('The page is no longer served.\n'));
  assert.deepEqual(await chain, done('The page is no longer served.\n'), 'the last run shown is what the shell writes and exits with');
});

test('a run that ends before it serves answers the page with what it said, and the chain does not wait for it', async () => {
  const { runIn, started, tick } = runs();
  const chain = runSwitching(runIn, '/work/shop', [], () => undefined);
  await tick();
  const asked: Promise<SwitchAnswer> = (started[0]?.seams as SwitchSeams).switchTo('/work/empty', '7d', 'window');
  await tick();
  started[1]?.end(done('There are no AI chats in empty yet. Work with your AI here, then run agentwhy again.\n'));
  assert.deepEqual(await asked, { failed: 'There are no AI chats in empty yet. Work with your AI here, then run agentwhy again.' });

  started[0]?.end(done('The page is no longer served.\n'));
  assert.deepEqual(await chain, done('The page is no longer served.\n'));
});

test('a project switched to can switch on, and the chain follows it', async () => {
  const { runIn, started, tick } = runs();
  const chain = runSwitching(runIn, '/work/a', [], () => undefined);
  await tick();
  const toB = (started[0]?.seams as SwitchSeams).switchTo('/work/b', '1d', 'step');
  await tick();
  started[1]?.seams.handedOver?.('b');
  await toB;
  assert.equal(started[1]?.seams.arrivedFrom, 'step');
  const toC = (started[1]?.seams as SwitchSeams).switchTo('/work/c', '1d', 'window');
  await tick();
  assert.equal(started[2]?.seams.arrivedFrom, 'window', 'each run is told where its own page asked from');
  started[2]?.seams.handedOver?.('c');
  assert.deepEqual(await toC, { url: 'c' });

  started[0]?.end(done(''));
  started[1]?.end(done(''));
  await tick();
  started[2]?.end(done('last'));
  assert.deepEqual(await chain, done('last'));
});

// which-project V14, amended 2026-09-28: every run that served is known by its token to the runs after it.
test('each run says its token once it serves, and every run after knows it and its folder', async () => {
  const { runIn, started, tick } = runs();
  const chain = runSwitching(runIn, '/work/shop', [], () => undefined);
  await tick();
  started[0]?.seams.served('shop-token');
  const toBlog = (started[0]?.seams as SwitchSeams).switchTo('/work/blog', '7d', 'window');
  await tick();
  started[1]?.seams.served('blog-token');
  started[1]?.seams.handedOver?.('blog');
  await toBlog;
  assert.deepEqual(started[1]?.seams.pastRuns(), [{ token: 'shop-token', folder: '/work/shop' }, { token: 'blog-token', folder: '/work/blog' }]);
  started[0]?.end(done(''));
  started[1]?.end(done(''));
  await chain;
});
