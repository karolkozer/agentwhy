// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { denyEntriesFor, fileRulesIn, isDenied, withDenyEntries, withoutDenyEntries } from '../adapter/claude-code/settings/deny-entries.ts';
import {
  installedHooks,
  missingHookEntries,
  runningInvocation,
  withHookEntries,
  withHooksPinnedTo,
  withHooksReading,
  withoutAgentwhyHooks,
  type AgentwhyHook,
  type HookEntry,
  type PinChange,
  type RulesFile,
} from '../adapter/claude-code/settings/hook-entries.ts';
import { DEFAULT_POLICY } from '../core/policy/default-policy.ts';
import type { AgentwhyInvocation } from '../ports/agentwhy-invocation.ts';
import type { Asker } from '../ports/asker.ts';
import type { Chooser } from '../ports/chooser.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileWriter } from '../ports/file-writer.ts';
import type { MultiChooser } from '../ports/multi-chooser.ts';
import { parseJsonObject, type JsonObject } from '../shared/json.ts';
import { plainVersion } from '../shared/plain-version.ts';
import { printable } from '../shared/printable.ts';
import { notAProject, type NotAProject } from './not-a-project.ts';
import { patternsIn, patternsOf, type Patterns } from './protected-patterns.ts';

export interface SetupOptions {
  /** The hooks named on the command line (R4b). Absent means: ask, or install `watch` where nobody can be asked. */
  readonly hooks?: readonly AgentwhyHook[];
  /**
   * Install the hooks named and leave every other hook as it runs - a switch on the Settings page. Without it, hooks
   * named by a flag are the whole set and a running hook not named is taken out (R4b), as `--watch` alone always did.
   */
  readonly keep?: boolean;
  /** Patterns to protect, from `--protect` (R4c). Whatever a person types at the terminal is added to these. */
  readonly protect: readonly string[];
  /** Which file to write: the person's own, or the one everyone who clones the project gets (R4g). */
  readonly target?: SettingsTarget;
  /** Take agentwhy's hooks out instead (R8); with `hooks`, only those (R4b). */
  readonly remove: boolean;
  /** With `--remove`: the protected patterns to take out as well, named on the command line (R27). */
  readonly unprotect?: readonly string[];
  /** Consent given on the command line, for where nobody can be asked (R7). */
  readonly yes: boolean;
  /**
   * How a hook invokes agentwhy, from `--command` (R9). Absent, the setup settles it: as the running hooks invoke it,
   * else as this agentwhy runs (`a-hook-runs-what-you-ran.md` J1).
   */
  readonly invoke?: string;
  /**
   * `--update`: pin the hooks that run an older release to this one's, and nothing else (`nothing-updates-by-itself.md`
   * U7). Every other option but `yes` is ignored with it; `init` refuses them beside it.
   */
  readonly update?: boolean;
  /**
   * `--codex`: write Codex's hook too, in a project with no sign of using Codex (`codex-blocks-too` CK6). Read by
   * `CodexMirror`, which wraps this setup; this one writes Claude Code's settings alone.
   */
  readonly codex?: boolean;
}

/** The options with the command settled: what every hook written in this run runs (J1). */
type Settled = SetupOptions & { readonly invoke: string };

/** Which settings file this run reads and writes (R4, R4g). */
export type SettingsTarget = 'local' | 'shared';

/**
 * `unchanged` - nothing to add or to remove. `declined` - a person was asked and said no, or chose nothing.
 * `not-confirmed` - nobody could be asked and `--yes` was not given, so the plan was printed and nothing written.
 * `refused` - the settings file is not one this command will rewrite.
 */
export type SetupOutcome = 'written' | 'unchanged' | 'declined' | 'not-confirmed' | 'refused' | 'unwritable';

export interface SetupResult {
  readonly outcome: SetupOutcome;
  readonly output: string;
}

export interface SetupUseCase {
  run(options: SetupOptions): Promise<SetupResult>;
}

export interface ProjectSetupDependencies {
  readonly files: FileReader & FileWriter;
  readonly chooser: Chooser;
  /** The list with boxes: what agentwhy should do here (R4a). */
  readonly hookChooser: MultiChooser;
  /** What else to protect, in the person's own words (R4c). */
  readonly asker: Asker;
  /** Both streams are terminals, so a person can be asked. */
  readonly interactive: boolean;
  readonly workingDirectory: string;
  /** The person's home directory: a working directory that is this one is not a project (`which-project.md` V8). */
  readonly home: string;
  /** The same directory with every link followed, where `home` reaches it through one (`notAProject`). */
  readonly realHome?: string;
  /** How this agentwhy runs, for a hook nothing else names a command for (J1 step 3, J2). */
  readonly invocation: AgentwhyInvocation;
}

/** Which file this run is writing, and how to say where that is. */
interface SetupPlace {
  readonly directory: string;
  readonly target: SettingsTarget;
  readonly path: string;
  readonly where: string;
  /**
   * The text the file held before this run, where it was there: what a failed write puts back, and whether it was there
   * is what decides when Claude Code applies the change (`whatHappensNow`).
   */
  readonly before: string | undefined;
}

