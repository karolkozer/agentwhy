import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { notAProject } from '../../src/setup/not-a-project.ts';

const HOME = '/Users/someone';

// which-project V6: the two places a run may start that are no project.
test('the home directory is not a project, however it is written', () => {
  assert.equal(notAProject(HOME, HOME), 'home');
  assert.equal(notAProject(`${HOME}/`, HOME), 'home');
  assert.equal(notAProject(`${HOME}/Projects/..`, HOME), 'home');
  assert.equal(notAProject(HOME, `${HOME}/`), 'home');
});

test('the root of the file system is not a project', () => {
  assert.equal(notAProject('/', HOME), 'root');
});

test('a folder inside the home directory, or beside it, may be a project', () => {
  assert.equal(notAProject(`${HOME}/Projects/shop`, HOME), undefined);
  assert.equal(notAProject('/Users', HOME), undefined, 'the directory above home is not home');
  assert.equal(notAProject('/srv/home-else', '/srv/home'), undefined, 'a name that begins the same is another directory');
});

// Found by a review: the working directory is the physical path, and HOME may reach it through a link.
test('the home directory reached through a link is the home directory still', () => {
  assert.equal(notAProject('/data/home/someone', '/home/someone', '/data/home/someone'), 'home', 'the working directory, links followed');
  assert.equal(notAProject('/home/someone', '/home/someone', '/data/home/someone'), 'home', 'the path HOME names');
  assert.equal(notAProject('/data/home/someone/Projects/shop', '/home/someone', '/data/home/someone'), undefined);
  assert.equal(notAProject('/data/home/someone', '/home/someone'), undefined, 'without the real path, the link is not followed');
});

test('an empty home names no directory', () => {
  assert.equal(notAProject(process.cwd(), ''), undefined);
});
