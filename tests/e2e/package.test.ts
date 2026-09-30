import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// `specs/2026-09-16-worth-running-every-day.md` R1, R2. Measured before this test existed: the tarball held four files,
// one of them `src/cli.ts`, which imports modules that were not among them - `npx agentwhy` could not have run.

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RELATIVE_IMPORT = /^\s*(?:import|export)\s[^'";]*?from\s+'(\.[^']+)'/gm;

interface PackEntry {
  readonly files: readonly { readonly path: string }[];
}

test('the package holds the compiled command, everything it imports, and nothing else of the repository', async () => {
  // `prepack` builds, so this is the tarball `npm publish` would make.
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  const [entry] = JSON.parse(stdout.slice(stdout.indexOf('['))) as PackEntry[];
  const packed = new Set((entry?.files ?? []).map((file) => file.path));

  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.equal(normalize(manifest.bin.agentwhy ?? ''), 'dist/cli.js');
  assert.ok(packed.has('dist/cli.js'), 'dist/cli.js is packed');

  const missing: string[] = [];
  const typeScriptImports: string[] = [];
  const seen = new Set<string>();
  const queue = ['dist/cli.js'];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const target = normalize(join(dirname(file), match[1] ?? ''));
      if (target.endsWith('.ts')) typeScriptImports.push(`${file} -> ${target}`);
      else if (!packed.has(target)) missing.push(`${file} -> ${target}`);
      else queue.push(target);
    }
  }
  assert.deepEqual(typeScriptImports, [], 'no compiled module imports a .ts file');
  assert.deepEqual(missing, [], 'every module the command imports is packed');

  const foreign = [...packed].filter(
    (path) => !path.startsWith('dist/') && !['package.json', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'].includes(path),
  );
  assert.deepEqual(foreign, []);
  assert.deepEqual([...packed].filter((path) => path.endsWith('.html') || path.endsWith('.ts')), []);
});
