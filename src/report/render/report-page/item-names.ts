import { escapeHtml as e } from '../html-report-components.ts';
import { distinctDepth } from '../path-tail.ts';
import type { Lang, Translate } from '../report-copy.ts';
import type { ToDoItem } from './to-do.ts';

const LOCALES: Readonly<Record<Lang, string>> = { en: 'en-US', pl: 'pl-PL', de: 'de-DE' };

/** The human name of each built-in rule (the parent spec's F33), by the pattern the policy lists. */
const RULE_NAMES: Readonly<Record<string, string>> = {
  '**/.env*': 'rule.env',
  '**/*.env': 'rule.env',
  '**/.npmrc': 'rule.npmrc',
  '**/secrets/**': 'rule.secrets',
  '**/.ssh/**': 'rule.ssh',
  '**/id_rsa*': 'rule.ssh',
};

/** "Stripe and Supabase", "Stripe, Supabase und Google" - a list, as each language joins one. */
export function listOf(names: readonly string[], lang: Lang): string {
  return new Intl.ListFormat(LOCALES[lang], { type: 'conjunction' }).format(names);
}

/**
 * What a file is, in words (F3): the services its keys belong to, or the rule that protects it, or "A private file".
 * Never read from its name: `.env.local` is not "your AI account" until an OpenAI key is found in it.
 */
export function titleOf(item: ToDoItem, t: Translate, lang: Lang): string {
  if (item.template) return t('rp.item.template');
  if (item.kind === 'keys' && item.providers.length > 0) return t('rp.item.keys', { providers: e(listOf(item.providers.map((each) => each.name), lang)) });
  if (item.kind === 'data') return t('rp.item.private');
  return t(ruleKey(item.pattern) ?? 'rp.item.private');
}

/** The word key of a built-in rule's human name (`rule.env`), or `undefined` for a pattern nobody named. */
export function ruleKey(pattern: string | undefined): string | undefined {
  return pattern === undefined ? undefined : RULE_NAMES[pattern];
}

/** The file's own name, which a chip and a sentence show; its whole path is its title. */
export function nameOf(path: string): string {
  return segmentsOf(path).pop() ?? path;
}

/** How a page names a file on a chip or in a sentence: see `fileNames`. */
export type FileNames = (path: string) => string;

/**
 * How a page names each file it shows (`specs/2026-09-14-path-display-and-share.md` R5): its name, and where another
 * file on the page has that name, as much of its path as tells the two apart - `web/.env` and `widget/.env`, never
 * `.env` twice. Where no part of the path does, the path whole. A path the page did not list is named against those it did.
 *
 * The paths are every one the page names, so a file is lengthened for one a sentence names too. Found by a review: the
 * name alone came first, so a path of one segment was never named whole - `.env` and `/.env`, `secrets` and
 * `secrets/`, read alike.
 */
export function fileNames(paths: Iterable<string>): FileNames {
  const byName = new Map<string, string[]>();
  for (const path of new Set(paths)) byName.set(nameOf(path), [...(byName.get(nameOf(path)) ?? []), path]);
  return (path) => {
    const alike = (byName.get(nameOf(path)) ?? []).filter((other) => other !== path);
    if (alike.length === 0) return nameOf(path);
    const parts = segmentsOf(path);
    // Every path alike ends in the same name, so the shortest tail that tells them apart has two parts or more.
    const depth = distinctDepth(parts, alike.map(segmentsOf));
    return depth === parts.length ? path : parts.slice(-depth).join('/');
  };
}

function segmentsOf(path: string): string[] {
  return path.split(/[\\/]/).filter((part) => part !== '');
}
