// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_POLICY } from '../../../core/policy/default-policy.ts';
import { matchesGlob } from '../../../core/policy/glob.ts';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.ts';
import type { RulesRead } from '../../../adapter/claude-code/settings/hook-entries.ts';
import { DEFAULT_THRESHOLD } from '../../watch/agent-alert.ts';
import { DEFAULT_CHANNELS, DEFAULT_CLEAN, type NoticeChannel } from '../../watch/notice-choices.ts';
import { RULE_NAMES, type RuleName } from '../../rule-names.ts';
import type { IndexHooks, IndexSettings, SettingsFile } from '../session-index.ts';

/**
 * What the Settings page shows, decided from what the files hold (`for-people-who-build-with-ai.md` §3 C; the plan's
 * S4). No HTML: every state, name and source of the page is chosen here, and the page only writes it.
 *
 * "Watched" means what the `watch` hook reads, never the list this run of `start` read: a settings file's rules replace
 * the built-in list for a hook that names it, so a pattern is called watched only where that hook's rules hold it.
 */


const BUILT_IN: readonly string[] = DEFAULT_POLICY.protected.map((entry) => entry.pattern);

/** Where a row came from (F33): the built-in list, a rule written the way `init` writes one, or one written by hand. */
export type RuleSource = 'agentwhy' | 'you' | 'project';

export interface RuleRow {
  /** Absent: the row is named by its pattern. */
  readonly name?: RuleName;
  readonly patterns: readonly string[];
  readonly source: RuleSource;
  /** False for a built-in pattern the file the hooks read does not hold: listed, and said not to be watched. */
  readonly watched: boolean;
  /** What **Remove** takes out, and of which file; absent where a row cannot be removed. */
  readonly remove?: { readonly rule: string; readonly file: SettingsFile };
  /**
   * SW19: a tracked file a written Block rule still matches - the shortest such pattern. Claude Code applies its deny
   * rules itself and knows no exceptions, so the file stays unreadable there whatever the told list says; the row
   * says so, as a half-blocked row says what is missing.
   */
  readonly covered?: string;
  /** F57: kept from the agent, or read and told. A row not watched at all is `block`, which is what watching it does. */
  readonly mode: 'block' | 'tell';
  /** What the switch to the other mode writes; absent where this page cannot make that change. */
  readonly switchTo?: ModeSwitch;
  /** What **Remove** takes out of a told list, for a row no rule holds (F57). */
  readonly untell?: readonly string[];
  /**
   * A `block` row that is not blocked whole (`block-means-blocked` K1, K2): `open` where the rules stop Claude Code's
   * file tools and `refuse` does not keep it from shell commands, `none` where no settings file holds its rules at all.
   * Absent where both halves hold, and where what `refuse` reads cannot be seen into: nothing is claimed then.
   */
  readonly kept?: 'open' | 'none';
}

/** What **Finish blocking** closes (K8, K9): the rows not blocked whole, and what one confirmed write adds. */
export interface Unfinished {
  readonly rows: number;
  /** The patterns to write with `refuse` (`adopt`), where a row has no rules; empty where every rule is there. */
  readonly patterns: readonly string[];
  /** Where every rule is there, whether installing `refuse` closes the rest. */
  readonly refuse: boolean;
}

/** One switch of F57, as the server takes it: the patterns, and the rules as the files write them. */
export interface ModeSwitch {
  readonly to: 'block' | 'tell';
  readonly patterns: readonly string[];
  /** Where going to `tell`: the deny rules to take out, exactly as a file holds them. */
  readonly rules: readonly string[];
}

/** A project rule the hooks do not read (F34), as the file writes it, so it is copied exactly. */
export interface UnreadRule {
  readonly rule: string;
  readonly file: SettingsFile;
}

export interface Hook {
  readonly on: boolean;
  /** The file it runs from, where it runs. */
  readonly who?: SettingsFile;
}