/** What was chosen from the list: the hooks, and whether protected paths were asked for. */
interface Chosen {
  readonly hooks: readonly AgentwhyHook[];
  readonly protect: boolean;
  /**
   * Whether `hooks` is the whole set, so a running hook not in it is taken out: the list a terminal ticks, and hooks
   * named by a flag (R4b). Not where none is named - `--protect` alone leaves every hook as it is (R39) - and not for
   * a switch on the page, which names the one hook it turns on (`keep`).
   */
  readonly whole: boolean;
  /** `refuse` was added because files are protected, not ticked or named: the plan says why (`block-means-blocked` K5). */
  readonly withRules?: boolean;
}

/** Settings as read: absent, not an object, unreadable, or an object. Absence is not an error; the others are. */
type ReadSettings =
  | { readonly kind: 'absent' }
  | { readonly kind: 'object'; readonly settings: JsonObject; readonly text: string }
  | { readonly kind: 'broken' | 'unreadable' };

/** Each line of the list: a word, a dash, what it does - and beside it what it costs (R4a). */
const HOOK_CHOICES: Readonly<Record<AgentwhyHook, { readonly label: string; readonly detail: string }>> = {
  watch: {
    label: 'Notify me - an agent copied a protected value',
    detail: 'for you only; nothing is blocked',
  },
  refuse: {
    label: 'Block - shell commands that open protected files',
    detail: 'also blocks cat .env.example; text match, not a boundary',
  },
};

const HOOKS: readonly AgentwhyHook[] = ['watch', 'refuse'];

/** The third line of the list: not a hook, but the other thing `init` can do (R4a, R4c). */
const PROTECT_CHOICE = {
  label: 'Protect - more files of my own',
  detail: 'deny rules Claude Code applies, and refuse for shell commands',
};

/** Why `refuse` is in a plan nobody ticked it in (`block-means-blocked` K4, K5). */
const REFUSE_WITH_RULES =
  'refuse comes with protected files: the deny rules stop Claude Code\'s own file tools, and refuse keeps shell commands like cat and grep -r away from them';

/** Why nothing is written where no project is (`which-project.md` V8), and where to run instead. */
export const NOT_A_PROJECT: Readonly<Record<NotAProject, string>> = {
  home:
    'agentwhy doesn\'t change settings in your home folder: it isn\'t a project, and Claude Code reads its .claude/settings.json in every project. Nothing was written. Run agentwhy in your project\'s folder.\n',
  root: 'agentwhy doesn\'t change settings at the root of a disk: it isn\'t a project. Nothing was written. Run agentwhy in your project\'s folder.\n',
};

/** What a deny rule is and is not, said where rules are written (R4e). */
const WHAT_A_RULE_IS =
  'a deny rule names a tool, not a file: cat .env walks past Read(.env) unless refuse is on, and neither is a boundary below the agent';

/**
 * `agentwhy init`: asks who the project's setup is for, what agentwhy should do in it, and what else to protect; then
 * shows exactly what it will write and writes it (`specs/2026-09-16-worth-running-every-day.md` R4-R10, R4a-R4h). It
 * never rewrites a file it cannot parse, never edits a rule somebody else wrote, and takes out exactly what it put in.
 */
export class ProjectSetup implements SetupUseCase {
  readonly #dependencies: ProjectSetupDependencies;

