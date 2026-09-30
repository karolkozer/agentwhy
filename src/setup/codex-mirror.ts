import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { installedHooks, rulesReadByHooks, runningInvocation } from '../adapter/claude-code/settings/hook-entries.ts';
import { PROJECT_HOOKS } from '../adapter/codex/contract/hooks.ts';
import { codexRefuseCommand, codexRefuseIn, codexStopCommand, codexStopIn, withCodexRefuse, withoutCodexRefuse } from '../adapter/codex/settings/codex-hooks.ts';
import type { AgentwhyInvocation } from '../ports/agentwhy-invocation.ts';
import type { Chooser } from '../ports/chooser.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileWriter } from '../ports/file-writer.ts';
import { parseJsonObject, type JsonObject } from '../shared/json.ts';
import type { SetupOptions, SetupOutcome, SetupResult, SetupUseCase } from './project-setup.ts';

export interface CodexMirrorDependencies {
  /** The setup whose Claude Code settings this one follows: `ProjectSetup`, with the choosers of where it runs. */
  readonly setup: SetupUseCase;
  readonly files: FileReader & FileWriter & DirectoryReader;
  readonly chooser: Chooser;
  /** Both streams are terminals, so a person can be asked. */
  readonly interactive: boolean;
  readonly workingDirectory: string;
  readonly invocation: AgentwhyInvocation;
  /** Whether a Codex conversation is listed for this project (`codex-blocks-too` CK6). */
  readonly codexConversations: () => Promise<boolean>;
}

/** Where Codex's hook file is, as a person reads it. */
const WHERE = `${PROJECT_HOOKS.directory}/${PROJECT_HOOKS.file}`;

/** CK8: what holds until a person approves the hook in Codex, measured (CKB5) - said wherever the hook is written. */
const UNTIL_APPROVED =
  'Codex runs a new or changed hook only after you approve it in Codex: open Codex in this project and approve agentwhy\'s hook when it asks. Until then Codex skips it without a word, and does not block anything.';

/** What `.codex/hooks.json` holds as read: absent, an object, or a file this will not rewrite. */
type ReadHooks = { readonly kind: 'absent' } | { readonly kind: 'object'; readonly file: JsonObject } | { readonly kind: 'broken' | 'unreadable' };

/**
 * `codex-blocks-too` CK5-CK9: after the setup it wraps has written Claude Code's settings - or found nothing to change -
 * Codex's hook file is made to match them. agentwhy's Codex hook runs `refuse` with the invocation and the rules Claude
 * Code's `refuse` has, where either settings file runs `refuse`, and is not there where neither does. Only in a project
 * that uses Codex (CK6); with its own part of the plan and the same consent (CK7); and never approved on anyone's
 * behalf (CK8).
 */
export class CodexMirror implements SetupUseCase {
  readonly #dependencies: CodexMirrorDependencies;

