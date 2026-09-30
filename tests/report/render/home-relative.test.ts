import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { homeRelative } from '../../../src/report/render/home-relative.ts';

const HOME = '/Users/someone';

// which-project V1: where a folder is, as a person reads it.
test('a folder under the home directory is written from ~', () => {
  assert.equal(homeRelative(`${HOME}/Projects/shop`, HOME), '~/Projects/shop');
  assert.equal(homeRelative(`${HOME}/Projects/shop/`, HOME), '~/Projects/shop');
  assert.equal(homeRelative(HOME, HOME), '~');
  assert.equal(homeRelative(`${HOME}/..data/shop`, HOME), '~/..data/shop', 'a folder whose name begins with two dots is inside');
});

test('a folder anywhere else is written as it is', () => {
  assert.equal(homeRelative('/srv/shop', HOME), '/srv/shop');
  assert.equal(homeRelative('/srv/home-else/shop', '/srv/home'), '/srv/home-else/shop', 'a name that begins the same is another directory');
  assert.equal(homeRelative('/Users', HOME), '/Users', 'the directory above home');
});

test('an empty home shortens nothing', () => {
  assert.equal(homeRelative(`${HOME}/Projects/shop`, ''), `${HOME}/Projects/shop`);
});
