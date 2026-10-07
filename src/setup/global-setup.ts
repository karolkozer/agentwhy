// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { computerForm, fileRulePathOf, toPattern } from '../adapter/claude-code/policy/deny-rules.ts';
import { denyEntriesFor, denyEntriesIn, fileRulesIn, isDenied, withDenyEntries, withoutDenyEntries } from '../adapter/claude-code/settings/deny-entries.ts';
import { STOP, SUBAGENT_STOP } from '../adapter/claude-code/contract/hooks.ts';
import { everywhereWatchEntries, everywhereWatchEvents, withHookEntries, withoutEverywhereWatch } from '../adapter/claude-code/settings/hook-entries.ts';
import type { AgentwhyInvocation } from '../ports/agentwhy-invocation.ts';
import type { Chooser } from '../ports/chooser.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileWriter } from '../ports/file-writer.ts';
import { parseJsonObject, type JsonObject } from '../shared/json.ts';
import { printable } from '../shared/printable.ts';
import { patternsOf } from './protected-patterns.ts';
import type { SetupResult } from './project-setup.ts';

export interface GlobalSetupOptions {
  /** Paths to protect on this computer. Written anchored, whatever form they are typed in (GD3). */
  readonly protect: readonly string[];
  /** With `remove`: the paths to take out. A rule is never removed unless it is named (R27's rule, for this file). */
  readonly unprotect?: readonly string[];
  readonly remove: boolean;
  /** Consent given on the command line, for where nobody can be asked (R7). */
  readonly yes: boolean;
}

/** What `agentwhy protect` drives: write or take out computer-wide rules, and say which hold. */
export interface GlobalProtection {
  run(options: GlobalSetupOptions): Promise<SetupResult>;
  list(): Promise<SetupResult>;
}

export interface GlobalSetupDependencies {
  readonly files: FileReader & FileWriter;
  readonly chooser: Chooser;
  /** Both streams are terminals, so a person can be asked. */
  readonly interactive: boolean;
  /** The person's home directory: this setup writes one file in it and nothing else. */
  readonly home: string;
  /** How this agentwhy runs, for the one hook this file is given (GD23). Absent: that hook is not written. */
  readonly invocation?: Pick<AgentwhyInvocation, 'find'>;
}

/** What a global rule means, said wherever one is written (GD9). The cost is paid in words, not in enforcement. */
const WHAT_A_GLOBAL_RULE_IS = [
  'A rule here applies in every project on this computer, and no project can lift it.',
  'It keeps the file from being read as well as written: agentwhy reads Read(), Edit() and Write() rules alike as paths.',
];

/**
 * Why a Windows path, or one named by a variable, is not written: neither is measured in Claude Code or in agentwhy's check
 * (`2026-10-07-a-file-in-its-place.md` IPB13). A POSIX path is written as the place it is (IP1).
 */
const ABSOLUTE_REFUSED =
  'a Windows path, or one named by a variable, is not written here: neither form is measured to hold yet. Name the place with ~/ - "~/.ssh/id_rsa" - or as a path from /';

/**
 * A path written in a form not measured (IPB13), in every form a person may type one: a Windows drive (`C:\…`, `C:/…`), a network share
 * (`\\server\…`), and the home directory named by a variable (`$HOME/…`, `%USERPROFILE%\…` in any case, PowerShell's
 * `$env:…`) or by `~\…`, which `toPattern` does not strip as it strips `~/`. Only the first was refused
 * until a review on 2026-10-06; anchored, the others became `**\/C:/…` or `**\/$HOME/…` and were said to be protected.
 */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\|\$\{?HOME\}?(?:[\\/]|$)|\$env:|~\\|%(?:USERPROFILE|HOMEPATH|HOMEDRIVE)%)/i;

/** Whether a pattern names an absolute path, in any of `ABSOLUTE`'s forms: never written computer-wide (GD3). */
export function isAbsolutePattern(pattern: string): boolean {
  return ABSOLUTE.test(pattern);
}

/**
 * `2026-10-05-protected-everywhere.md` G1-G3: the person's own, computer-wide Claude Code settings
 * (`~/.claude/settings.json`), written with its own plan and its own consent - never through `ProjectSetup`, which
 * writes one project's files and refuses this directory outright (`which-project.md` V8).
 *
 * It writes deny rules, and one hook: GB10 measured that Claude Code reads this file by itself, and `refuse` reads it
 * through G4 wherever it already runs, so a rule needs nothing installed. The hook is GD23's - `watch` in every project,
 * which the computer's Alerts turn on - written with its own consent, as a rule is. This setup adds exactly what it is
 * asked for and removes exactly what is named.
 */
