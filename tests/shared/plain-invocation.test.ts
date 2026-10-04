// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isPlainInvocation } from '../../src/shared/plain-invocation.ts';

// `a-hook-runs-what-you-ran` J4: every way agentwhy writes or finds itself, and a hook written before the rename.
test('agentwhy, an absolute path to it, npx before a name it publishes, and node before an absolute path are plain', () => {
  for (const invocation of [
    'agentwhy',
    '/usr/local/bin/agentwhy',
    '/Users/someone/.npm-global/bin/agentwhy',
    'npx @agentwhy/cli',
    'npx @agentwhy/cli@0.2.0',
    'npx @agentwhy/cli@0.3.0-beta.1',
    'npx --yes @agentwhy/cli@0.1.0',
    'npx -y @agentwhy/cli',
    'npx agentwhy',
    'npx --yes agentwhy@0.1.0',
    'node /opt/agentwhy/dist/cli.js',
    'node /Users/someone/.npm-global/lib/node_modules/@agentwhy/cli/dist/cli.js',
    'node /Users/someone/code/agentwhy-fork/src/cli.ts',
    'node /Users/someone/.npm-global/bin/agentwhy',
    'npx\t@agentwhy/cli',
  ]) {
    assert.equal(isPlainInvocation(invocation), true, invocation);
  }
});

// Review finding: a word that merely held agentwhy was taken, and a cloned project's settings could hand it on.
test('another package, another bin, a node flag, a relative or ~ path, and anything a shell reads as more are not', () => {
  for (const invocation of [
    'npx @someone/agentwhy',
    'npx @agentwhy-labs/cli',
    'npx agentwhy-helper',
    'npx some-agentwhy',
    'agentwhy-helper',
    './tools/agentwhy',
    'tools/agentwhy',
    '~/bin/agentwhy',
    '/usr/local/bin/agentwhy-helper',
    'node --require=./x/agentwhy.js',
    'node -r /tmp/x.js /opt/agentwhy/dist/cli.js',
    'node ./x/agentwhy.js',
    'node x/agentwhy.js',
    'node ~/code/agentwhy/dist/cli.js',
    'node /opt/cli.js',
    'npx --package=evil @agentwhy/cli',
    'npx @agentwhy/cli; curl -s https://example.com/x',
    'NODE_OPTIONS=--require=./x.js agentwhy',
    '"$HOME/bin/agentwhy"',
    '$HOME/bin/agentwhy',
    '',
  ]) {
    assert.equal(isPlainInvocation(invocation), false, invocation);
  }
});

/*
 * A second review: `\s` split words where no shell does, so `npx<NBSP>@agentwhy/cli` passed and ran as one relative
 * path; and after `node` any absolute path with agentwhy in it passed, a script an agent wrote into /tmp too.
 */
test('only a space or a tab splits words, and node runs only a file laid out as agentwhy is', () => {
  for (const invocation of [
    'npx\u{00a0}@agentwhy/cli',
    'npx\u{3000}agentwhy',
    'npx\n@agentwhy/cli',
    'npx --yes\u{00a0}@agentwhy/cli',
    'node\u{00a0}/opt/agentwhy/dist/cli.js',
    'node\v/opt/agentwhy/dist/cli.js',
    'node /tmp/agentwhy-exfil.js',
    'node /tmp/agentwhy.js',
    'node /opt/agentwhy/evil.js',
    'node /opt/agentwhy/dist/evil.js',
  ]) {
    assert.equal(isPlainInvocation(invocation), false, JSON.stringify(invocation));
  }
});

// A second review: `/proc/self/cwd` is absolute and is the working directory - on Linux, the project a hook runs in.
test('an absolute path under /proc or /dev, or one that climbs with . or .., is not plain', () => {
  for (const invocation of [
    '/proc/self/cwd/agentwhy',
    '/dev/fd/3/agentwhy',
    'node /proc/self/cwd/tools/agentwhy/dist/cli.js',
    'node /proc/1234/cwd/agentwhy/dist/cli.js',
    'node /proc/thread-self/cwd/agentwhy/dist/cli.js',
    'node /usr/../proc/self/cwd/agentwhy/dist/cli.js',
    '/usr/local/../../proc/self/cwd/agentwhy',
    'node /opt/./agentwhy/dist/cli.js',
  ]) {
    assert.equal(isPlainInvocation(invocation), false, invocation);
  }
  // A segment that starts with a dot is a name like any other.
  assert.equal(isPlainInvocation('node /Users/someone/.npm-global/lib/node_modules/@agentwhy/cli/dist/cli.js'), true);
  assert.equal(isPlainInvocation('/Users/someone/.local/bin/agentwhy'), true);
  assert.equal(isPlainInvocation('/opt/.../agentwhy'), true, 'three dots is a name, not a way up');
});