/** One line of the developer details (F41): its label's word key, and a value that is either text or a word key. */
/** What General moves to make everything agentwhy wrote one file's (F56): the rules, then the hooks. */
export interface ScopeMove {
  /** Whole rules the other file holds, as they are written there. */
  readonly patterns: readonly string[];
  /** Hooks that run from the other file. */
  readonly hooks: readonly ('watch' | 'refuse')[];
}

export interface DeveloperRow {
  readonly key: string;
  readonly value: string | { readonly word: string };
}

export interface SettingsView {
  /**
   * Which hooks run is known: the project's own file could be read. Where it could not, nothing says a hook is off -
   * a page must never say protection is off while it runs (`IndexHooks`) - and nothing is offered (R62).
   */
  readonly known: boolean;
  /** The project's own file could be read, so a switch or an add can be offered (R62). */
  readonly canWrite: boolean;
  /** Card 1 - `watch` (F29, F30). */
  readonly alerts: Hook;
  /** Card 2 - a refused attempt is said; locked while card 1 is off. */
  readonly stopped: { readonly on: boolean; readonly locked: boolean };
  /** Card 3 - the clean line; locked while card 1 is off. */
  readonly fine: { readonly on: boolean; readonly locked: boolean };
  /** The preferences file can be written (R26a); false where there is none to write, or it cannot be read (R24). */
  readonly noticesWritable: boolean;
  /**
   * General's system notifications (`2026-10-02-said-where-the-person-is.md` SW13): whether a notice is also shown in the
   * corner of the screen (`os`), and the channels in force, so the switch changes that one and keeps the rest.
   */
  readonly system: { readonly on: boolean; readonly channels: readonly NoticeChannel[] };
  /** The card of F38 under Private files - `refuse`, which keeps the files from the agent's searches too (F39). */
  readonly stop: Hook;
  /**
   * General (F56): who what agentwhy wrote into the project is for - the file every rule and hook of its own is in,
   * `mixed` where they are in both, and undefined where nothing is written yet or the files could not be read.
   */
  readonly scope: SettingsFile | 'mixed' | undefined;
  /** What makes everything one file's, by the file it is to be in. Empty where it already is. */
  readonly moves: Readonly<Record<SettingsFile, ScopeMove>>;
  /**
   * F59: the files that hold anything of agentwhy's - a hook it runs or a whole rule it wrote - each with those rules,
   * which **Uninstall** takes out with both hooks. Empty where nothing is there, or the files could not be read.
   */
  readonly uninstall: Readonly<Partial<Record<SettingsFile, readonly string[]>>>;
  /** Where a change that asks nobody is written: the one file, where there is one; else where an add goes. */
  readonly writeTo: SettingsFile;
  /** F57: both told lists could be read, so a row's switch can be offered. */
  readonly canTell: boolean;
  /** What `watch` reads (S4). */
  readonly reads: RulesRead;
  readonly rows: readonly RuleRow[];
  /** F34: the project's rules the hooks do not read. */
  readonly unread: readonly UnreadRule[];
  /** K8: the blocked rows that are not blocked whole, and what Finish blocking writes. */
  readonly unfinished: Unfinished;
  /** How many patterns **Watch it too** writes: the unread rules and the built-in patterns the hooks do not read. */
  readonly toWatch: number;
  /** The file an add is written to: the one the hooks read, else the one `watch` runs from, else the local one. */
  readonly addTo: SettingsFile;
  /**
   * The built-in patterns written with an add or **Watch it too**, so that pointing the hooks at a file never drops
   * what they watched before (S4.3): all of them where the hooks read the built-in list, the missing ones where they
   * read a file without them.
   */
  readonly withBuiltIn: readonly string[];
  /** An add can be offered: the hooks read the built-in list or one of the project's files, not a policy. */
  readonly canAdd: boolean;
  readonly developer: readonly DeveloperRow[];
  /** `codex-approves-its-own-hook` AO3: whether agentwhy's check runs in Codex without asking; absent with no sign of Codex. */
  readonly codex?: 'on' | 'stale' | 'off';
}

