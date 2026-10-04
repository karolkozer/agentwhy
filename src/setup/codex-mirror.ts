// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { installedHooks } from '../adapter/claude-code/settings/hook-entries.ts';
import { PROJECT_HOOKS, USER_HOOKS } from '../adapter/codex/contract/hooks.ts';
import { agentwhyCodexEntries, approvedCodexEntries, codexRefuseCommand, codexRefuseIn, codexStopCommand, withOwnPair, withoutOwnEntries } from '../adapter/codex/settings/codex-hooks.ts';
import { approvalKey, entryHash, tomlDefinesHooks, withOwnApprovals, withoutOwnApprovals, type ConfigEdit } from '../adapter/codex/settings/hook-approval.ts';
import type { AgentwhyInvocation } from '../ports/agentwhy-invocation.ts';
import type { Chooser } from '../ports/chooser.ts';
import type { CommandTrial, TrialOutcome } from '../ports/command-trial.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileReplacer } from '../ports/file-replacer.ts';
import type { FileWriter } from '../ports/file-writer.ts';
import { parseJsonObject, type JsonObject } from '../shared/json.ts';
import { isPlainInvocation } from '../shared/plain-invocation.ts';
import type { SetupOptions, SetupOutcome, SetupResult, SetupUseCase } from './project-setup.ts';

export interface CodexMirrorDependencies {
  /** The setup whose Claude Code settings this one follows: `ProjectSetup`, with the choosers of where it runs. */
  readonly setup: SetupUseCase;
  readonly files: FileReader & FileWriter & DirectoryReader & FileReplacer;
  readonly chooser: Chooser;
  /** Both streams are terminals, so a person can be asked. */
  readonly interactive: boolean;
  readonly workingDirectory: string;
  /** The home directory, where the person's own Codex files are (AO1). */
  readonly home: string;
  readonly invocation: AgentwhyInvocation;
  /** Whether Codex is used on this computer: its `~/.codex` folder exists (CK6, AO8). */
  readonly codexOnThisComputer: () => Promise<boolean>;
  /** AO14: a command is tried once, as Codex will run it, before it is written. Absent: nothing is written to `~/.codex`. */
  readonly trial?: CommandTrial;
  /** A folder no project is above, where the trial runs: the check there must do nothing and exit 0. */
  readonly trialFolder: string;
}

/** The person's two Codex files and the project's old one, as they are written about. */
const WHERE_USER = `~/${USER_HOOKS.directory}/${USER_HOOKS.file}`;
const WHERE_CONFIG = `~/${USER_HOOKS.directory}/${USER_HOOKS.config}`;
const WHERE_PROJECT = `${PROJECT_HOOKS.directory}/${PROJECT_HOOKS.file}`;

/** What holds once agentwhy has approved its own check (AO1, AO2) - said wherever it is written. */
const FROM_THE_FIRST_MESSAGE =
  'Codex blocks the same files from the first message, in the terminal and in VS Code, with nothing to approve in Codex. The check acts only in projects whose rules block files.';
/** AOB9's cost, said in the plan the person consents to (AO8). */
const COST = 'It runs before every Codex shell command and at the end of every reply on this computer: about a tenth of a second where agentwhy is run directly, a quarter through npx.';

/** What a hooks file holds as read: absent, an object, or a file this will not rewrite. */
type ReadHooks = { readonly kind: 'absent' } | { readonly kind: 'object'; readonly file: JsonObject } | { readonly kind: 'broken' | 'unreadable' };

/** The person's files and the project's, read once at the start of a run. */
interface Read {
  readonly userPath: string;
  readonly configPath: string;
  readonly projectPath: string;
  readonly user: ReadHooks;
  readonly config: string;
  readonly project: ReadHooks;
}

/** Every write one run makes, in the order it makes them. */
interface Writes {
  readonly config?: { readonly before: string; readonly edit: (fresh: string) => ConfigEdit };
  readonly hooks?: JsonObject;
  readonly project?: JsonObject;
}

