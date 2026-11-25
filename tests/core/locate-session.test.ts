// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { locateSession } from '../../src/core/locate-session.ts';
import type { SessionCatalogue, SessionListing, SessionSummary } from '../../src/core/session-catalogue.ts';

const session = (id: string, folder: string): SessionSummary => ({ id, path: `${folder}/${id}`, modifiedAt: 0, delegations: 0, provider: 'claude-code' });

const SHOP = '/Users/someone/Projects/shop';
const BLOG = '/Users/someone/Projects/blog';
const OLD = '/Users/someone/Projects/old-landing';

/** A catalogue holding each folder's conversations, recording every folder it was asked for. */
function catalogue(byFolder: Readonly<Record<string, readonly string[]>>): SessionCatalogue & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    list: async (folder: string): Promise<SessionListing> => {
      asked.push(folder);
      const ids = byFolder[folder];
      return { directory: `/Users/someone/.claude/projects/${folder.replace(/\//g, '-')}`, found: ids !== undefined, searched: [], sessions: (ids ?? []).map((id) => session(id, folder)) };
    },
  };
}
/** A finder over each folder's conversations, by the record's name alone, counting how often it was asked. */
function finder(byFolder: Readonly<Record<string, readonly string[]>>) {
  const found = {
    asked: 0,
    find: async (key: string): Promise<SessionSummary | undefined> => {
      found.asked += 1;
      const folder = Object.keys(byFolder).find((each) => byFolder[each]?.includes(key));
      return folder === undefined ? undefined : session(key, folder);
    },
  };
  return found;
}

// `2026-11-20-ask-your-ai-why.md` AYO7, AYD10, AYD12 (measured 2026-11-22): after the AI moves into a sub-folder, the
// skill's line and its commands run there. The conversation is looked for where it is kept, never decided absent from
// one folder: the working folder, the folders above it by their own names, then by its record's name - nothing opened.
test('a conversation of the working folder is found there, and nothing else is asked', async () => {
  const here = catalogue({ [SHOP]: ['a'] });
  const wide = catalogue({});
  const byName = finder({});
  const found = await locateSession('a', SHOP, { catalogue: here, elsewhere: { catalogue: wide, finder: byName } });
  assert.equal(found.located?.folder, SHOP);
  assert.equal(found.located?.summary.id, 'a');
  assert.deepEqual(wide.asked, [], 'no folder above is looked into');
  assert.equal(byName.asked, 0);
});

test('from a sub-folder, the conversation is found in the folders above it, nearest first, before it is looked for by name', async () => {
  const here = catalogue({});
  const wide = catalogue({ [SHOP]: ['a'], [BLOG]: [] });
  const byName = finder({ [SHOP]: ['a'] });
  const found = await locateSession('a', SHOP + '/packages/web', { catalogue: here, elsewhere: { catalogue: wide, finder: byName } });
  assert.equal(found.located?.folder, SHOP, 'its project\'s folder, where its rules are read');
  assert.deepEqual(wide.asked, [SHOP + '/packages', SHOP], 'each folder above by its own name, and the search ends where it is found');
  assert.equal(byName.asked, 0, 'never looked for by name where a folder above held it');
  assert.deepEqual(here.asked, [SHOP + '/packages/web'], 'the working folder first');
  assert.equal(found.listing.found, false, 'and its listing is the one handed back');
});

// AYD12: past the folders above, a conversation is looked for by its record's name - nothing opened - and found with no
// folder of its own: its record names its project, and the report reads it there.
test('a conversation kept under a project above none of the working folder\'s folders is found by its name, with no folder', async () => {
  const byName = finder({ [OLD]: ['a'] });
  const found = await locateSession('a', '/private/tmp/scratch', { catalogue: catalogue({}), elsewhere: { catalogue: catalogue({ [BLOG]: [] }), finder: byName } });
  assert.equal(found.located?.summary.path, OLD + '/a');
  assert.equal(found.located?.folder, undefined, 'its folder is the one its own record names');
  assert.equal(byName.asked, 1);
});

test('a conversation kept nowhere is not found, and with no other place to look only the working folder is asked', async () => {
  const wide = catalogue({ [SHOP]: ['b'] });
  const nowhere = await locateSession('a', SHOP + '/src', { catalogue: catalogue({}), elsewhere: { catalogue: wide, finder: finder({ [SHOP]: ['b'] }) } });
  assert.equal(nowhere.located, undefined);
  assert.equal(wide.asked[0], SHOP, 'the folder above first');
  const alone = await locateSession('a', SHOP + '/src', { catalogue: catalogue({ [SHOP]: ['a'] }) });
  assert.equal(alone.located, undefined, 'without the places beyond, the folder alone');
});

// The page's name for a conversation: `codex-…` and `copilot-…` for the others (`sessionKey`).
test('a conversation is matched by the name the page gives it', async () => {
  const here: SessionCatalogue = { list: async () => ({ directory: '/x', found: true, searched: [], sessions: [{ ...session('a', SHOP), provider: 'codex' }] }) };
  assert.equal((await locateSession('codex-a', SHOP, { catalogue: here })).located?.summary.id, 'a');
  assert.equal((await locateSession('a', SHOP, { catalogue: here })).located, undefined);
});