  constructor(dependencies: ProjectSetupDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: SetupOptions): Promise<SetupResult> {
    // which-project V8: the home directory's .claude/settings.json is Claude Code's settings for every project, and a root
    // is no project, so nothing is written there - by `init`, Settings or the onboarding alike. Taking out is the one
    // exception: a setup written there before this check has to be removable by the command that wrote it.
    const notOne = notAProject(this.#dependencies.workingDirectory, this.#dependencies.home, this.#dependencies.realHome);
    if (notOne !== undefined && (options.update === true || !options.remove)) return { outcome: 'refused', output: NOT_A_PROJECT[notOne] };

    const directory = join(this.#dependencies.workingDirectory, SETTINGS_FILES.directory);
    // Before "Who is this for?": an update changes the hooks wherever they run, and asks nothing but consent.
    if (options.update === true) return this.#update(directory, options);

    // Who it is for is asked first: it decides which file is read, and a person knows that answer before any other.
    const target = await this.#whereToWrite(options);
    if (target === undefined) return { outcome: 'declined', output: 'Nothing was written.\n' };
    const file = SETTINGS_FILES[target];
    const path = join(directory, file);
    const where = `${SETTINGS_FILES.directory}/${file}`;

    const read = await this.#read(path);
    if (read.kind === 'broken' || read.kind === 'unreadable') {
      return {
        outcome: 'refused',
        output: `${where} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so nothing was written. Fix it, or add the hooks by hand: agentwhy watch --help\n`,
      };
    }
    const settings = read.kind === 'object' ? read.settings : {};
    const settled: Settled = { ...options, invoke: options.invoke ?? (await this.#invocation(directory)) };
    if (options.remove) return this.#remove(settings, path, where, settled);

    const chosen = await this.#whatToDo(options, await this.#alreadyRunning(directory));
    if (chosen === undefined) return { outcome: 'declined', output: 'Nothing was written.\n' };

    const protect = await this.#patternsToProtect(options, await this.#protectedNow(directory), chosen.protect);
    if (protect === undefined) return { outcome: 'declined', output: 'Nothing was written.\n' };

    return this.#install(settings, { directory, target, path, where, before: read.kind === 'object' ? read.text : undefined }, settled, chosen, protect);
  }

  /**
   * J1, where `--command` names none: the command the project's agentwhy hooks already run, the local file first, so
   * a hook written now runs the way they do (R42); else the way this agentwhy runs. Asked once, before anything is
   * written, and the finder only where the files say nothing.
   */
  async #invocation(directory: string): Promise<string> {
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const read = await this.#read(join(directory, file));
      const running = read.kind === 'object' ? runningInvocation(read.settings) : undefined;
      if (running !== undefined) return running;
    }
    return this.#dependencies.invocation.find();
  }

  /**
   * `init --update` (`nothing-updates-by-itself.md` U7): every agentwhy hook in either file pinned to an older release is
   * pinned to this one's, after the same consent as any run (R7). Nothing is installed, removed or protected, and a hook
   * that was never pinned stays as it is - pinning one is `init` writing a hook (J1), not an update.
   */
  async #update(directory: string, options: SetupOptions): Promise<SetupResult> {
    const version = await this.#dependencies.invocation.version();
    if (version === undefined || plainVersion(version) === undefined) {
      return { outcome: 'unchanged', output: `This agentwhy${version === undefined ? '' : ` (${version})`} is not a release, so there is nothing to update to.\n` };
    }

    const changes: {
      readonly path: string;
      readonly where: string;
      readonly text: string;
      readonly next: JsonObject;
      readonly changed: readonly PinChange[];
    }[] = [];
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const path = join(directory, file);
      const where = `${SETTINGS_FILES.directory}/${file}`;
      const read = await this.#read(path);
      // One file that cannot be read stops the whole update: half an update would leave the two files on two releases.
      if (read.kind === 'broken' || read.kind === 'unreadable') {
        return { outcome: 'refused', output: `${where} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so nothing was written.\n` };
      }
      if (read.kind !== 'object') continue;
      const { settings: next, changed } = withHooksPinnedTo(read.settings, version);
      if (changed.length > 0) changes.push({ path, where, text: read.text, next, changed });
    }
    if (changes.length === 0) {
      return { outcome: 'unchanged', output: `Nothing to update: no hook here runs a release of agentwhy older than ${version}.\n` };
    }

    const plan = [
      `agentwhy init --update will pin agentwhy's hooks to ${version}:`,
      '',
      ...changes.flatMap(({ where, changed }) => [
        `  ${where}`,
        // The event is a key of a file that may have come with a clone: shown through `printable`, like its rules.
        ...changed.map(({ hook, event, from }) => `    ${`${hook} (${printable(event)})`.padEnd(24)}${from} -> ${version}`),
      ]),
      '',
      '  Nothing else in either file changes. Each file is rewritten as two-space JSON.',
    ];
    const consent = await this.#consent(options, 'Update it?', plan);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;

    const written: (typeof changes)[number][] = [];
    for (const change of changes) {
      try {
        await this.#dependencies.files.writeText(change.path, `${JSON.stringify(change.next, null, 2)}\n`);
        written.push(change);
      } catch (error) {
        // Found by a review: the file written before this one stayed written, and the project ran two releases. By a
        // second: only on an error the port names - a full or read-only disk left it so all the same - and a write that
        // failed part way may have cut its own file short, so that one is put back too.
        const stuck = await this.#putBack([...written, change]);
        if (!(error instanceof FileAccessError)) throw error;
        const ahead = stuck.filter((where) => where !== change.where);
        const cut = stuck.includes(change.where) ? ` ${change.where} may be cut short: it could not be put back as it was.` : '';
        return {
          outcome: 'unwritable',
          output: stuck.length === 0
            ? `${said}${change.where} could not be written, so nothing was changed.\n`
            : ahead.length === 0
              ? `${said}${change.where} could not be written.${cut}\n`
              : `${said}${change.where} could not be written, and ${ahead.join(' and ')} could not be put back: it runs agentwhy ${version} now, and ${change.where} does not.${cut} Run agentwhy init --update again once ${change.where} can be written.\n`,
        };
      }
    }
    return { outcome: 'written', output: `${said}Updated: from your AI's next reply, the hooks here run agentwhy ${version}.\n` };
  }

  /**
   * Each file back to the text it held before a write, where it does not hold it still; the ones that could not be, by
   * name. Whatever stops one is recorded, not thrown: this runs after a write has already failed, and that failure is
   * what the caller reports.
   *
   * The text is what `readText` decoded, so a file in UTF-8 - which JSON is - comes back byte for byte, and a byte that
   * is not UTF-8 comes back as U+FFFD, as the write being undone wrote it (found by a review: this said byte for byte
   * of every file). Putting back the bytes themselves needs a port that reads and writes bytes.
   */
  async #putBack(files: readonly { readonly path: string; readonly where: string; readonly text: string }[]): Promise<string[]> {
    const stuck: string[] = [];
    for (const { path, where, text } of files) {
      if (await this.#holds(path, text)) continue;
      try {
        await this.#dependencies.files.writeText(path, text);
      } catch {
        stuck.push(where);
      }
    }
    return stuck;
  }

  /** Whether a file holds exactly this text: a write that failed before it opened the file left it as it was. */
  async #holds(path: string, text: string): Promise<boolean> {
    try {
      return (await this.#dependencies.files.readText(path)) === text;
    } catch {
      return false;
    }
  }