export class GlobalSetup implements GlobalProtection {
  readonly #dependencies: GlobalSetupDependencies;

  constructor(dependencies: GlobalSetupDependencies) {
    this.#dependencies = dependencies;
  }

  /**
   * Whether the file holds a rule that names a file - what Codex's check has to follow (G17). A file that cannot be
   * read holds nothing anybody can follow, so it answers no and Codex's check is not installed on its account.
   */
  async holds(): Promise<boolean> {
    const read = await this.#read(join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
    return read.kind === 'object' && fileRulesIn(read.settings).length > 0;
  }

  /**
   * GD23: whether the computer's `watch` runs in every project - on both its events, as a project's counts as on only
   * where both run. `unreadable` where the file cannot be read: a switch is never drawn from a guess.
   */
  async alertsOn(): Promise<boolean | 'unreadable'> {
    const read = await this.#read(join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
    if (read.kind === 'absent') return false;
    if (read.kind !== 'object') return 'unreadable';
    const events = everywhereWatchEvents(read.settings, await this.#dependencies.invocation?.find());
    return events.has(SUBAGENT_STOP.event) && events.has(STOP.event);
  }

  /**
   * GD23: the computer's `watch`, on or off. On adds the events it does not run on yet; off takes out the computer's
   * `watch` alone - a project's own, or any other hook in the file, stays.
   */
  async alerts(on: boolean, options: Pick<GlobalSetupOptions, 'yes'>): Promise<SetupResult> {
    const path = join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared);
    const where = `~/${SETTINGS_FILES.directory}/${SETTINGS_FILES.shared}`;
    const read = await this.#read(path);
    if (read.kind === 'broken' || read.kind === 'unreadable') {
      return {
        outcome: 'refused',
        output: `${where} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so nothing was written. Every other setting in that file is Claude Code's own; fix it and run this again.\n`,
      };
    }
    const settings = read.kind === 'object' ? read.settings : {};
    const before = read.kind === 'object' ? read.text : undefined;
    const invoke = await this.#dependencies.invocation?.find();

    if (!on) {
      const { settings: next, removed } = withoutEverywhereWatch(settings, invoke);
      if (removed === 0) return { outcome: 'unchanged', output: `${where} runs no alerts for every project. Nothing to take out.\n` };
      const plan = [
        `agentwhy will take this out of ${where}:`,
        '',
        '  Alerts in every project (agentwhy watch, when an agent and a conversation finish)',
        '',
        `  A project that runs its own alerts keeps them. Every other setting in ${where} stays.`,
      ];
      const consent = await this.#consent(options, 'Remove it?', plan);
      if (typeof consent !== 'string') return consent;
      const written = await this.#write(path, next, before);
      if (written !== undefined) return { outcome: 'unwritable', output: `${where} ${written}\n` };
      return { outcome: 'written', output: 'Alerts are off in every project but those that run their own.\n' };
    }

    if (invoke === undefined) return { outcome: 'refused', output: 'This run cannot say how agentwhy is run, so no alert was written.\n' };
    const running = everywhereWatchEvents(settings, invoke);
    const missing = everywhereWatchEntries(invoke).filter((entry) => !running.has(entry.event));
    if (missing.length === 0) return { outcome: 'unchanged', output: `${where} already runs alerts in every project.\n` };
    const plan = [
      `agentwhy will add this to ${where}, your own Claude Code settings:`,
      '',
      '  Alerts in every project on this computer',
      `    ${missing[0]?.command ?? ''}, when an agent and when a conversation finish`,
      '',
      '  Good to know',
      '    - it runs in every project, one nobody set up too',
      '    - a project that runs its own alerts is not alerted twice: there this one says nothing',
      `    - every other setting in ${where} stays as it is, and the file is rewritten as two-space JSON`,
    ];
    const consent = await this.#consent(options, 'Write it?', plan);
    if (typeof consent !== 'string') return consent;
    const written = await this.#write(path, withHookEntries(settings, missing), before);
    if (written !== undefined) return { outcome: 'unwritable', output: `${where} ${written}\n` };
    return { outcome: 'written', output: 'Done. Alerts run in every project on this computer, from the next turn.\n' };
  }