const NO_HOOKS: IndexHooks = {
  watch: false,
  refuse: false,
  reads: { watch: 'default', refuse: 'default' },
  path: SETTINGS_FILES.directory + '/' + SETTINGS_FILES.local,
  sharedPath: SETTINGS_FILES.directory + '/' + SETTINGS_FILES.shared,
};

export function settingsView(settings: IndexSettings): SettingsView {
  const hooks = settings.hooks ?? NO_HOOKS;
  const canWrite = settings.hooks !== undefined && settings.mine !== undefined;
  const alerts = hookOf(hooks.watch);
  const stop = hookOf(hooks.refuse);
  const reads = hooks.reads.watch;

  const notices = settings.notices;
  const on = notices?.on ?? DEFAULT_THRESHOLD;
  const clean = notices?.clean ?? DEFAULT_CLEAN;

  const known = settings.hooks !== undefined;
  // Unknown, the hooks' rules are unknown too: the list is what this run read, and no row claims to be watched or not.
  const read = known ? readPatterns(settings, reads) : undefined;
  const told = toldIn(settings);
  const canTell = canWrite && settings.told !== undefined && settings.told.local !== 'unreadable' && settings.told.shared !== 'unreadable';
  const rows = read === undefined
    ? policyRows(settings)
    : fileRows(settings, reads, read, told, canTell).map((row) => coveredOf(keptOf(row, settings, hooks), settings, told));
  const unread = read === undefined ? [] : unreadRules(settings, read);
  const addTo: SettingsFile = reads === 'local' || reads === 'shared' ? reads : alerts.who ?? stop.who ?? 'local';

  // A built-in pattern on a told list is read and told, never blocked again by an add (F57).
  const withBuiltIn = read === undefined ? [] : BUILT_IN.filter((pattern) => (reads === 'default' || !read.has(pattern)) && !told.has(pattern));
  const scope = known ? scopeOf(settings, hooks) : undefined;
  return {
    known,
    canWrite,
    alerts,
    stopped: { on: on === 'refused', locked: known && !alerts.on },
    fine: { on: clean !== 'off', locked: known && !alerts.on },
    noticesWritable: notices !== undefined && !notices.unusable,
    system: { on: (notices?.notify ?? DEFAULT_CHANNELS).includes('os'), channels: notices?.notify ?? DEFAULT_CHANNELS },
    stop,
    scope,
    moves: { local: movesInto(settings, hooks, 'local'), shared: movesInto(settings, hooks, 'shared') },
    uninstall: known ? uninstallFrom(settings, hooks) : {},
    writeTo: scope === 'local' || scope === 'shared' ? scope : addTo,
    canTell,
    reads,
    rows,
    unread,
    unfinished: unfinishedOf(settings, rows, withBuiltIn, told, stop.on),
    toWatch: new Set([...unread.map((rule) => rule.rule), ...(reads === 'default' ? [] : withBuiltIn)]).size,
    addTo,
    // Read from the built-in list, the whole of it goes into the file the hooks will read from then on; read from a
    // file, only what that file lacks.
    withBuiltIn,
    canAdd: canWrite && read !== undefined,
    developer: developerRows(settings, known ? hooks : undefined, reads, unread),
    ...(hooks.codex === undefined ? {} : { codex: hooks.codex }),
  };
}

const FILES: readonly SettingsFile[] = ['local', 'shared'];

/**
 * The rules of agentwhy's own a file holds: whole rules, the kind `init` writes and can take back out (`IndexRule`). A
 * rule written by hand is somebody's own work and stays where they put it, so it neither splits the scope nor moves.
 */
function ownRules(settings: IndexSettings, file: SettingsFile): string[] {
  return (settings.held?.[file] ?? []).flatMap((pattern) => {
    const rule = settings.mine?.[pattern];
    return rule !== undefined && rule.whole ? [rule.rule] : [];
  });
}