  /** Whether a person is there to answer. `--yes` says "do not ask me", and is honoured as that. */
  get #canAsk(): boolean {
    return this.#dependencies.interactive;
  }

  /**
   * R4, R4g: the local file unless the person says otherwise - it stays out of the repository, so a tool one person
   * installs is not installed for everyone who clones. A terminal is asked; `--shared` answers off one.
   */
  async #whereToWrite(options: SetupOptions): Promise<SettingsTarget | undefined> {
    if (options.target !== undefined) return options.target;
    if (!this.#canAsk || options.yes || options.remove) return 'local';

    const chosen = await this.#dependencies.chooser.choose('Who is this for? (change it later: agentwhy init --shared, or --remove)', [
      { label: 'Just me', detail: `${SETTINGS_FILES.directory}/${SETTINGS_FILES.local} - stays out of the repository` },
      {
        label: 'Everyone here',
        detail: `${SETTINGS_FILES.directory}/${SETTINGS_FILES.shared} - committed, so it runs for everyone who clones`,
      },
    ]);
    return chosen === undefined ? undefined : chosen === 0 ? 'local' : 'shared';
  }

  /**
   * R4a: one list for everything `init` can do here - the two hooks, and whether to name protected files of its own.
   * Off a terminal the flags are the answer, and `watch` alone is the default, as the first version had it.
   */
  async #whatToDo(options: SetupOptions, installed: ReadonlySet<AgentwhyHook>): Promise<Chosen | undefined> {
    const chosen = await this.#chosen(options, installed);
    // An empty list names no hook on purpose - the page changing or moving a rule that is already there (K3) - and is
    // kept as it is; everywhere else, protecting files installs `refuse` with them.
    return chosen === undefined || options.hooks?.length === 0 ? chosen : withRefuse(chosen);
  }

  async #chosen(options: SetupOptions, installed: ReadonlySet<AgentwhyHook>): Promise<Chosen | undefined> {
    if (options.hooks !== undefined) {
      return { hooks: options.hooks, protect: options.protect.length > 0, whole: options.hooks.length > 0 && options.keep !== true };
    }
    if (!this.#canAsk || options.yes) return { hooks: ['watch'], protect: options.protect.length > 0, whole: false };

    const rows = [
      ...HOOKS.map((hook) => ({
        ...HOOK_CHOICES[hook],
        // What is already there stays ticked, so that answering without touching anything changes nothing.
        selected: installed.has(hook) || hook === 'watch',
      })),
      // Ticked only when it was asked for on the command line: the default is one thing, and it is the notice.
      { ...PROTECT_CHOICE, selected: options.protect.length > 0 },
    ];
    const chosen = await this.#dependencies.hookChooser.chooseMany(
      'What should agentwhy do here? Tick everything you want.',
      rows,
    );
    if (chosen === undefined) return undefined;

    return {
      hooks: chosen.flatMap((position) => (HOOKS[position] === undefined ? [] : [HOOKS[position]])),
      // The last row is the question of R4c; a `--protect` on the command line asks it whether it is ticked or not.
      protect: chosen.includes(rows.length - 1) || options.protect.length > 0,
      whole: true,
    };
  }

  /** R4c, R4h: what `--protect` named, plus what a person types once they have been shown what is protected today. */
  async #patternsToProtect(options: SetupOptions, held: readonly string[], asked: boolean): Promise<Patterns | undefined> {
    const given = patternsOf(options.protect);
    if (!asked || !this.#canAsk || options.yes) return given;

    const now =
      held.length === 0
        ? `${shorten(DEFAULT_POLICY.protected.map((entry) => entry.pattern))} (the built-in list)`
        : shorten(held.map((entry) => printable(pathOfRule(entry))));
    const typed = await this.#dependencies.asker.ask(
      `Protected now: ${now}. Anything else? Comma-separated; Enter to skip`,
      '*.pem, config/credentials.json',
    );
    if (typed === undefined) return undefined;

    const answered = patternsIn(typed);
    // The same pattern given on the command line and typed again is one rule, not two.
    return { patterns: [...new Set([...given.patterns, ...answered.patterns])], refused: [...given.refused, ...answered.refused] };
  }

  /** What the project protects today, for R4h: the local file's rules, else the shared file's, else none. */
  async #protectedNow(directory: string): Promise<readonly string[]> {
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const read = await this.#read(join(directory, file));
      const rules = read.kind === 'object' ? fileRulesIn(read.settings) : [];
      if (rules.length > 0) return rules;
    }
    return [];
  }

  /** Which hooks the project already runs, for the ticks of the list: read from both files, whichever is written. */
  async #alreadyRunning(directory: string): Promise<ReadonlySet<AgentwhyHook>> {
    const running = new Set<AgentwhyHook>();
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const read = await this.#read(join(directory, file));
      if (read.kind === 'object') for (const hook of installedHooks(read.settings)) running.add(hook);
    }
    return running;
  }

  async #install(settings: JsonObject, place: SetupPlace, options: Settled, chosen: Chosen, protect: Patterns): Promise<SetupResult> {
    const { directory, target, path, where, before } = place;
    const installed = installedHooks(settings, options.invoke);
    const wanted = chosen.hooks;

    const otherFile = SETTINGS_FILES[target === 'local' ? 'shared' : 'local'];
    const other = await this.#read(join(directory, otherFile));
    const otherSettings = other.kind === 'object' ? other.settings : {};
    const otherRules = fileRulesIn(otherSettings);
    // R4g: a hook this run installs that already runs from the other file is moved, not left to run twice.
    const running = installedHooks(otherSettings, options.invoke);
    const moving = wanted.filter((hook) => running.has(hook));

    // Whatever happens next, a pattern that could not be written is said: silence would read as "it is protected now".
    const refused = protect.refused.map(({ pattern, reason }) => `Not written: "${pattern}" - ${reason}.\n`).join('');

    // Per event, not per hook: a file that runs `watch` on `SubagentStop` alone is missing its `Stop`, and asking
    // for `watch` again has to add it rather than answer that there is nothing to do. Which events are missing does
    // not depend on where the rules come from, so this reads them before that file is settled, and the entries
    // themselves are built once it is.
    const missing = [...new Set(missingHookEntries(settings, wanted, options.invoke, undefined).map((entry) => entry.hook))];
    // A hook that was running and is not ticked is taken out here too: the list shows what is on, and unticking a
    // line is how a person turns it off, the same as ticking one is how they turn it on.
    const unwanted = chosen.whole ? HOOKS.filter((hook) => installed.has(hook) && !wanted.includes(hook)) : [];
    const newRules = protect.patterns.filter((pattern) => !isDenied(settings, pattern)).flatMap(denyEntriesFor);

    if (wanted.length === 0 && installed.size === 0 && protect.patterns.length === 0) {
      return { outcome: 'declined', output: `${refused}Nothing was chosen, so nothing was written.\n` };
    }
    if (missing.length === 0 && unwanted.length === 0 && newRules.length === 0 && moving.length === 0) {
      const hooks =
        wanted.length === 0 ? `${where} runs none of agentwhy's hooks` : `${where} already runs ${wanted.map((hook) => `agentwhy ${hook}`).join(' and ')}`;
      const paths = protect.patterns.length === 0 ? '' : ', and every path named is already denied there';
      return { outcome: 'unchanged', output: `${refused}${hooks}${paths}. Nothing to add.\n` };
    }

    // R4d: rules written here move where the hooks read, so what the shared file protects is copied in with them. Only
    // in that direction: a person's own rules copied into a shared file would publish a choice they made for themselves.
    const copied = newRules.length === 0 || target === 'shared' ? [] : otherRules.filter((entry) => !fileRulesIn(settings).includes(entry));
    const denyToWrite = [...newRules, ...copied];

    const rules = rulesFileFor(target, settings, otherRules, denyToWrite);
    const entries = missingHookEntries(settings, wanted, options.invoke, rules);
    const ruleCount = rules === target ? fileRulesIn(settings).length + denyToWrite.length : otherRules.length;
    const { settings: withoutUnwanted } = withoutAgentwhyHooks(settings, options.invoke, unwanted);
    // `withHookEntries` always writes a `hooks` key, even an empty one; skipped when there is nothing to add, so
    // taking out the last hook does not leave a stray `"hooks": {}` behind.
    const written = withDenyEntries(entries.length === 0 ? withoutUnwanted : withHookEntries(withoutUnwanted, entries), denyToWrite);
    // R4d: a hook already here goes on reading what it read unless it is pointed again, and a rule written for it would
    // be enforced by Claude Code and never read by the hook. Only where this run writes rules: a run that writes none
    // changes nothing about where the hooks read from.
    const { settings: next, changed: repointed } =
      rules === undefined || denyToWrite.length === 0 ? { settings: written, changed: [] as readonly AgentwhyHook[] } : withHooksReading(written, rules, options.invoke);

    const plan = [
      `agentwhy will change this in ${where}${target === 'local' ? ' (your own file, not committed)' : ' (committed, so it runs for everyone who clones)'}:`,
      '',
      ...(entries.length === 0 ? [] : ['  Run automatically', ...entries.map((entry) => `    ${describe(entry)}`), '']),
      ...(unwanted.length === 0 ? [] : ['  Stop running', ...unwanted.map((hook) => `    agentwhy ${hook}`), '']),
      ...(denyToWrite.length === 0 ? [] : ['  Protect', ...protectLines(newRules, copied), '']),
      ...(moving.length === 0
        ? []
        : [
            `  Moving out of ${SETTINGS_FILES.directory}/${otherFile}: ${moving.join(' and ')}, so ${moving.length === 1 ? 'it does' : 'they do'} not run twice.`,
            '',
          ]),
      ...(rules === undefined
        ? ['  Protected after this: the built-in list, since no deny rule here names a file.', `    ${defaultPatterns()}`, '']
        : [
            `  Protected after this: ${count(ruleCount, 'rule')} in ${SETTINGS_FILES.directory}/${SETTINGS_FILES[rules]}, which is what the hooks read.`,
            ...(repointed.length === 0
              ? []
              : [`  Pointed at it: ${repointed.map((hook) => `agentwhy ${hook}`).join(' and ')}, which read other rules until now.`]),
            '',
          ]),
      '  Good to know',
      ...[...(chosen.withRules === true && missing.includes('refuse') ? [REFUSE_WITH_RULES] : []), ...notes(missing, copied.length, options.invoke)].map((note) => `    - ${note}`),
    ];

    // R4f: the JSON is there for whoever wants it, behind a choice - a wall of it above the question is not read.
    const json = jsonPreview(entries, denyToWrite).map((line) => `    ${line}`);
    const consent = await this.#consent(options, 'Write it?', plan, json);
    if (typeof consent !== 'string') return consent;
    // A person at the terminal has just read the plan and chose whether to see the JSON. A run with --yes asked
    // nobody anything, so its output carries both: it is the only record that the change was described at all.
    const said = consent === 'asked' ? '' : `${[...plan, '', '  The exact JSON:', ...json].join('\n')}\n\n`;

    // R4g, found by a review: a moved hook comes out of the other file first, so a failure writing this one can put that
    // one back - its text is known, since it held the hook. Written the other way round, a failure left the hook running
    // from both files, and the answer named the file that had been written.
    const otherWhere = `${SETTINGS_FILES.directory}/${otherFile}`;
    const tookOut = moving.length > 0 && other.kind === 'object' ? { path: join(directory, otherFile), where: otherWhere, text: other.text } : undefined;
    let writing = where;
    try {
      await this.#dependencies.files.ensureDirectory(directory);
      if (tookOut !== undefined) {
        writing = otherWhere;
        const { settings: without } = withoutAgentwhyHooks(otherSettings, options.invoke, moving);
        await this.#dependencies.files.writeText(tookOut.path, `${JSON.stringify(without, null, 2)}\n`);
        writing = where;
      }
      await this.#dependencies.files.writeText(path, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      // Found by a review: only the file a hook moved out of was put back, and a write that failed part way - a full or
      // read-only disk - may have cut this one short, as `#update` already knew. A file this run created is not
      // there to put back: the port writes, and does not delete.
      const thisFile = writing === where && before !== undefined ? [{ path, where, text: before }] : [];
      const stuck = await this.#putBack([...(tookOut === undefined ? [] : [tookOut]), ...thisFile]);
      if (!(error instanceof FileAccessError)) throw error;
      const moved = moving.map((hook) => `agentwhy ${hook}`).join(' and ');
      const otherStuck = stuck.includes(otherWhere);
      const after =
        tookOut === undefined ? ''
        : writing === otherWhere ? (otherStuck ? `, and may be cut short: it could not be put back as it was` : ', so nothing was changed')
        : otherStuck ? `, and ${otherWhere} could not be put back: ${moved} runs from neither file now`
        : `, so ${otherWhere} was put back as it was`;
      const cut = writing === where && stuck.includes(where) ? ` ${where} may be cut short: it could not be put back as it was.` : '';
      return { outcome: 'unwritable', output: `${refused}${said}${writing} could not be written${after}.${cut}\n` };
    }
    return { outcome: 'written', output: `${refused}${said}${whatHappensNow(missing, unwanted, denyToWrite.length, where, before !== undefined)}` };
  }

  /**
   * R26, R27: what to take out is chosen from a list at a terminal - the hooks the file runs, and the deny rules it
   * holds, each shown as the path it protects. Off a terminal the flags decide: `--remove` takes the hooks out, and
   * `--unprotect` names rules, so nothing is removed that nobody named.
   */
  async #remove(settings: JsonObject, path: string, where: string, options: Settled): Promise<SetupResult> {
    const running = [...installedHooks(settings, options.invoke)];
    const rules = fileRulesIn(settings);

    const taking = await this.#whatToRemove(options, running, rules, where);
    if (taking === undefined) return { outcome: 'declined', output: 'Nothing was removed.\n' };

    const { settings: withoutHooks, removed } = withoutAgentwhyHooks(settings, options.invoke, taking.hooks);
    const { settings: next, removed: rulesRemoved } = withoutDenyEntries(withoutHooks, taking.rules);
    if (removed === 0 && rulesRemoved === 0) {
      return { outcome: 'unchanged', output: `Nothing of agentwhy's was found in ${where} to remove.\n` };
    }

    const plan = [
      `agentwhy init --remove will take this out of ${where}:`,
      '',
      ...(removed === 0 ? [] : [`  Hooks          ${taking.hooks === undefined ? 'every hook that runs agentwhy' : taking.hooks.join(' and ')}`]),
      ...(taking.rules.length === 0 ? [] : ['  Deny rules', ...taking.rules.map((entry) => `    ${entry}`)]),
      '',
      '  Everything else in the file stays. It is rewritten as two-space JSON.',
    ];
    const consent = await this.#consent(options, 'Remove it?', plan);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;

    try {
      await this.#dependencies.files.writeText(path, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { outcome: 'unwritable', output: `${said}${where} could not be written.\n` };
    }
    // K6: taking `refuse` out while rules stay leaves them half a block, and that is said with the way back. The way back
    // names `watch` where it still runs here, since `init --refuse` alone would take it out (R4b).
    const tookRefuse = running.includes('refuse') && (taking.hooks === undefined || taking.hooks.includes('refuse'));
    const left = new Set(fileRulesIn(next).map(pathOfRule)).size;
    const back = `agentwhy init --refuse${installedHooks(next, options.invoke).has('watch') ? ' --watch' : ''}${options.target === 'shared' ? ' --shared' : ''}`;
    const halfBlocked = tookRefuse && left > 0
      ? `${count(left, 'protected path')} ${left === 1 ? 'is' : 'are'} no longer kept from shell commands: a command or a search can print ${left === 1 ? 'it' : 'them'}. ${back} puts it back.`
      : '';
    return {
      outcome: 'written',
      output: [
        `${said}Removed${removed === 0 ? '' : `: ${count(removed, 'hook command')}`}${rulesRemoved === 0 ? '' : `${removed === 0 ? ': ' : ', '}${count(rulesRemoved, 'deny rule')}`}.`,
        rulesRemoved === 0 && rules.length > 0 ? `The ${count(rules.length, 'deny rule')} in that file stayed; agentwhy init --remove lists them to pick from at a terminal.` : '',
        halfBlocked,
        'To set it up again: agentwhy init',
        '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }

  /** The hooks and rules to take out: ticked at a terminal, or named by the flags where nobody can be asked. */
  async #whatToRemove(
    options: SetupOptions,
    running: readonly AgentwhyHook[],
    rules: readonly string[],
    where: string,
  ): Promise<{ readonly hooks?: readonly AgentwhyHook[]; readonly rules: readonly string[] } | undefined> {
    const named = patternsOf(options.unprotect ?? []).patterns.flatMap(denyEntriesFor).filter((entry) => rules.includes(entry));
    if (options.hooks !== undefined || !this.#canAsk || options.yes) {
      return { ...(options.hooks === undefined ? {} : { hooks: options.hooks }), rules: named };
    }
    if (running.length === 0 && rules.length === 0) return { rules: [] };

    const byPath = [...rules.reduce((paths, entry) => paths.set(pathOfRule(entry), [...(paths.get(pathOfRule(entry)) ?? []), entry]), new Map<string, string[]>())];
    const rows = [
      ...running.map((hook) => ({ label: `${HOOK_CHOICES[hook].label.split(' - ')[0] ?? hook} - stop running agentwhy ${hook}`, detail: '', selected: false })),
      // One row per path, not per rule: `Read(*.pem)` and `Edit(*.pem)` protect the same thing and go together.
      ...byPath.map(([path, entries]) => ({
        label: `Unprotect ${printable(path)}`,
        detail: `takes ${entries.join(' and ')} out of ${where}`,
        selected: false,
      })),
    ];
    const chosen = await this.#dependencies.hookChooser.chooseMany('What should agentwhy stop doing here? Tick what to remove.', rows);
    if (chosen === undefined) return undefined;

    const hooks = chosen.filter((position) => position < running.length).flatMap((position) => (running[position] === undefined ? [] : [running[position]]));
    const picked = chosen.filter((position) => position >= running.length).flatMap((position) => {
      const entry = byPath[position - running.length];
      return entry === undefined ? [] : entry[1];
    });
    return { hooks, rules: [...new Set([...named, ...picked])] };
  }

  /**
   * R7: `--yes` (`given`), or a person's answer at a terminal (`asked`). Anywhere else the plan is printed and nothing is
   * written.
   */
  async #consent(
    options: SetupOptions,
    question: string,
    plan: readonly string[],
    json: readonly string[] = [],
  ): Promise<'given' | 'asked' | SetupResult> {
    if (options.yes) return 'given';
    const withJson = json.length === 0 ? plan : [...plan, '', '  The exact JSON:', ...json];
    if (!this.#canAsk) {
      // Nobody to ask: everything is printed, the JSON included, because this output is the whole record of the run.
      return { outcome: 'not-confirmed', output: `${withJson.join('\n')}\n\nNothing was written. To write it: the same command with --yes\n` };
    }

    for (const shown of [false, true]) {
      const heading = `${(shown ? withJson : plan).join('\n')}\n\n${question}`;
      const chosen = await this.#dependencies.chooser.choose(heading, [
        { label: 'Yes', detail: 'write the file' },
        ...(shown || json.length === 0 ? [] : [{ label: 'Show me the exact JSON', detail: 'the lines it will add, before you decide' }]),
        { label: 'No', detail: 'leave it as it is' },
      ]);
      if (chosen === 0) return 'asked';
      // The middle row asks the same question again with the JSON above it; anything else is a no.
      if (shown || json.length === 0 || chosen !== 1) break;
    }
    return { outcome: 'declined', output: 'Nothing was written.\n' };
  }

  async #read(path: string): Promise<ReadSettings> {
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
 * What a person reads after the file is written: what changes for them from now on, and the two commands that follow.
 * A command that ends without saying what to do next leaves someone who has just installed it with nothing to do.
 *
 * When it applies was measured (`the-agent-tells-you.md` D17): in a file that was there when the session started, a
 * changed hook, a hook added on an event that had none and a deny rule added all applied from the next reply, with no
 * restart. A file created during a session was not measured, so for one this run creates, only what is certain is said.
 */