/**
 * `2026-10-02-codex-approves-its-own-hook.md` AO1-AO11, AO14-AO16: after the setup it wraps has written Claude Code's
 * settings - or found nothing to change - the person's own Codex files are made to match them. Where `refuse` runs in
 * this project, `~/.codex/hooks.json` holds exactly one agentwhy pair, tried first as Codex will run it, and
 * `~/.codex/config.toml` approves those two entries and nothing else - never a folder. The project's old copy comes
 * out. Only on a computer with `~/.codex`; with its own part of the plan and the same consent (AO8). A project's
 * remove keeps the computer-wide check; `--remove --codex` takes it out (AO7).
 */
export class CodexMirror implements SetupUseCase {
  readonly #dependencies: CodexMirrorDependencies;

  constructor(dependencies: CodexMirrorDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: SetupOptions): Promise<SetupResult> {
    // `init --codex` with nothing else named: Codex's part alone. A remove keeps its usual course first (AO7's "too").
    if (options.codex === true && !options.remove && nothingElse(options)) return (await this.#mirror(options)) ?? { outcome: 'unchanged', output: await this.#nothingFor() };

    const result = await this.#dependencies.setup.run(options);
    if (result.outcome !== 'written' && result.outcome !== 'unchanged') return result;
    const codex = await this.#mirror(options);
    if (codex === undefined) return result;
    const outcome: SetupOutcome = result.outcome === 'unchanged' && codex.outcome === 'written' ? 'written' : result.outcome;
    return { outcome, output: `${result.output}${result.output.endsWith('\n') || result.output === '' ? '' : '\n'}\n${codex.output}` };
  }

  /** The change to the person's Codex files and the project's old one; `undefined` where there is none to make. */
  async #mirror(options: SetupOptions): Promise<SetupResult | undefined> {
    if (!(await this.#dependencies.codexOnThisComputer())) {
      // AO8: nothing is written and the folder is never created. Said only where Codex was asked for by name.
      return options.codex === true ? refused(`there is no ~/${USER_HOOKS.directory} folder, so Codex is not used on this computer and nothing was written for it.`) : undefined;
    }
    const read = await this.#read();
    if (typeof read === 'string') return refused(read);

    const projectCleaned = read.project.kind === 'object' ? withoutOwnEntries(read.project.file) : undefined;
    const migrate = projectCleaned !== undefined && projectCleaned.removed > 0 ? projectCleaned.file : undefined;

    if (options.remove && options.codex === true) return this.#removal(options, read, migrate);
    if (!(await this.#refuseRunsHere())) {
      // Nothing for Codex to follow here. The computer-wide check stays for the other projects (AOD4): said on a remove.
      const userFile = read.user.kind === 'object' ? read.user.file : {};
      const stays = options.remove && codexRefuseIn(userFile) !== undefined
        ? `Codex: agentwhy's check in ${WHERE_USER} stays - other projects may block files with it, and it does nothing where none do. To take it out of Codex everywhere: agentwhy init --remove --codex`
        : '';
      if (migrate === undefined) return stays === '' ? undefined : { outcome: 'unchanged', output: `${stays}\n` };
      return this.#write(options, read, { project: migrate }, [`agentwhy's old entries come out of ${WHERE_PROJECT} in this project.`], [
        `Codex: agentwhy's old entries are out of ${WHERE_PROJECT}.`,
        ...(stays === '' ? [] : [stays]),
      ]);
    }
    return this.#install(options, read, migrate);
  }

