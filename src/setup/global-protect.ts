// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { GlobalProtection, GlobalSetup, GlobalSetupOptions } from './global-setup.ts';
import type { SetupOutcome, SetupResult, SetupUseCase } from './project-setup.ts';

export interface GlobalProtectDependencies {
  /** The writer of the person's computer-wide rules (`GlobalSetup`), and whether its file holds one now. */
  readonly global: GlobalProtection & Pick<GlobalSetup, 'holds' | 'alertsOn' | 'alerts'>;
  /**
   * The Codex half: a `CodexMirror` built for the computer-wide path - its rules to follow are the global file's, and it
   * moves no project's entries (`refuseRuns`, `migrate: false`). Run on its own, as `init --codex` runs it.
   */
  readonly codex: SetupUseCase;
  /** Whether Codex is used on this computer: its `~/.codex` folder exists (CK6, AO8). */
  readonly codexOnThisComputer: () => Promise<boolean>;
}

/**
 * `2026-10-05-protected-everywhere.md` G17: a computer-wide rule reaches Codex only through agentwhy's own check in
 * `~/.codex/hooks.json`, and nothing installed that check on a computer where no project was set up - so the rules
 * `agentwhy protect` wrote held in Claude Code and were never seen by Codex. After the rules are written, the check is
 * installed by `CodexMirror`'s own route, tried first and approved, with its own plan and consent (AO1-AO16): this
 * adds the step, and reuses every safeguard of the one `init` already takes.
 *
 * A removal leaves the check where it is. It does nothing where no rule is, and other projects may block files with it
 * (AOD4); `agentwhy init --remove --codex` takes it out of Codex everywhere, as before.
 */
/**
 * `protected-everywhere` GD10, decided 2026-10-07: the computer's rules stay in Claude Code's own file, which Claude Code
 * enforces by itself (GB10) - a file of agentwhy's own would be enforced by agentwhy's check alone. A person who uses
 * Codex is told why a file of another tool holds them, wherever its path is named. A computer without Codex is not.
 */
const KEPT_FOR_CODEX = 'These rules are kept in Claude Code\'s settings even if you use only Codex: Claude Code applies them by itself, and Codex, which has no rules of its own, follows them through agentwhy\'s check.';

export class GlobalProtect implements GlobalProtection {
  readonly #dependencies: GlobalProtectDependencies;

  constructor(dependencies: GlobalProtectDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: GlobalSetupOptions): Promise<SetupResult> {
    const result = await this.#dependencies.global.run(options);
    if (options.remove || (result.outcome !== 'written' && result.outcome !== 'unchanged')) return result;
    // A computer with no Codex is not told about Codex, and one whose rules name nothing has nothing for it to follow.
    if (!(await this.#dependencies.codexOnThisComputer()) || !(await this.#dependencies.global.holds())) return result;

    const codex = await this.#dependencies.codex.run({ codex: true, protect: [], remove: false, yes: options.yes });
    // As `CodexMirror.run` joins its two halves: written if either wrote, the rules' outcome otherwise.
    const outcome: SetupOutcome = result.outcome === 'unchanged' && codex.outcome === 'written' ? 'written' : result.outcome;
    const joint = result.output === '' || result.output.endsWith('\n') ? '' : '\n';
    return { outcome, output: `${result.output}${joint}\n${codex.output}${codex.output.endsWith('\n') ? '' : '\n'}${KEPT_FOR_CODEX}\n` };
  }

  /** What this computer protects - and, where Codex is used, why the file that holds it is Claude Code's (GD10). */
  async list(): Promise<SetupResult> {
    const listed = await this.#dependencies.global.list();
    if (!(await this.#dependencies.codexOnThisComputer()) || !(await this.#dependencies.global.holds())) return listed;
    return { ...listed, output: `${listed.output}  ${KEPT_FOR_CODEX}\n\n` };
  }

  /** GD23: the computer's alerts, read as the global file holds them. Codex needs nothing written for them (CX9). */
  alertsOn(): Promise<boolean | 'unreadable'> {
    return this.#dependencies.global.alertsOn();
  }

  /** GD23: the computer's alerts turned on or off - the global file's one hook, and nothing of Codex's. */
  alerts(on: boolean, options: Pick<GlobalSetupOptions, 'yes'>): Promise<SetupResult> {
    return this.#dependencies.global.alerts(on, options);
  }
}