function whatHappensNow(installed: readonly AgentwhyHook[], stopped: readonly AgentwhyHook[], rules: number, where: string, existed: boolean): string {
  return [
    existed ? "Done. Claude Code applies it from your AI's next reply." : 'Done. Claude Code picks it up when the next session starts.',
    '',
    'What happens now',
    // Both of `watch`'s events, said as one line: an agent it started, and the conversation itself, which has no
    // `SubagentStop` of its own and is where the motivating case happened.
    ...(installed.includes('watch') ? ['  - a notice, for you, when this conversation or an agent it starts copies a protected value'] : []),
    ...(installed.includes('refuse') ? ['  - a shell command that names a protected file, or searches through one, is refused before it runs'] : []),
    ...(stopped.length === 0 ? [] : [`  - stopped: ${stopped.map((hook) => `agentwhy ${hook}`).join(' and ')} no longer runs here`]),
    ...(rules === 0 ? [] : [`  - ${count(rules, 'deny rule')} more in ${where}, which Claude Code applies to Read and Edit`]),
    '  - nothing else changes: your agents work as they did',
    '',
    'Next',
    '  - see what has happened so far      agentwhy check',
    '  - a page with every session         agentwhy start',
    '  - undo this setup                   agentwhy init --remove',
    '',
  ].join('\n');
}

