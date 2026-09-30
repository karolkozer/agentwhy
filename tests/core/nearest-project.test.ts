import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nearestProject } from '../../src/core/nearest-project.ts';
import type { ProjectListing, ProjectSummary } from '../../src/core/project-catalogue.ts';
import { notAProject } from '../../src/setup/not-a-project.ts';

const project = (path: string, exists = true): ProjectSummary => ({
  id: path.replace(/[^A-Za-z0-9]+/g, '-'),
  path,
  exists,
  conversations: 1,
  newest: { modifiedAt: 0 },
});

const HOME_PATH = '/Users/someone';
const noProject = (path: string): boolean => notAProject(path, HOME_PATH) !== undefined;

const SHOP = project('/Users/someone/Projects/shop');
const ADMIN = project('/Users/someone/Projects/shop/admin');
const BLOG = project('/Users/someone/Projects/blog');
const GONE = project('/Users/someone/Projects/old-landing', false);
const LISTING: ProjectListing = { projects: [SHOP, ADMIN, BLOG, GONE], unreadable: 0 };

// which-project V12, V20: a person picks a folder near the one the agent keeps the conversations under.
test('a folder that is a project is itself', () => {
  assert.deepEqual(nearestProject('/Users/someone/Projects/shop', LISTING, noProject), { kind: 'itself', project: SHOP });
  assert.deepEqual(nearestProject('/Users/someone/Projects/shop/', LISTING, noProject), { kind: 'itself', project: SHOP });
});

test('a folder inside a project is offered the nearest project above it', () => {
  assert.deepEqual(nearestProject('/Users/someone/Projects/shop/src', LISTING, noProject), { kind: 'above', project: SHOP });
  assert.deepEqual(nearestProject('/Users/someone/Projects/shop/admin/src', LISTING, noProject), { kind: 'above', project: ADMIN }, 'the deepest, not the first');
});

test('a folder that holds projects is offered those inside it', () => {
  assert.deepEqual(nearestProject('/Users/someone/Projects', LISTING, noProject), { kind: 'inside', projects: [SHOP, ADMIN, BLOG] });
});

test('a folder that is gone is never offered, and a folder near nothing is none', () => {
  assert.deepEqual(nearestProject('/Users/someone/Projects/old-landing/src', LISTING, noProject), { kind: 'none' });
  assert.deepEqual(nearestProject('/srv/elsewhere', LISTING, noProject), { kind: 'none' });
  assert.deepEqual(nearestProject('/Users/someone/Projects/shop-two', LISTING, noProject), { kind: 'none' }, 'a name that begins the same is another folder');
});

// which-project V6, found by a review: Claude Code keeps the home directory's conversations like any folder's, and every
// folder under it was offered the home directory as the project above it.
test('the home directory and a root are never offered, though conversations are kept for them', () => {
  const listing: ProjectListing = { projects: [project(HOME_PATH), project('/'), BLOG], unreadable: 0 };

  assert.deepEqual(nearestProject('/Users/someone/Projects/new-app', listing, noProject), { kind: 'none' });
  assert.deepEqual(nearestProject('/Users/someone/Projects/blog/src', listing, noProject), { kind: 'above', project: BLOG });
  assert.deepEqual(nearestProject(HOME_PATH, listing, noProject), { kind: 'inside', projects: [BLOG] }, 'not itself');
  assert.deepEqual(nearestProject('/Users', listing, noProject), { kind: 'inside', projects: [BLOG] }, 'not inside');
});
