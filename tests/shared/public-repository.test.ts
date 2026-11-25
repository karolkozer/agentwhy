// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { PUBLIC_REPOSITORY } from '../../src/shared/public-repository.ts';

// `.ai/specs/2026-11-23-where-the-code-is.md` WC5: one address, the one `package.json` already names.

interface Manifest {
  readonly repository?: { readonly url?: string };
  readonly homepage?: string;
  readonly bugs?: { readonly url?: string };
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Manifest;

test('WC5: the address the product shows is the one package.json names as its repository, home page and issues', () => {
  assert.equal(manifest.repository?.url, `git+${PUBLIC_REPOSITORY}.git`);
  assert.equal(manifest.homepage, `${PUBLIC_REPOSITORY}#readme`);
  assert.equal(manifest.bugs?.url, `${PUBLIC_REPOSITORY}/issues`);
});

test('WC6: the address carries no parameter, no fragment and no trailing slash: a plain link to the repository', () => {
  const address = new URL(PUBLIC_REPOSITORY);
  assert.equal(address.protocol, 'https:');
  assert.equal(address.search, '');
  assert.equal(address.hash, '');
  assert.equal(address.href, PUBLIC_REPOSITORY, 'written as the browser writes it');
  assert.ok(!PUBLIC_REPOSITORY.endsWith('/'));
});