/**
 * `block-means-blocked` K4, K5: a file protected is a file blocked, and a block is its deny rules and `refuse` both -
 * without `refuse`, `cat .env` walks past `Read(.env)` (R4e) and `grep -r` prints it (R21a). So wherever files are
 * protected, `refuse` is installed with them, whatever else was ticked or named; every other hook is as chosen.
 */
function withRefuse(chosen: Chosen): Chosen {
  if (!chosen.protect || chosen.hooks.includes('refuse')) return chosen;
  return { ...chosen, hooks: [...chosen.hooks, 'refuse'], withRules: true };
}

function describe(entry: HookEntry): string {
  const when = entry.hook === 'watch' ? 'when an agent finishes' : 'before a shell command';
  return `${when.padEnd(24)}${entry.command}`;
}

function count(many: number, thing: string): string {
  return `${many} ${many === 1 ? thing : `${thing}s`}`;
}

function defaultPatterns(): string {
  return DEFAULT_POLICY.protected.map((entry) => entry.pattern).join(', ');
}

/** A list a person reads in one line: the first few, and how many were left out. */
function shorten(paths: readonly string[], few = 3): string {
  const shown = paths.slice(0, few).join(', ');
  return paths.length <= few ? shown : `${shown} and ${paths.length - few} more`;
}

