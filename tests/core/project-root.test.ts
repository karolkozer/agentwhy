import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { displayPath, displayPathsIn, insideProject, projectRootOf, withoutAbsolutePaths } from '../../src/core/project-root.ts';

test('one recorded directory is the project root', () => {
  assert.deepEqual(projectRootOf(['/a/project', '/a/project']), { kind: 'known', path: '/a/project' });
});

test('no recorded directory means no root, which is not the same answer as several', () => {
  assert.deepEqual(projectRootOf([]), { kind: 'absent' });
});

// Picking one of them would be the guess the whole tool exists to avoid: every path would then be shown
// relative to a directory that only half the session ran in.
test('several recorded directories leave the root ambiguous, counted rather than chosen', () => {
  assert.deepEqual(projectRootOf(['/a/first', '/a/second', '/a/first']), { kind: 'ambiguous', count: 2 });
});

test('a path under the project root is shown relative to it', () => {
  const root = { kind: 'known', path: '/Users/someone/Projects/app' } as const;

  assert.equal(displayPath('/Users/someone/Projects/app/apps/web/.env', root), 'apps/web/.env');
  // The root relative to itself is `.`, not an empty string - a report cannot show a path that renders as nothing.
  assert.equal(displayPath('/Users/someone/Projects/app/', root), '.');
  assert.equal(displayPath('/Users/someone/Projects/app', root), '.');
});

// A trailing separator is how the directory happened to be written, not a different directory.
test('the root matches whether or not it was written with a trailing separator', () => {
  assert.equal(displayPath('/a/project/apps/web/.env', { kind: 'known', path: '/a/project/' }), 'apps/web/.env');
});

// Shortening it would claim it lies inside the project, and "the agent left the project" is a finding of its own.
test('a path outside the project root is left exactly as written', () => {
  const root = { kind: 'known', path: '/a/project' } as const;

  assert.equal(displayPath('/etc/passwd', root), '/etc/passwd');
  assert.equal(displayPath('/a/project-other/.env', root), '/a/project-other/.env');
});

test('with no root established, every path stays as written', () => {
  assert.equal(displayPath('/a/project/.env', { kind: 'absent' }), '/a/project/.env');
  assert.equal(displayPath('/a/project/.env', { kind: 'ambiguous', count: 2 }), '/a/project/.env');
});

test('a path quoted inside free text is shown relative to the root as well', () => {
  const root = { kind: 'known', path: '/a/project' } as const;

  assert.equal(displayPathsIn('check /a/project/apps/web/.env for the secret', root), 'check apps/web/.env for the secret');
  assert.equal(displayPathsIn('nothing to replace here', root), 'nothing to replace here');
});

// `/a/proj` is a prefix of `/a/project-other` as text but not as a path. Replacing it there would invent a file.
test('a sibling directory sharing the root prefix is left alone', () => {
  assert.equal(displayPathsIn('/a/project-other/.env', { kind: 'known', path: '/a/project' }), '/a/project-other/.env');
});

// Review finding: the root sits inside a longer path as text and names nothing there. Replacing it invented
// `/backupsecret.env` - a file that exists nowhere, produced by the step meant to protect the reader.
test('the root is replaced only where it starts a path, never where it merely occurs', () => {
  const root = { kind: 'known', path: '/a/project' } as const;

  assert.equal(displayPathsIn('/backup/a/project/secret.env', root), '/backup/a/project/secret.env');
  assert.equal(displayPathsIn('/a/project-other/.env', root), '/a/project-other/.env');
  assert.equal(displayPathsIn('see /a/project/apps/web/.env', root), 'see apps/web/.env');
});

// One directory cannot be inside the project in a path field and above it in a sentence.
test('the bare root in free text becomes what a path field shows for it', () => {
  const root = { kind: 'known', path: '/a/project' } as const;

  assert.equal(displayPathsIn('look at /a/project now', root), 'look at . now');
  assert.equal(displayPath('/a/project', root), '.');
});

test('a path recorded relative to the working directory is inside the project', () => {
  const root = { kind: 'known', path: '/a/project' } as const;

  assert.equal(insideProject('apps/web/.env', root), true, 'a relative path was recorded from inside');
  assert.equal(insideProject('/a/project/apps/web/.env', root), true);
  assert.equal(insideProject('/etc/passwd', root), false);
  assert.equal(insideProject('/a/project-other/.env', root), false, 'a sibling is not a child');
  assert.equal(insideProject('/a/project/.env', { kind: 'absent' }), false, 'with no root, nothing is inside one');
});

// check-canary.mjs lists a Windows home path as a leak class, so these paths count as paths.
test('a Windows path is relativised and recognised like any other', () => {
  const root = { kind: 'known', path: String.raw`C:\Users\someone\app` } as const;

  assert.equal(displayPath(String.raw`C:\Users\someone\app\apps\web\.env`, root), String.raw`apps\web\.env`);
  assert.equal(insideProject(String.raw`C:\Users\someone\.ssh\id_rsa`, root), false);
  assert.equal(withoutAbsolutePaths(String.raw`check C:\Users\someone\other\.env`), 'check outside the project');
});