  /** AO1-AO4, AO9, AO14: one approved pair in the person's file, tried first; the project's copy out. */
  async #install(options: SetupOptions, read: Read, migrate: JsonObject | undefined): Promise<SetupResult | undefined> {
    if (read.user.kind === 'broken' || read.user.kind === 'unreadable') {
      return refused(`${WHERE_USER} ${read.user.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so agentwhy's check was not written to it.`);
    }
    // AO16: Codex would load hooks from both files, and warn in every session.
    if (read.user.kind === 'absent' && tomlDefinesHooks(read.config)) {
      return refused(`${WHERE_CONFIG} defines Codex's hooks itself, so agentwhy did not create ${WHERE_USER} beside it - Codex would load both and warn about it. Adding agentwhy's check to ${WHERE_CONFIG} is not built.`);
    }
    const userFile = read.user.kind === 'object' ? read.user.file : {};
    const invoke = await this.#invocationFor(options, userFile);
    const refuse = codexRefuseCommand(invoke, undefined);
    const stop = codexStopCommand(invoke);
    const paired = withOwnPair(userFile, refuse, stop);
    const hooksChange = JSON.stringify(paired.file) !== JSON.stringify(userFile);
    const wanted = this.#approvalsOf(paired.file, read.userPath);
    if (wanted === undefined) return refused(`agentwhy's entries in ${WHERE_USER} hold something its approval was not measured over, so nothing was approved.`);
    const edit = (fresh: string): ConfigEdit => withOwnApprovals(fresh, read.userPath, wanted);
    const first = edit(read.config);
    if (first.kind === 'unsafe') return refused(`${WHERE_CONFIG}: ${first.reason}, so agentwhy wrote nothing there - a line added beside it could stop Codex from starting.`);
    const configChange = first.text !== read.config;
    if (!hooksChange && !configChange) {
      if (migrate === undefined) return undefined;
      return this.#write(options, read, { project: migrate }, [
        `And in Codex, agentwhy's old entries come out of ${WHERE_PROJECT} in this project: your own ${WHERE_USER} already runs the check, approved. Everything else in the file stays.`,
      ], [`Codex: agentwhy's old entries are out of ${WHERE_PROJECT}.`]);
    }

    // AO14: a new or changed command is tried before anything is written.
    if (hooksChange) {
      const failed = await this.#tryBoth(refuse, stop);
      if (failed !== undefined) return refused(`${failed} so nothing was written - every Codex command on this computer would have shown an error. Fix it, or name how to run agentwhy with --command, and run this again.`);
    }

    const plan = [
      'And in Codex, agentwhy will change your own Codex files, outside every project:',
      '',
      `  In ${WHERE_USER}`,
      `    ${'before a shell command'.padEnd(24)}${refuse}`,
      `    ${'when a reply ends'.padEnd(24)}${stop}`,
      `  In ${WHERE_CONFIG}`,
      `    approve those two entries - agentwhy's own and nothing else, and no folder is trusted`,
      ...(migrate === undefined ? [] : ['', `  agentwhy's old entries come out of ${WHERE_PROJECT} in this project: the check above replaces them.`]),
      ...(paired.stuck === 0 ? [] : ['', `  ${paired.stuck} more agentwhy ${paired.stuck === 1 ? 'entry shares' : 'entries share'} a group with another tool's in ${WHERE_USER} and ${paired.stuck === 1 ? 'stays' : 'stay'}: taking ${paired.stuck === 1 ? 'it' : 'them'} out would un-approve that tool. Take ${paired.stuck === 1 ? 'it' : 'them'} out by hand.`]),
      '',
      `  ${FROM_THE_FIRST_MESSAGE}`,
      `  ${COST}`,
      '',
      '  Everything else in these files stays. The hooks file is rewritten as two-space JSON.',
    ];
    const userLine = read.user.kind === 'absent' || codexRefuseIn(userFile) === undefined
      ? `Codex: agentwhy's check is in ${WHERE_USER}, approved in ${WHERE_CONFIG} - its own entries and nothing else. ${FROM_THE_FIRST_MESSAGE}`
      : hooksChange
        ? `Codex: agentwhy's check in ${WHERE_USER} changed, and agentwhy approved it again (${WHERE_CONFIG}).`
        : configChange
          ? `Codex: agentwhy's approval in ${WHERE_CONFIG} was brought up to date with ${WHERE_USER}.`
          : undefined;
    return this.#write(options, read, {
      ...(configChange ? { config: { before: read.config, edit } } : {}),
      ...(hooksChange ? { hooks: paired.file } : {}),
      ...(migrate === undefined ? {} : { project: migrate }),
    }, plan, [
      ...(userLine === undefined ? [] : [userLine]),
      ...(migrate === undefined ? [] : [`Codex: agentwhy's old entries are out of ${WHERE_PROJECT}.`]),
    ]);
  }

  /** AO7: `--remove --codex` - agentwhy's entries and their approvals out of the person's two files, and the project's copy. */
  async #removal(options: SetupOptions, read: Read, migrate: JsonObject | undefined): Promise<SetupResult | undefined> {
    if (read.user.kind === 'broken' || read.user.kind === 'unreadable') {
      return refused(`${WHERE_USER} ${read.user.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so agentwhy's check was not taken out of it.`);
    }
    const userFile = read.user.kind === 'object' ? read.user.file : {};
    const placed = agentwhyCodexEntries(userFile);
    const keys = new Set(placed.map((entry) => approvalKey(read.userPath, entry)));
    const hashes = new Set(placed.map((entry) => entryHash(entry)).filter((hash): hash is string => hash !== undefined));
    const cleaned = withoutOwnEntries(userFile);
    const edit = (fresh: string): ConfigEdit => withoutOwnApprovals(fresh, read.userPath, keys, hashes);
    const first = edit(read.config);
    if (first.kind === 'unsafe') return refused(`${WHERE_CONFIG}: ${first.reason}, so agentwhy took nothing out - take agentwhy's approval out of it by hand.`);
    const configChange = first.text !== read.config;
    if (cleaned.removed === 0 && !configChange && migrate === undefined) {
      return { outcome: 'unchanged', output: `Codex: agentwhy's check is not in ${WHERE_USER}, so there was nothing to take out.\n` };
    }
    const plan = [
      'And in Codex, agentwhy will change your own Codex files, outside every project:',
      '',
      '  Stop running',
      `    agentwhy's check before every shell command, and its Codex reply message`,
      `  Take its approvals out of ${WHERE_CONFIG}`,
      ...(migrate === undefined ? [] : [`  Take its old entries out of ${WHERE_PROJECT} in this project`]),
      '',
      '  Codex then no longer blocks anything for agentwhy, in any project on this computer.',
      '',
      '  Everything else in these files stays. The hooks file is rewritten as two-space JSON.',
    ];
    return this.#write(options, read, {
      ...(configChange ? { config: { before: read.config, edit } } : {}),
      ...(cleaned.removed > 0 ? { hooks: cleaned.file } : {}),
      ...(migrate === undefined ? {} : { project: migrate }),
    }, plan, [
      `Codex: agentwhy's check and its approvals are out of ${WHERE_USER} and ${WHERE_CONFIG}. Codex no longer blocks anything for agentwhy.`,
      ...(cleaned.stuck === 0 ? [] : [`Codex: ${cleaned.stuck} agentwhy ${cleaned.stuck === 1 ? 'entry shares' : 'entries share'} a group with another tool's in ${WHERE_USER} and stayed, so as not to un-approve that tool. Take ${cleaned.stuck === 1 ? 'it' : 'them'} out by hand.`]),
    ], 'removal');
  }

  /**
   * R7 and AO8, then every write in one order, so a failed one never leaves Codex worse off than it found it: on an
   * install the approvals go first, so Codex never sees an entry of agentwhy's unapproved; on a removal the entries go
   * first, for the same reason read backwards - approvals taken out from under entries that stay would make Codex ask
   * about agentwhy's check in every session. Each half says what holds when the other one has already been written.
   */
  async #write(
    options: SetupOptions,
    read: Read,
    writes: Writes,
    plan: readonly string[],
    done: readonly string[],
    direction: 'install' | 'removal' = 'install',
  ): Promise<SetupResult> {
    const consent = await this.#consent(options, plan);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;
    const removing = direction === 'removal';

    const config = async (): Promise<SetupResult | undefined> => {
      if (writes.config === undefined) return undefined;
      // What the other half has already done by the time this one runs, and so cannot be said to be untouched.
      const andHooks = removing && writes.hooks !== undefined ? `agentwhy's check is out of ${WHERE_USER}, but ` : '';
      const nothing = andHooks === '' ? 'nothing was written' : 'its approvals there could not be taken out - they name entries that are gone, so take them out by hand';
      // AO11: Codex writes this file too, at the start of a conversation (AOB3). Read again; recomputed once if it moved.
      const fresh = await this.#readText(read.configPath);
      if (fresh === undefined) return { outcome: 'unwritable', output: `${said}Codex: ${andHooks}${WHERE_CONFIG} could not be read again, so ${nothing}.\n` };
      const edit = fresh === writes.config.before ? writes.config.edit(writes.config.before) : writes.config.edit(fresh);
      if (edit.kind === 'unsafe') return { outcome: 'refused', output: `${said}Codex: ${andHooks}${WHERE_CONFIG}: ${edit.reason}, so ${nothing}.\n` };
      if (edit.text !== fresh && !(await this.#replace(read.configPath, edit.text))) {
        return {
          outcome: 'unwritable',
          output: `${said}Codex: ${andHooks}${WHERE_CONFIG} could not be written, so ${andHooks === '' ? 'nothing was changed for Codex' : nothing}.\n`,
        };
      }
      return undefined;
    };

    const hooks = async (): Promise<SetupResult | undefined> => {
      if (writes.hooks === undefined) return undefined;
      if (await this.#replace(read.userPath, `${JSON.stringify(writes.hooks, null, 2)}\n`)) return undefined;
      // On a removal this half runs first, so nothing else has been touched and the check stands as it did.
      const after = removing
        ? `Nothing was taken out: its approvals in ${WHERE_CONFIG} stay, so Codex still runs the approved check.`
        : `Its approval may be in ${WHERE_CONFIG} already; the next run puts both right.`;
      return { outcome: 'unwritable', output: `${said}Codex: ${WHERE_USER} could not be written. ${after}\n` };
    };

    for (const step of removing ? [hooks, config] : [config, hooks]) {
      const failed = await step();
      if (failed !== undefined) return failed;
    }
    if (writes.project !== undefined && !(await this.#replace(read.projectPath, `${JSON.stringify(writes.project, null, 2)}\n`))) {
      return { outcome: 'unwritable', output: `${said}Codex: ${WHERE_PROJECT} could not be written, so agentwhy's old entries are still in it.\n` };
    }
    return { outcome: 'written', output: `${said}${done.join('\n')}\n` };
  }

  /**
   * AO9: a new check runs the agentwhy doing this setup - `--command` where given. One already in the person's file
   * is kept as it is unless `--command` names one or the run is an update, so projects set up by different releases
   * do not rewrite each other's check on every write; `init --update` anywhere re-pins it (U7). Kept only where it
   * names agentwhy in plain words (J4).
   */
  async #invocationFor(options: SetupOptions, userFile: JsonObject): Promise<string> {
    if (options.invoke !== undefined) return options.invoke;
    const mine = await this.#dependencies.invocation.find();
    const existing = codexRefuseIn(userFile)?.replace(/\s+refuse\s+--codex(?:\s.*)?$/, '');
    // AO9, J4: `codexRefuseIn` knows agentwhy's entry by the words `refuse --codex` anywhere in its command, so
    // whatever stands before them was taken as the invocation - run by #tryBoth through a login shell before AO8's
    // consent, then written as agentwhy's own entry and approved, which opens Codex's own gate (CKB5) from outside.
    // The same test reads Claude Code's settings (`hook-entries.ts`); `--command` above is the person's own word.
    if (existing !== undefined && !isPlainInvocation(existing)) return mine;
    return existing === undefined || options.update === true ? mine : existing;
  }

  /** The approvals of agentwhy's pair as this file holds it: the first entry of each event, as `withOwnPair` keeps it. */
  #approvalsOf(file: JsonObject, userPath: string): ReadonlyArray<{ readonly key: string; readonly hash: string }> | undefined {
    const wanted: Array<{ key: string; hash: string }> = [];
    for (const entry of approvedCodexEntries(file)) {
      const hash = entryHash(entry);
      if (hash === undefined) return undefined;
      wanted.push({ key: approvalKey(userPath, entry), hash });
    }
    return wanted;
  }

  /** AO14: both commands, run once as Codex will, from a folder no project is above. The first failure, said; else none. */
  async #tryBoth(refuse: string, stop: string): Promise<string | undefined> {
    const trial = this.#dependencies.trial;
    if (trial === undefined) return 'agentwhy could not try the check before writing it,';
    const folder = this.#dependencies.trialFolder;
    const timeoutMs = USER_HOOKS.timeoutSeconds * 1000;
    const inputs = [
      [refuse, JSON.stringify({ cwd: folder, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'true' } })],
      [stop, JSON.stringify({ cwd: folder, hook_event_name: 'Stop', stop_hook_active: false })],
    ] as const;
    for (const [commandLine, input] of inputs) {
      const outcome = await trial.run({ commandLine, input, folder, timeoutMs });
      const failure = trialFailure(commandLine, outcome);
      if (failure !== undefined) return failure;
    }
    return undefined;
  }

  /** Whether Claude Code's `refuse` runs in this project after the setup: the local file first, as `init` reads them. */
  async #refuseRunsHere(): Promise<boolean> {
    const directory = join(this.#dependencies.workingDirectory, SETTINGS_FILES.directory);
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const read = await this.#readJson(join(directory, file));
      if (read.kind === 'object' && installedHooks(read.file).has('refuse')) return true;
    }
    return false;
  }

  async #read(): Promise<Read | string> {
    const userPath = join(this.#dependencies.home, USER_HOOKS.directory, USER_HOOKS.file);
    const configPath = join(this.#dependencies.home, USER_HOOKS.directory, USER_HOOKS.config);
    const projectPath = join(this.#dependencies.workingDirectory, PROJECT_HOOKS.directory, PROJECT_HOOKS.file);
    const config = await this.#readText(configPath);
    if (config === undefined) return `${WHERE_CONFIG} could not be read, so agentwhy did not touch Codex's approvals.`;
    return { userPath, configPath, projectPath, user: await this.#readJson(userPath), config, project: await this.#readJson(projectPath) };
  }

  /** R7, as `ProjectSetup` asks it: `--yes`, a person at a terminal, or the plan printed and nothing written. */
  async #consent(options: SetupOptions, plan: readonly string[]): Promise<'given' | 'asked' | SetupResult> {
    if (options.yes) return 'given';
    if (!this.#dependencies.interactive) {
      return { outcome: 'not-confirmed', output: `${plan.join('\n')}\n\nNothing was written for Codex. To write it: the same command with --yes\n` };
    }
    const chosen = await this.#dependencies.chooser.choose(`${plan.join('\n')}\n\nWrite it?`, [
      { label: 'Yes', detail: "write agentwhy's Codex files" },
      { label: 'No', detail: 'leave Codex as it is' },
    ]);
    return chosen === 0 ? 'asked' : { outcome: 'declined', output: 'Nothing was written for Codex.\n' };
  }

  /** What `init --codex` alone says where everything already matches, or there is nothing for it to follow. */
  async #nothingFor(): Promise<string> {
    if (!(await this.#refuseRunsHere())) {
      return "Codex: nothing to write. agentwhy blocks Codex where refuse runs, and refuse doesn't run here yet: agentwhy init --refuse --codex\n";
    }
    return `Codex: ${WHERE_USER} already runs agentwhy's check, approved. ${FROM_THE_FIRST_MESSAGE}\n`;
  }

  async #replace(path: string, text: string): Promise<boolean> {
    try {
      await this.#dependencies.files.replaceText(path, text);
      return true;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return false;
    }
  }

  async #readJson(path: string): Promise<ReadHooks> {
    let text: string;
    try {
      text = await this.#dependencies.files.readText(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { kind: error.failure === 'not-found' ? 'absent' : 'unreadable' };
    }
    const file = parseJsonObject(text);
    return file === undefined ? { kind: 'broken' } : { kind: 'object', file };
  }

  /** A file's text: the empty string where there is none yet, `undefined` where there is one and it cannot be read. */
  async #readText(path: string): Promise<string | undefined> {
    try {
      return await this.#dependencies.files.readText(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return error.failure === 'not-found' ? '' : undefined;
    }
  }
}