function scopeOf(settings: IndexSettings, hooks: IndexHooks): SettingsFile | 'mixed' | undefined {
  const used = FILES.filter((file) => hooks.watch === file || hooks.refuse === file || ownRules(settings, file).length > 0);
  return used.length === 2 ? 'mixed' : used[0];
}

function movesInto(settings: IndexSettings, hooks: IndexHooks, into: SettingsFile): ScopeMove {
  const other: SettingsFile = into === 'local' ? 'shared' : 'local';
  return {
    patterns: [...new Set(ownRules(settings, other))],
    hooks: (['watch', 'refuse'] as const).filter((hook) => hooks[hook] === other),
  };
}

function uninstallFrom(settings: IndexSettings, hooks: IndexHooks): Partial<Record<SettingsFile, readonly string[]>> {
  return Object.fromEntries(FILES.flatMap((file) => {
    const rules = [...new Set(ownRules(settings, file))];
    return hooks.watch === file || hooks.refuse === file || rules.length > 0 ? [[file, rules]] : [];
  }));
}

function hookOf(where: SettingsFile | false): Hook {
  return where === false ? { on: false } : { on: true, who: where };
}

/** The patterns the hooks watch, or undefined where they read a policy or a file this page cannot see into. */
function readPatterns(settings: IndexSettings, reads: RulesRead): ReadonlySet<string> | undefined {
  if (reads === 'default') return new Set(BUILT_IN);
  if (reads === 'local' || reads === 'shared') return new Set(settings.held?.[reads] ?? []);
  return undefined;
}

/** Every pattern of both told lists that could be read (F57). */
function toldIn(settings: IndexSettings): ReadonlySet<string> {
  return new Set(FILES.flatMap((file) => {
    const list = settings.told?.[file];
    return list === undefined || list === 'unreadable' ? [] : list;
  }));
}

/**
 * The rows where the hooks read the built-in list or a project file: the named groups first, in F33's order, each
 * watched where the file holds any of its patterns or a told list does, then every other rule the file holds, as its
 * pattern, then every told pattern no rule holds (F57). A row's switch goes to the other mode where this page can write
 * both halves of it: the rules out of the files and the pattern into a list, or the other way round.
 */
function fileRows(settings: IndexSettings, reads: RulesRead, read: ReadonlySet<string>, told: ReadonlySet<string>, canTell: boolean): RuleRow[] {
  const ruleOf = (pattern: string): string | undefined => {
    const rule = settings.mine?.[pattern];
    return rule !== undefined && rule.whole ? rule.rule : undefined;
  };
  // Going to `tell` takes the rules out; where one is a rule somebody wrote by hand, the page cannot, and offers nothing.
  const toTell = (patterns: readonly string[]): ModeSwitch | undefined => {
    if (!canTell) return undefined;
    const rules = reads === 'default' ? [] : patterns.map(ruleOf);
    return rules.every((rule) => rule !== undefined) ? { to: 'tell', patterns, rules: rules as string[] } : undefined;
  };
  const toBlock = (patterns: readonly string[]): ModeSwitch | undefined => (canTell ? { to: 'block', patterns, rules: [] } : undefined);

  const named = RULE_NAMES.map((group): RuleRow => {
    const blocked = group.patterns.filter((pattern) => read.has(pattern) && !told.has(pattern));
    const toldHere = group.patterns.filter((pattern) => told.has(pattern));
    if (blocked.length > 0) return withSwitch({ name: group.name, patterns: blocked, source: 'agentwhy', watched: true, mode: 'block' }, toTell(blocked));
    if (toldHere.length > 0) return withSwitch({ name: group.name, patterns: toldHere, source: 'agentwhy', watched: true, mode: 'tell' }, toBlock(toldHere));
    return { name: group.name, patterns: group.patterns, source: 'agentwhy', watched: false, mode: 'block' };
  });
  const own = [...read].filter((pattern) => !BUILT_IN.includes(pattern) && !told.has(pattern)).map((pattern): RuleRow => {
    const rule = settings.mine?.[pattern];
    // Only a whole rule in the file the hooks read is one `init` could have written and can take back out; half a
    // pair is somebody's own work (`IndexRule.whole`), and a pattern `mine` places in the other file cannot be
    // removed from this one by name.
    const removable = rule !== undefined && rule.whole && rule.file === reads;
    return withSwitch({
      patterns: [pattern],
      source: removable ? 'you' : 'project',
      watched: true,
      mode: 'block',
      ...(removable ? { remove: { rule: rule.rule, file: rule.file } } : {}),
    }, toTell([pattern]));
  });
  const toldOnly = [...told].filter((pattern) => !BUILT_IN.includes(pattern)).map((pattern): RuleRow =>
    withSwitch({ patterns: [pattern], source: 'you', watched: true, mode: 'tell', ...(canTell ? { untell: [pattern] } : {}) }, toBlock([pattern])));
  return [...named, ...own, ...toldOnly];
}