  async run(options: GlobalSetupOptions): Promise<SetupResult> {
    const path = join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared);
    const where = `~/${SETTINGS_FILES.directory}/${SETTINGS_FILES.shared}`;

    const read = await this.#read(path);
    if (read.kind === 'broken' || read.kind === 'unreadable') {
      return {
        outcome: 'refused',
        output: `${where} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so nothing was written. Every other setting in that file is Claude Code's own; fix it and run this again.\n`,
      };
    }
    const settings = read.kind === 'object' ? read.settings : {};

    const before = read.kind === 'object' ? read.text : undefined;
    return options.remove ? this.#remove(settings, path, where, options, before) : this.#install(settings, path, where, options, before);
  }

  /**
   * What this file protects today, in the words it was written in. Read-only: a person asking what holds on their
   * computer is not asked to consent to anything, and a file that cannot be read says so rather than reading as empty.
   */
  async list(): Promise<SetupResult> {
    const path = join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared);
    const where = `~/${SETTINGS_FILES.directory}/${SETTINGS_FILES.shared}`;
    const read = await this.#read(path);
    if (read.kind !== 'object') {
      if (read.kind === 'absent') return { outcome: 'unchanged', output: `${where} is not there, so nothing is protected on this computer yet.\n` };
      return { outcome: 'refused', output: `${where} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so what it protects could not be read either.\n` };
    }

    const rules = fileRulesIn(read.settings);
    const paths = [...new Set(rules.map(pathOfRule))];
    const others = denyEntriesIn(read.settings).length - rules.length;
    if (paths.length === 0) {
      return { outcome: 'unchanged', output: `${where} protects no path, so nothing is protected on this computer yet.\n` };
    }
    return {
      outcome: 'unchanged',
      output: [
        `Protected on this computer, in every project (${where}):`,
        ...paths.map((rule) => `  ${printable(rule)}`),
        '',
        ...WHAT_A_GLOBAL_RULE_IS.map((line) => `  ${line}`),
        // A7: a rule naming a command is not a path, and is counted rather than read as one.
        ...(others === 0 ? [] : [`  ${count(others, 'other deny rule')} in that file names no file, so agentwhy does not read it as a path.`]),
        '',
      ].join('\n'),
    };
  }

  async #install(settings: JsonObject, path: string, where: string, options: GlobalSetupOptions, before: string | undefined): Promise<SetupResult> {
    const asked = patternsOf(options.protect);
    const refusedForm = asked.patterns.filter((pattern) => ABSOLUTE.test(pattern));
    // Whatever cannot be written is said: silence would read as "it is protected now".
    const refused = [
      ...asked.refused.map(({ pattern, reason }) => `Not written: "${printable(pattern)}" - ${reason}.\n`),
      ...refusedForm.map((pattern) => `Not written: "${printable(pattern)}" - ${ABSOLUTE_REFUSED}.\n`),
    ].join('');

    const wanted = asked.patterns.filter((pattern) => !ABSOLUTE.test(pattern)).map(anchored);
    if (wanted.length === 0) {
      return { outcome: refused === '' ? 'declined' : 'refused', output: `${refused}${refused === '' ? 'No path was named, so nothing was written. Name one: agentwhy protect ".ssh/id_rsa"\n' : ''}` };
    }

    const adding = [...new Set(wanted.filter((pattern) => !isDenied(settings, pattern)))];
    if (adding.length === 0) {
      return { outcome: 'unchanged', output: `${refused}${where} already protects every path named. Nothing to add.\n` };
    }
    const entries = adding.flatMap(denyEntriesFor);
    const next = withDenyEntries(settings, entries);

    const plan = [
      `agentwhy will add this to ${where}, your own Claude Code settings:`,
      '',
      '  Protect, in every project on this computer',
      ...adding.map((pattern) => `    ${printable(pattern)}`),
      '',
      '  Good to know',
      ...WHAT_A_GLOBAL_RULE_IS.map((line) => `    - ${line}`),
      '    - a deny rule names a tool, not a file: a shell command walks past it unless refuse runs in that project',
      `    - every other setting in ${where} stays as it is, and the file is rewritten as two-space JSON`,
    ];
    const json = jsonPreview(entries).map((line) => `    ${line}`);

    const consent = await this.#consent(options, 'Write it?', plan, json);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${[...plan, '', '  The exact JSON:', ...json].join('\n')}\n\n`;

    const written = await this.#write(path, next, before);
    if (written !== undefined) return { outcome: 'unwritable', output: `${refused}${said}${where} ${written}\n` };

    return {
      outcome: 'written',
      output: [
        `${refused}${said}Done. ${pathCount(adding.length)} protected on this computer, in every project.`,
        '',
        'What happens now',
        "  - Claude Code's own Read and Edit tools refuse these paths, in any project, from the next session",
        '  - where agentwhy refuse runs, a shell command that names one, or searches through one, is refused too',
        '  - no project can lift these rules, and nothing else about your projects changes',
        '',
        'Next',
        `  - see what this file protects          agentwhy protect --list`,
        '  - take one out                        agentwhy protect --remove --unprotect <path>',
        '',
      ].join('\n'),
    };
  }

  /**
   * R27, for this file: only a path named is taken out, so a run can never empty the list by accident. A path is
   * matched as written here (anchored) and as the person typed it, so a rule written by hand in its own form -
   * `Read(~/.ssh/id_rsa)`, which `--list` shows that way - can be named and taken out too (found by review, 2026-10-06).
   */
  async #remove(settings: JsonObject, path: string, where: string, options: GlobalSetupOptions, before: string | undefined): Promise<SetupResult> {
    const held = fileRulesIn(settings);
    if (held.length === 0) return { outcome: 'unchanged', output: `${where} protects no path of agentwhy's, so there was nothing to take out.\n` };

    // IP1: a path named is taken out in every form it may have been written in - as its place, as typed, and anchored as
    // GD3 wrote it before - so a rule written by an older release is never left behind by a newer one.
    const named = new Set(patternsOf(options.unprotect ?? []).patterns.flatMap((pattern) => [anchored(pattern), pattern, toPattern(pattern)]));
    const taking = [...named].flatMap(denyEntriesFor).filter((entry) => held.includes(entry));
    // GD9: `refuse` reads a Write() or NotebookEdit() rule as a block too, and this takes out only the Read() and Edit()
    // pair it writes - so a path still blocked by another tool's rule is said, never called unprotected.
    // Compared anchored, as `refuse` reads them: a Write(~/.aws/**) written by hand blocks **/.aws/** as surely as one
    // written anchored, and was missed by a comparison of the forms as written (the review of 2026-10-06).
    const anchoredNamed = new Set([...named].flatMap((one) => [anchored(one), toPattern(one)]));
    const others = (from: JsonObject): string[] => fileRulesIn(from).filter((entry) => {
      const path = fileRulePathOf(entry) ?? '';
      return (anchoredNamed.has(anchored(path)) || anchoredNamed.has(toPattern(path))) && !taking.includes(entry);
    });
    if (taking.length === 0) {
      const stays = others(settings);
      return {
        outcome: 'refused',
        output: [
          `Nothing was taken out: no path named is protected in ${where}. It protects:`,
          ...[...new Set(held.map(pathOfRule))].map((rule) => `  ${printable(rule)}`),
          '',
          ...(stays.length === 0 ? [] : [`${stays.map(printable).join(', ')} ${stays.length === 1 ? 'is a rule' : 'are rules'} for another tool, which agentwhy writes none of and does not take out: remove ${stays.length === 1 ? 'it' : 'them'} by hand.`, '']),
          'Name one of these to take out: agentwhy protect --remove --unprotect <path>',
          '',
        ].join('\n'),
      };
    }

    const { settings: next, removed } = withoutDenyEntries(settings, taking);
    const stays = others(next);
    const staying = stays.length === 0
      ? []
      : [`${stays.map(printable).join(', ')} ${stays.length === 1 ? 'stays' : 'stay'}: ${stays.length === 1 ? 'a rule' : 'rules'} for another tool, which agentwhy reads as a block too, so ${stays.length === 1 ? 'that path stays' : 'those paths stay'} protected until ${stays.length === 1 ? 'it is' : 'they are'} taken out by hand.`];
    const plan = [
      `agentwhy will take this out of ${where}:`,
      '',
      '  Stop protecting',
      ...[...new Set(taking.map(pathOfRule))].map((rule) => `    ${printable(rule)}`),
      '',
      ...staying.map((line) => `  ${line}`),
      ...(staying.length === 0 ? [] : ['']),
      `  Every other setting and rule in ${where} stays. The file is rewritten as two-space JSON.`,
    ];
    const consent = await this.#consent(options, 'Remove it?', plan);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;

    // Found by review, 2026-10-06: this passed nothing to put back, so a write cut short by a full disk left Claude
    // Code's own settings file cut short too, while the person was told nothing had changed.
    const written = await this.#write(path, next, before);
    if (written !== undefined) return { outcome: 'unwritable', output: `${said}${where} ${written}\n` };
    const after = stays.length === 0 ? 'Those paths are no longer protected outside the projects that name them themselves.' : staying[0];
    return { outcome: 'written', output: `${said}Removed: ${count(removed, 'deny rule')}. ${after}\n` };
  }

  /** R7: `--yes`, a person's answer at a terminal, or the plan printed and nothing written. */
  async #consent(options: Pick<GlobalSetupOptions, 'yes'>, question: string, plan: readonly string[], json: readonly string[] = []): Promise<'given' | 'asked' | SetupResult> {
    if (options.yes) return 'given';
    const withJson = json.length === 0 ? plan : [...plan, '', '  The exact JSON:', ...json];
    if (!this.#dependencies.interactive) {
      return { outcome: 'not-confirmed', output: `${withJson.join('\n')}\n\nNothing was written. To write it: the same command with --yes\n` };
    }

    for (const shown of [false, true]) {
      const heading = `${(shown ? withJson : plan).join('\n')}\n\n${question}`;
      const chosen = await this.#dependencies.chooser.choose(heading, [
        { label: 'Yes', detail: 'write it, for every project on this computer' },
        ...(shown || json.length === 0 ? [] : [{ label: 'Show me the exact JSON', detail: 'the lines it will add, before you decide' }]),
        { label: 'No', detail: 'leave your settings as they are' },
      ]);
      if (chosen === 0) return 'asked';
      if (shown || json.length === 0 || chosen !== 1) break;
    }
    return { outcome: 'declined', output: 'Nothing was written.\n' };
  }

  /** The file, written whole; a sentence where it could not be, and the text it held put back where there was one. */
  async #write(path: string, settings: JsonObject, before: string | undefined): Promise<string | undefined> {
    try {
      await this.#dependencies.files.ensureDirectory(join(this.#dependencies.home, SETTINGS_FILES.directory));
      await this.#dependencies.files.writeText(path, `${JSON.stringify(settings, null, 2)}\n`);
      return undefined;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      if (before === undefined) return 'could not be written, so nothing was changed';
      // A write that failed part way may have cut the file short, and this one is Claude Code's own settings.
      try {
        if ((await this.#dependencies.files.readText(path)) !== before) await this.#dependencies.files.writeText(path, before);
        return 'could not be written, so it was put back as it was';
      } catch {
        return 'could not be written, and may be cut short: it could not be put back as it was';
      }
    }
  }

  async #read(path: string): Promise<{ readonly kind: 'absent' } | { readonly kind: 'object'; readonly settings: JsonObject; readonly text: string } | { readonly kind: 'broken' | 'unreadable' }> {
    let text: string;
    try {
      text = await this.#dependencies.files.readText(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { kind: error.failure === 'not-found' ? 'absent' : 'unreadable' };
    }
    const settings = parseJsonObject(text);
    return settings === undefined ? { kind: 'broken' } : { kind: 'object', settings, text };
  }
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP1, replacing GD3: a rule in this file names a place where it can - `~/x` under
 * the home, `//x` elsewhere (`/x` is written `//x`, since Claude Code reads a single slash against the settings file's
 * folder, GB4) - the form Claude Code applies wherever it works (IPB5, IPB6, IPB11) and `refuse` reads as the same place
 * (IP3). A name or a tail is anchored as before: it holds only inside the folder the AI works in (IPB3, IPB4).
 */
function anchored(pattern: string): string {
  return computerForm(pattern);
}

/** The path inside a deny rule, for a line a person reads: `Read(**\/.ssh/**)` is shown as `**\/.ssh/**`. */
function pathOfRule(entry: string): string {
  return entry.replace(/^[A-Za-z]+\(/, '').replace(/\)$/, '');
}

function count(many: number, thing: string): string {
  return `${many} ${many === 1 ? thing : `${thing}s`}`;
}

function pathCount(many: number): string {
  return `${many} ${many === 1 ? 'path is' : 'paths are'}`;
}

/** R4f, for this file too: the exact JSON, so nobody has to take the description on trust. */
function jsonPreview(entries: readonly string[]): string[] {
  return JSON.stringify({ permissions: { deny: entries } }, null, 2).split('\n');
}
