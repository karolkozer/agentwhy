// Regenerates the golden reports. Run it deliberately, then read the diff before committing it: a golden file
// that changes without anyone looking is a test that has stopped testing.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GOLDEN_SESSION_ID, goldenSessionFiles } from '../tests/helpers/golden-session.ts';

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const VARIANTS = [
  { name: '80', args: ['--width', '80'] },
  { name: '120', args: ['--width', '120'] },
  // The fallback of §7.5 constraint 2: the same report for a terminal whose LANG lacks UTF-8.
  { name: 'ascii', args: ['--width', '80', '--ascii'] },
  // Every section (R13): what the summary's last line points to.
  { name: 'full', args: ['--width', '100', '--full'] },
];

// The session is written where the CLI can read it and removed afterwards; it is never committed (see the helper).
const root = await mkdtemp(join(tmpdir(), 'agentwhy-golden-'));
try {
  for (const [relative, content] of Object.entries(goldenSessionFiles())) {
    await mkdir(dirname(join(root, relative)), { recursive: true });
    await writeFile(join(root, relative), content);
  }
  const input = join(root, `${GOLDEN_SESSION_ID}.jsonl`);

  for (const { name, args } of VARIANTS) {
    const { stdout } = await execFileAsync(process.execPath, [CLI, 'report', '--input', input, ...args]);
    const path = fileURLToPath(new URL(`../tests/golden/report-${name}.txt`, import.meta.url));
    await writeFile(path, stdout);
    process.stdout.write(`wrote ${path} (${stdout.split('\n').length} lines)\n`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