function withSwitch(row: RuleRow, switchTo: ModeSwitch | undefined): RuleRow {
  return switchTo === undefined ? row : { ...row, switchTo };
}

/**
 * Where the hooks read a policy or another file, or what they read is unknown: the list this run read, as it is, and
 * nothing here can change it. The built-in list is named in words where it is what the run read.
 */
function policyRows(settings: IndexSettings): RuleRow[] {
  const builtIn = settings.origin.kind === 'default';
  const named = builtIn
    ? RULE_NAMES.flatMap((group) => {
      const held = group.patterns.filter((pattern) => settings.protected.includes(pattern));
      return held.length === 0 ? [] : [{ name: group.name, patterns: held, source: 'agentwhy' as const, watched: true, mode: 'block' as const }];
    })
    : [];
  const rest = settings.protected.filter((pattern) => !builtIn || !BUILT_IN.includes(pattern));
  return [...named, ...rest.map((pattern) => ({ patterns: [pattern], source: 'project' as const, watched: true, mode: 'block' as const }))];
}

/**
 * K1, K2: a watched `block` row, read for both halves of a block - its rules in either settings file, which Claude Code
 * applies both of (R4d), and `refuse` running over rules that hold every pattern of it. Where `refuse` reads a policy or
 * a file this page cannot see into, only the rules are claimed.
 */
function keptOf(row: RuleRow, settings: IndexSettings, hooks: IndexHooks): RuleRow {
  if (!row.watched || row.mode !== 'block' || settings.held === undefined) return row;
  const ruled = row.patterns.filter((pattern) => denied(settings, pattern));
  if (ruled.length === 0) return { ...row, kept: 'none' };
  const searched = hooks.refuse === false ? new Set<string>() : readPatterns(settings, hooks.reads.refuse);
  const whole = ruled.length === row.patterns.length && (searched === undefined || row.patterns.every((pattern) => searched.has(pattern)));
  return whole ? row : { ...row, kept: 'open' };
}

/**
 * SW19, found by the maintainer on 2026-10-02: `demo.env` was switched to Track, and Claude Code still refused every
 * read - its own deny rule for every `.env` file covers that name, and deny rules know no exceptions. The row carries
 * the shortest written Block rule that still matches the row's file, by the name a command or a path would use. Only
 * a row tracked by a file's name is asked - a folder or a hand-written pattern names no one file to try - and only
 * rules a settings file actually holds count, because only those are rules Claude Code applies itself.
 */
function coveredOf(row: RuleRow, settings: IndexSettings, told: ReadonlySet<string>): RuleRow {
  if (row.mode !== 'tell' || !row.watched) return row;
  const names = row.patterns.flatMap((pattern) => {
    const name = /^\*\*\/([^*?/]+)$/.exec(pattern)?.[1];
    return name === undefined ? [] : [name];
  });
  if (names.length === 0) return row;
  const written = FILES.flatMap((file) => settings.held?.[file] ?? []).filter((pattern) => !told.has(pattern));
  const covering = written.filter((pattern) => names.some((name) => matchesGlob(name, pattern) || matchesGlob(`a/${name}`, pattern)));
  const covered = covering.sort((one, two) => one.length - two.length || (one < two ? -1 : 1))[0];
  return covered === undefined ? row : { ...row, covered };
}

