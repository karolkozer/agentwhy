// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchesName, reachOf } from '../../../src/core/access/search-reach.ts';

// worth-running-every-day R21a. The three commands below are the ones an agent ran, in this order, on the day a person
// had turned on "Stop the AI" and still saw `.env:2:SUPABASE_URL=…` in the reply.
test('the searches that reached .env through a folder are read as recursive searches starting there', () => {
  // A redirection's target stays a word, as a report reads it (`command-line.ts`): `2` and `/dev/null` are walked as
  // what they are on disk - nothing, and a device - so they reach no file.
  const [plain] = reachOf('ls -a && grep -rn "SUPABASE_URL" --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null').searches;
  assert.deepEqual(plain, {
    roots: ['.', '2', '/dev/null'], includes: [], excludes: [], excludeDirs: [{ glob: 'node_modules' }, { glob: '.next' }], hidden: true,
  });

  const [narrowed] = reachOf(`grep -rn "SUPABASE_URL" --include='.env*' --include='*.ts' . 2>/dev/null | grep -v node_modules`).searches;
  assert.deepEqual(narrowed?.includes, [{ glob: '.env*' }, { glob: '*.ts' }]);
});

test('grep: a cluster, -d recurse and --recursive all recurse; the pattern is not a place to search', () => {
  for (const command of ['grep -Rin KEY apps', 'grep -d recurse KEY apps', 'grep --recursive KEY apps', 'grep -r -e KEY apps']) {
    assert.deepEqual(reachOf(command).searches.map((search) => search.roots), [['apps']], command);
  }
  assert.deepEqual(reachOf('grep -r KEY').searches[0]?.roots, ['.'], 'no place given starts at the working directory');
  assert.deepEqual(reachOf('grep -rA3 KEY src').searches[0]?.roots, ['src'], 'a value attached to a flag is not a word');
});

test('grep without recursion searches nothing; its file arguments are still globs to expand', () => {
  assert.deepEqual(reachOf('grep KEY .env*'), { searches: [], globs: ['.env*'] });
  assert.deepEqual(reachOf('grep "KEY.*" src/app.ts'), { searches: [], globs: [] }, 'the pattern is never expanded');
});

test('ripgrep always recurses, skips hidden files unless told, and -r is --replace', () => {
  assert.deepEqual(reachOf('rg KEY').searches[0], { roots: ['.'], includes: [], excludes: [], excludeDirs: [], hidden: false });
  assert.equal(reachOf('rg --hidden KEY').searches[0]?.hidden, true);
  assert.equal(reachOf('rg -uu KEY').searches[0]?.hidden, true);
  assert.equal(reachOf('rg -u KEY').searches[0]?.hidden, false, 'one -u lifts ignore files, not hidden ones');
  assert.deepEqual(reachOf('rg -r X KEY lib').searches[0]?.roots, ['lib']);
  assert.deepEqual(reachOf("rg -g '!.env*' -g '*.ts' KEY").searches[0]?.excludes, [{ glob: '.env*' }]);
  assert.deepEqual(reachOf('rg --files').searches, [], 'listing file names opens nothing');
});

// Found in review (2026-09-26), measured on ripgrep 14.1.1: `**/.env` took every `.env` below the search, `config/.env`
// only the one at that path, and `--iglob '*.ENV'` took `.env`. The walk meets names, so each glob is read as the name
// it matches - and where the path decides, as more than ripgrep would open, never less.
test('ripgrep: a glob is read as the names it matches, at any depth and in any case', () => {
  const rg = (command: string) => reachOf(command).searches[0];

  assert.deepEqual(rg("rg -g '**/.env' KEY")?.includes, [{ glob: '.env' }], '**/ in front is any depth, which a name already is');
  assert.deepEqual(rg("rg -g '**/**/.env*' KEY")?.includes, [{ glob: '.env*' }]);
  assert.deepEqual(rg("rg -g 'app/config/.env' KEY")?.includes, [{ glob: '.env' }], 'a path is read as its last part, wherever it is');
  assert.deepEqual(rg("rg -g 'app/' KEY")?.includes, [{ glob: '*' }], 'a directory is not worked out: every file');
  assert.deepEqual(rg("rg -g '{.env,config/.env}' KEY")?.includes, [{ glob: '*' }], 'a / inside an alternative: every file');

  assert.deepEqual(rg("rg -g '!**/.env*' KEY")?.excludes, [{ glob: '.env*' }], 'left out at any depth');
  assert.deepEqual(rg("rg -g '!**/node_modules' KEY")?.excludeDirs, [{ glob: 'node_modules' }]);
  assert.deepEqual(rg("rg -g '!config/.env' KEY")?.excludes, [{ glob: 'config/.env' }], 'a path is kept, and matches no name');

  assert.deepEqual(rg("rg --iglob '*.ENV' -g '*.ts' KEY")?.includes, [{ glob: '*.ENV', caseless: true }, { glob: '*.ts' }]);
  assert.deepEqual(rg("rg --glob-case-insensitive -g '*.TS' KEY")?.includes, [{ glob: '*.TS', caseless: true }]);
  assert.deepEqual(rg("rg --glob-case-insensitive --no-glob-case-insensitive -g '*.TS' KEY")?.includes, [{ glob: '*.TS' }]);
  assert.deepEqual(rg("grep -r --include='*.ENV' KEY .")?.includes, [{ glob: '*.ENV' }], 'grep minds case');
});

test('a word the shell expands is a glob; an option and an echo are not', () => {
  assert.deepEqual(reachOf('cat .env* | head -3').globs, ['.env*']);
  assert.deepEqual(reachOf('echo *').globs, []);
  assert.deepEqual(reachOf('ls -la').globs, []);
});

test('a shell glob leaves a hidden name out unless the glob starts with a dot; --include does not', () => {
  assert.equal(matchesName('.env', '*', { period: true }), false);
  assert.equal(matchesName('.env.local', '.env*', { period: true }), true);
  assert.equal(matchesName('.env', '*', { period: false }), true);
  assert.equal(matchesName('page.tsx', '*.{ts,tsx}', { period: false }), true);
  assert.equal(matchesName('key.pem', '[kK]ey.pem', { period: false }), true);
  assert.equal(matchesName('a.ts', '*.tsx', { period: false }), false);
  assert.equal(matchesName('.env', '*.ENV', { period: false }), false);
  assert.equal(matchesName('.env', '*.ENV', { period: false, caseless: true }), true);
  assert.equal(matchesName('Key.PEM', '[k]ey.pem', { period: false, caseless: true }), true);
});

// Found by measuring every command of real transcripts (2026-09-24): a sed script holding `[data-wz-next]` next to an
// out-of-order range threw while being read as a glob, which in a hook is a failed command.
test('a word no regular expression can hold is read as text, never thrown over', () => {
  assert.equal(matchesName('x', '[z-a]', { period: true }), false);
  assert.equal(matchesName('[z-a]', '[z-a]', { period: true }), true);
  assert.doesNotThrow(() => reachOf(`sed -i 's|d.querySelector("[data-wz-next]")|x|' page.html`));
});