  constructor(dependencies: CodexMirrorDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: SetupOptions): Promise<SetupResult> {
    // `init --codex` with nothing else named: Codex's hook alone, to match what Claude Code's settings already run.
    if (options.codex === true && onlyCodex(options)) return (await this.#mirror(options)) ?? { outcome: 'unchanged', output: nothingFor(await this.#running()) };

    const result = await this.#dependencies.setup.run(options);
    if (result.outcome !== 'written' && result.outcome !== 'unchanged') return result;
    const codex = await this.#mirror(options);
    if (codex === undefined) return result;
    const outcome: SetupOutcome = result.outcome === 'unchanged' && codex.outcome === 'written' ? 'written' : result.outcome;
    return { outcome, output: `${result.output}${result.output.endsWith('\n') || result.output === '' ? '' : '\n'}\n${codex.output}` };
  }

  /** The change to Codex's hook file, written with consent; `undefined` where there is none to make. */
  async #mirror(options: SetupOptions): Promise<SetupResult | undefined> {
    const running = await this.#running();
    const directory = join(this.#dependencies.workingDirectory, PROJECT_HOOKS.directory);
    const path = join(directory, PROJECT_HOOKS.file);
    const read = await this.#readJson(path);
    const current = read.kind === 'object' ? codexRefuseIn(read.file) : undefined;
    const currentStop = read.kind === 'object' ? codexStopIn(read.file) : undefined;

    if (running.kind === 'elsewhere') {
      return current === undefined && !(await this.#usesCodex(options, read)) ? undefined : { outcome: 'refused', output: `Codex: ${ELSEWHERE}\n` };
    }
    const invoke = running.kind === 'none' ? undefined : options.invoke ?? running.invoke ?? (await this.#dependencies.invocation.find());
    const wanted = invoke === undefined ? undefined : codexRefuseCommand(invoke, running.kind === 'refuse' ? running.settings : undefined);
    const stop = invoke === undefined ? undefined : codexStopCommand(invoke);
    if (wanted === current && stop === currentStop) return undefined;
    if (wanted !== undefined && !(await this.#usesCodex(options, read))) return undefined;
    if (read.kind === 'broken' || read.kind === 'unreadable') {
      return {
        outcome: 'refused',
        output: `Codex: ${WHERE} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so agentwhy's hook was not ${wanted === undefined ? 'taken out of it' : 'written to it'}.\n`,
      };
    }
    const before = read.kind === 'object' ? read.file : {};
    const next = wanted === undefined || stop === undefined ? withoutCodexRefuse(before).file : withCodexRefuse(before, wanted, stop);

    const plan = [
      `And in Codex, agentwhy will change ${WHERE}:`,
      '',
      ...(wanted === undefined
        ? ['  Stop running', '    agentwhy refuse and its Codex conversation message']
        : ['  Run automatically', `    ${'before a shell command'.padEnd(24)}${wanted}`, `    ${'when a reply ends'.padEnd(24)}${stop}`]),
      '',
      ...(wanted === undefined ? [] : [`  ${UNTIL_APPROVED}`, '']),
      '  Everything else in the file stays. It is rewritten as two-space JSON.',
    ];
    const consent = await this.#consent(options, plan);
    if (typeof consent !== 'string') return consent;
    const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;

    try {
      await this.#dependencies.files.ensureDirectory(directory);
      await this.#dependencies.files.writeText(path, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { outcome: 'unwritable', output: `${said}Codex: ${WHERE} could not be written, so Codex does not block anything yet.\n` };
    }
    // CK8: said once. Where the plan was printed above - `--yes`, a page - it already said what Codex needs.
    const until = said === '' ? ` ${UNTIL_APPROVED}` : '';
    return {
      outcome: 'written',
      output: `${said}${
        wanted === undefined
          ? `Codex: agentwhy's hook is out of ${WHERE}.\n`
          : current === undefined
            ? `Codex: agentwhy's hook is in ${WHERE}. It blocks the same files there, once approved.${until}\n`
            : `Codex: agentwhy's hook in ${WHERE} changed, so Codex asks you to approve it again.${until}\n`
      }`,
    };
  }

  /**
   * How Claude Code's `refuse` runs here, read from the files as they are after the setup: the local file first, as
   * `init` reads them. Its rules become Codex's (CK2), as a path in the project (CK3).
   */
  async #running(): Promise<Running> {
    const directory = join(this.#dependencies.workingDirectory, SETTINGS_FILES.directory);
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const read = await this.#readJson(join(directory, file));
      if (read.kind !== 'object' || !installedHooks(read.file).has('refuse')) continue;
      const rules = rulesReadByHooks(read.file).get('refuse') ?? 'default';
      const invoke = runningInvocation(read.file);
      if (rules === 'policy' || rules === 'other') return { kind: 'elsewhere' };
      return {
        kind: 'refuse',
        ...(invoke === undefined ? {} : { invoke }),
        ...(rules === 'default' ? {} : { settings: `${SETTINGS_FILES.directory}/${SETTINGS_FILES[rules]}` }),
      };
    }
    return { kind: 'none' };
  }

  /** CK6: a Codex conversation listed for the project, a `.codex` folder in it, or `init --codex`. */
  async #usesCodex(options: SetupOptions, read: ReadHooks): Promise<boolean> {
    if (options.codex === true || read.kind !== 'absent') return true;
    try {
      if ((await this.#dependencies.files.kindOf(join(this.#dependencies.workingDirectory, PROJECT_HOOKS.directory))) === 'directory') return true;
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }
    return this.#dependencies.codexConversations();
  }

  /** R7, as `ProjectSetup` asks it: `--yes`, a person at a terminal, or the plan printed and nothing written. */
  async #consent(options: SetupOptions, plan: readonly string[]): Promise<'given' | 'asked' | SetupResult> {
    if (options.yes) return 'given';
    if (!this.#dependencies.interactive) {
      return { outcome: 'not-confirmed', output: `${plan.join('\n')}\n\nNothing was written for Codex. To write it: the same command with --yes\n` };
    }
    const chosen = await this.#dependencies.chooser.choose(`${plan.join('\n')}\n\nWrite it?`, [
      { label: 'Yes', detail: `write ${WHERE}` },
      { label: 'No', detail: 'leave Codex as it is' },
    ]);
    return chosen === 0 ? 'asked' : { outcome: 'declined', output: `Nothing was written for Codex.\n` };
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
}

/** How Claude Code's `refuse` runs, as far as Codex's hook repeats it. */
type Running =
  | { readonly kind: 'none' }
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'refuse'; readonly invoke?: string; readonly settings?: string };

/** CK2: rules Codex's hook cannot be pointed at from the project - a policy file, or a settings file of another place. */
const ELSEWHERE =
  "agentwhy's hook was not written: refuse here reads a policy or a settings file outside the project's two, which a hook in the project cannot be pointed at. Run agentwhy init --refuse to point it at this project's rules.";

/** `init --codex` and nothing else: no hook named, nothing to protect or take out, no update. */
function onlyCodex(options: SetupOptions): boolean {
  return options.hooks === undefined && options.protect.length === 0 && !options.remove && (options.unprotect ?? []).length === 0 && options.update !== true;
}

/** What `init --codex` says where Codex's hook already matches, or there is nothing for it to follow. */
function nothingFor(running: Running): string {
  return running.kind === 'none'
    ? "Codex: nothing to write. agentwhy blocks Codex with the same hook it blocks Claude Code with, and refuse doesn't run here yet: agentwhy init --refuse --codex\n"
    : `Codex: ${WHERE} already runs agentwhy's hook. ${UNTIL_APPROVED}\n`;
}
