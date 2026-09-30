import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces .ai/architecture/2026-09-13-conventions.md: "Layers and allowed dependencies" and the code rules a type checker
// cannot see.

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const IMPORT = /^\s*(?:import|export)\s[^'";]*?from\s+'([^']+)'/gm;
const IO_MODULES = new Set(['node:fs', 'node:fs/promises', 'node:readline', 'node:child_process', 'node:net', 'node:http']);
const CONTRACT = /^adapter\/[^/]+\/contract\//;

interface Module {
  /** Path relative to src/, with forward slashes. */
  readonly file: string;
  readonly source: string;
  /** Node specifiers as written; project imports as paths relative to src/. */
  readonly imports: readonly string[];
}

interface DependencyRule {
  readonly name: string;
  readonly appliesTo: (file: string) => boolean;
  readonly forbids: (specifier: string) => boolean;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function fromSrc(path: string): string {
  return relative(SRC, path).split(sep).join('/');
}

const modules: readonly Module[] = sourceFiles(SRC).map((path) => {
  const source = readFileSync(path, 'utf8');
  return {
    file: fromSrc(path),
    source,
    imports: [...source.matchAll(IMPORT)].map((match) => {
      const specifier = match[1] ?? '';
      return specifier.startsWith('.') ? fromSrc(resolve(dirname(path), specifier)) : specifier;
    }),
  };
});

// A project import is resolved to a path ending in `.ts` (relative imports carry the extension); a Node module starts
// with `node:`; anything else is a package from outside the project.
const isProject = (specifier: string): boolean => specifier.endsWith('.ts');
const isPackage = (specifier: string): boolean => !specifier.startsWith('node:') && !isProject(specifier);
const isShell = (specifier: string): boolean => specifier === 'cli.ts' || specifier.startsWith('cli/');
const isInfrastructure = (file: string): boolean => file.startsWith('infrastructure/');

const RULES: readonly DependencyRule[] = [
  {
    name: 'only infrastructure performs I/O',
    appliesTo: (file) => !isInfrastructure(file),
    forbids: (specifier) => IO_MODULES.has(specifier),
  },
  {
    // Every package runs with the same access as this tool, which reads live secrets. Kept at the edge, a package is
    // one module to replace; spread through the code, it is a dependency of everything.
    name: 'only infrastructure imports a package from outside the project',
    appliesTo: (file) => !isInfrastructure(file),
    forbids: isPackage,
  },
  {
    name: 'only the composition root chooses infrastructure implementations',
    appliesTo: (file) => file !== 'composition-root.ts' && !isInfrastructure(file),
    forbids: isInfrastructure,
  },
  {
    name: 'ports depend on nothing else in the project',
    appliesTo: (file) => file.startsWith('ports/'),
    forbids: (specifier) => isProject(specifier) && !specifier.startsWith('ports/'),
  },
  {
    name: 'shared code depends on nothing else in the project',
    appliesTo: (file) => file.startsWith('shared/'),
    forbids: (specifier) => isProject(specifier) && !specifier.startsWith('shared/'),
  },
  {
    name: 'the format contract depends on nothing else in the project',
    appliesTo: (file) => CONTRACT.test(file),
    forbids: (specifier) => isProject(specifier) && !CONTRACT.test(specifier),
  },
  {
    name: 'the core depends only on the core and on shared building blocks',
    appliesTo: (file) => file.startsWith('core/'),
    forbids: (specifier) =>
      isProject(specifier) && !specifier.startsWith('core/') && !specifier.startsWith('shared/'),
  },
  {
    name: 'adapters and infrastructure do not depend on the application, the root or the shell',
    appliesTo: (file) => file.startsWith('adapter/') || isInfrastructure(file),
    forbids: (specifier) => specifier.startsWith('doctor/') || specifier === 'composition-root.ts' || isShell(specifier),
  },
  {
    name: 'the application does not depend on the composition root or the shell',
    appliesTo: (file) => file.startsWith('doctor/'),
    forbids: (specifier) => specifier === 'composition-root.ts' || isShell(specifier),
  },
];

function offending(pattern: RegExp, except: (file: string) => boolean = () => false): string[] {
  return modules.filter((module) => !except(module.file) && pattern.test(module.source)).map((module) => module.file);
}

test('the scan sees the source tree and resolves project imports', () => {
  const root = modules.find((module) => module.file === 'composition-root.ts');
  assert.ok(modules.length >= 30, `only ${modules.length} modules found`);
  assert.ok(root?.imports.includes('infrastructure/node-file-system.ts'), 'composition root imports are resolved');
});

// A range lets a new release of a package - or of anything it depends on - arrive without anyone deciding it should.
test('every runtime dependency is pinned to one exact version', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  const unpinned = Object.entries(manifest.dependencies ?? {}).filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version));
  assert.deepEqual(unpinned, []);
});

for (const rule of RULES) {
  test(rule.name, () => {
    const violations = modules
      .filter((module) => rule.appliesTo(module.file))
      .flatMap((module) => module.imports.filter(rule.forbids).map((specifier) => `${module.file} -> ${specifier}`));
    assert.deepEqual(violations, []);
  });
}

// The core speaks its own language. A provider's wire name here means format knowledge has escaped the adapter,
// which is the failure the layering exists to prevent - and the one that makes a second adapter, or `guard`
// sharing the detector with `report`, impossible. The list is the distinctive names only: `type` or `name` would
// match ordinary English.
const PROVIDER_NAMES = [
  'isSidechain',
  'toolDenialKind',
  'toolUseResult',
  'sourceToolAssistantUUID',
  'toolUseId',
  'spawnDepth',
  'requestShape',
  'requestNonInteractive',
  'agentType',
  'bridgeSessionId',
  'subagent_type',
  'tool_use',
  'tool_result',
];

test('the core knows no provider field names', () => {
  const mentions = modules
    .filter((module) => module.file.startsWith('core/'))
    .flatMap((module) => PROVIDER_NAMES.filter((name) => module.source.includes(name)).map((name) => `${module.file}: ${name}`));

  assert.deepEqual(mentions, []);
});

test('only the shell touches process', () => {
  assert.deepEqual(offending(/\bprocess\./, (file) => file === 'cli.ts'), []);
});

// A vendored file (`air-datepicker-vendor.ts`) is a third party's own source, pasted in whole
// because the report pages' CSP admits no CDN - this project's composition rule was never a claim about it.
test('composition over inheritance: a class extends nothing but Error', () => {
  assert.deepEqual(offending(/\bclass\s+\w+\s+extends\s+(?!Error\b)/, (file) => file.endsWith('-vendor.ts')), []);
});

test('modules use named exports only', () => {
  assert.deepEqual(offending(/\bexport\s+default\b/), []);
});

test('no var declarations', () => {
  assert.deepEqual(offending(/^\s*var\s/m), []);
});

// `.ai/plans/2026-09-23-conversations-redesign.md`, rule 1: every colour of the new design is a token, written once in
// `tokens.ts`. A piece that writes a colour of its own is how two things that mean the same came to look different.
test('the UI kit and the pages built on it name colours only through the tokens', () => {
  const kit = (file: string): boolean =>
    file.startsWith('report/render/ui/') || file.startsWith('report/start/conversations/') || file.startsWith('report/start/settings/') ||
    file.startsWith('report/start/month/') || file.startsWith('report/start/to-fix/') ||
    file.startsWith('report/start/onboarding/');
  const colour = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  assert.deepEqual(
    modules.filter((module) => kit(module.file) && module.file !== 'report/render/ui/tokens.ts' && colour.test(module.source)).map((module) => module.file),
    [],
  );
});

// M4 (`.ai/specs/2026-09-23-the-report-page.md`, Q1): a record's time is shown and never used. With agents running in
// parallel a line can be written before the one above it - 54 of 4020 pairs on three measured sessions - so ordering or
// joining by it would tell a story the record does not (architecture invariant 3). Reading the earliest and the latest
// for a span is not an order; comparing two, subtracting them or sorting by one is. The time lives on the evidence
// (`EvidenceRef.at`); what the report model copies from it is display data by its own documentation.
test('nothing orders or joins by a record time', () => {
  const byTime = /evidence\??\.at\s*[<>-]|[<>]=?\s*[\w.?]*evidence\??\.at\b|sort\([^)]*evidence\??\.at\b/;
  // The rule itself, so a pattern that matched nothing could not pass for one that holds.
  for (const ordering of ['a.evidence.at - b.evidence.at', 'first.evidence.at < second.evidence.at', 'x > y.evidence?.at', 'calls.sort((a, b) => a.evidence.at)']) {
    assert.ok(byTime.test(ordering), ordering);
  }
  for (const reading of ['Math.min(...times)', 'evidence.at === undefined', '{ at: evidence.at }']) assert.ok(!byTime.test(reading), reading);
  assert.deepEqual(offending(byTime), []);
});

// The report page is built on the kit, and holds to the same rule (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
test('the report page names colours only through the tokens', () => {
  const colour = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  assert.deepEqual(modules.filter((module) => module.file.startsWith('report/render/report-page/') && colour.test(module.source)).map((module) => module.file), []);
});