/** The path inside a deny rule, for a line a person reads: `Read(*.pem)` is shown as `*.pem`. */
function pathOfRule(entry: string): string {
  return entry.replace(/^[A-Za-z]+\(/, '').replace(/\)$/, '');
}

/**
 * One line per path being protected, saying which are new and which were copied so they stay protected (R4d). Only
 * what is shown passes through `printable`: the rule itself stays exact, because `--unprotect` matches the string the
 * file holds, and a path changed on its way to a map key would join two rules into one.
 */
function protectLines(added: readonly string[], copied: readonly string[]): string[] {
  const paths = (entries: readonly string[]): string[] => [...new Set(entries.map(pathOfRule))];
  return [
    ...paths(added).map((path) => `    ${printable(path).padEnd(28)}added, for reading and for editing`),
    ...paths(copied).map((path) => `    ${printable(path).padEnd(28)}copied from ${SETTINGS_FILES.shared}, so it stays protected`),
  ];
}

/** The short lines under "Good to know": only what applies to this run. */
function notes(installing: readonly AgentwhyHook[], copied: number, invoke: string): string[] {
  return [
    ...(installing.includes('watch')
      ? ['watch notifies you and never the model: a macOS notification anywhere, and a terminal one in terminal claude']
      : []),
    ...(installing.includes('refuse') ? ['refuse also blocks cat .env.example, and it reads a command as text, so a path in a variable passes'] : []),
    WHAT_A_RULE_IS,
    ...(copied === 0
      ? []
      : [`the ${count(copied, 'copied rule')} will not follow later changes to ${SETTINGS_FILES.shared}; Claude Code reads both files anyway`]),
    `the hooks run "${invoke}", so it has to be on PATH when Claude Code runs them${invoke.startsWith('npx') ? ' (npx adds its start-up time to every hook)' : ''}`,
    'nothing else in the file changes, and agentwhy init --remove takes the hooks back out',
  ];
}