function denied(settings: IndexSettings, pattern: string): boolean {
  return FILES.some((file) => settings.held?.[file]?.includes(pattern) ?? false);
}

/**
 * K9: what one confirmed write closes. Rules no file holds are written as an add writes them - with the built-in list,
 * so that pointing the hooks at a file drops nothing they watched (S4.3), and never a pattern the person chose to be
 * told about (F57) - and `refuse` with them. Where every rule is there, `refuse` alone, where it does not run. Where it
 * runs and reads other rules, `init` does not point it again without writing a rule (R4d), so nothing is offered.
 */
function unfinishedOf(settings: IndexSettings, rows: readonly RuleRow[], withBuiltIn: readonly string[], told: ReadonlySet<string>, refuseOn: boolean): Unfinished {
  const open = rows.filter((row) => row.kept !== undefined);
  const missing = open.flatMap((row) => row.patterns.filter((pattern) => !denied(settings, pattern)));
  const patterns = missing.length === 0 ? [] : [...new Set([...withBuiltIn, ...missing])].filter((pattern) => !told.has(pattern));
  return { rows: open.length, patterns, refuse: open.length > 0 && patterns.length === 0 && !refuseOn };
}

/** F34: a rule a project file holds that the hooks do not read. A built-in pattern read anyway is not one. */
function unreadRules(settings: IndexSettings, read: ReadonlySet<string>): UnreadRule[] {
  return Object.entries(settings.mine ?? {})
    .filter(([pattern]) => !read.has(pattern))
    .map(([, rule]) => ({ rule: rule.rule, file: rule.file }));
}

/** `hooks` is absent where the project's file could not be read: then what runs, and what it reads, is not known. */
function developerRows(settings: IndexSettings, known: IndexHooks | undefined, reads: RulesRead, unread: readonly UnreadRule[]): DeveloperRow[] {
  const hooks = known ?? NO_HOOKS;
  const pathOf = (file: SettingsFile): string => (file === 'shared' ? hooks.sharedPath : hooks.path);
  const where = (hook: 'watch' | 'refuse'): DeveloperRow['value'] => {
    if (known === undefined) return { word: 'set.dev.unknown' };
    const file = hooks[hook];
    return file === false ? { word: 'set.dev.notInstalled' } : pathOf(file);
  };
  const notices = settings.notices;
  const rules = reads === 'local' || reads === 'shared'
    ? [...(settings.held?.[reads] ?? [])].join('  ') + '  (' + pathOf(reads) + ')'
    : reads === 'default' ? BUILT_IN.join('  ') : settings.protected.join('  ');
  const unreadFiles = [...new Set(unread.map((rule) => pathOf(rule.file)))];

  return [
    { key: 'set.dev.watch', value: where('watch') },
    { key: 'set.dev.refuse', value: where('refuse') },
    { key: 'set.dev.reads', value: known === undefined ? { word: 'set.dev.unknown' } : reads === 'local' || reads === 'shared' ? pathOf(reads) : { word: 'set.dev.reads.' + reads } },
    { key: 'set.dev.rules', value: known === undefined ? settings.protected.join('  ') : rules },
    { key: 'set.dev.unread', value: unreadFiles.length === 0 ? { word: 'set.dev.none' } : unreadFiles.join('  ') },
    { key: 'set.dev.exceptions', value: settings.allowed.length === 0 ? { word: 'set.dev.none' } : settings.allowed.join('  ') },
    { key: 'set.dev.notices', value: notices === undefined ? { word: 'set.dev.none' } : notices.path },
    { key: 'set.dev.on', value: notices?.on ?? DEFAULT_THRESHOLD },
    { key: 'set.dev.clean', value: notices?.clean ?? DEFAULT_CLEAN },
    ...(notices === undefined ? [] : [{ key: 'set.dev.said', value: notices.say + ' · ' + notices.notify.join(', ') }]),
  ];
}