/** A run that wrote nothing, and why, said as `Codex: …`. */
function refused(why: string): SetupResult {
  return { outcome: 'refused', output: `Codex: ${why}\n` };
}

/** AO14: what a trial's failure is said as, or `undefined` where the command ran and exited 0. */
function trialFailure(commandLine: string, outcome: TrialOutcome): string | undefined {
  if (outcome.kind === 'ran' && outcome.exitCode === 0) return undefined;
  if (outcome.kind === 'ran') return `"${commandLine}" exited with code ${outcome.exitCode}${outcome.stderr === '' ? '' : ` (${outcome.stderr})`} when tried as Codex will run it,`;
  if (outcome.kind === 'timed-out') return `"${commandLine}" did not finish within ${USER_HOOKS.timeoutSeconds} seconds when tried as Codex will run it,`;
  if (outcome.kind === 'not-started') return `"${commandLine}" could not be started (${outcome.reason}),`;
  return 'agentwhy cannot try the check on this system the way Codex runs it, which was measured on macOS and Linux only,';
}

/** `--codex`, with or without `--remove`, and nothing else: no hook named, nothing to protect or take out, no update. */
function nothingElse(options: SetupOptions): boolean {
  return options.hooks === undefined && options.protect.length === 0 && (options.unprotect ?? []).length === 0 && options.update !== true;
}