/** R4f: the exact JSON, so nobody has to take the description on trust. */
function jsonPreview(entries: readonly HookEntry[], deny: readonly string[]): string[] {
  const preview = {
    ...(entries.length === 0 ? {} : { hooks: Object.fromEntries(eventsOf(entries)) }),
    ...(deny.length === 0 ? {} : { permissions: { deny } }),
  };
  return JSON.stringify(preview, null, 2).split('\n');
}

function eventsOf(entries: readonly HookEntry[]): [string, unknown][] {
  const events = new Map<string, unknown[]>();
  for (const entry of entries) {
    const list = events.get(entry.event) ?? [];
    list.push({
      ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
      hooks: [{ type: 'command', command: entry.command }],
    });
    events.set(entry.event, list);
  }
  return [...events];
}

/**
 * R6, R4d: which file the hooks are pointed at - the one being written when it ends up holding file rules, and the
 * other one when only it has any. Neither holding one means the built-in default, and the hooks get no flag at all.
 */
function rulesFileFor(target: SettingsTarget, settings: JsonObject, otherRules: readonly string[], writing: readonly string[]): RulesFile | undefined {
  if (writing.length > 0 || fileRulesIn(settings).length > 0) return target;
  return otherRules.length > 0 ? (target === 'local' ? 'shared' : 'local') : undefined;
}
