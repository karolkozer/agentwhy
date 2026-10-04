// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Browser } from '../../ports/browser.ts';
import type { BackgroundRun, PageProbe, PageServers } from '../../ports/page-server.ts';
import { quietlySaid } from './render/start-words.ts';
import type { StartOptions, StartResult, StartUseCase } from './session-start.ts';

/**
 * How long a server started in the background is waited for, at most, while its process runs (PF3): its first pages are
 * every conversation of the project, and a project with many takes a while. A process that ended is not waited for -
 * a sandbox, a port refused - and the pages are written as files at once.
 */
const WAIT_MS = 60_000;
const ASK_EVERY_MS = 250;

export interface DetachedStartDependencies {
  readonly servers: PageServers;
  readonly probe: PageProbe;
  readonly background: BackgroundRun;
  readonly browser: Browser;
  /** The project this run is for, as its running server is remembered under. */
  readonly project: string;
  /** The run that writes the pages as files, for where no server comes up (PF4). */
  readonly files: StartUseCase;
  readonly sleep: (ms: number) => Promise<void>;
  readonly clock: () => number;
}

/**
 * `start --detach` (`2026-10-02-a-page-not-a-file.md` PF3-PF5): the pages served, from a command that returns at once.
 * A server already running for this project is used - its address stays the one the person has open; else one is
 * started in the background and waited for; else, where none can start (a sandbox), the pages are written as files,
 * as `--no-serve` writes them, and that is said with what to do.
 */
export class DetachedStart implements StartUseCase {
  readonly #dependencies: DetachedStartDependencies;

  constructor(dependencies: DetachedStartDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: StartOptions): Promise<StartResult> {
    const { servers, probe, background, project, clock, sleep } = this.#dependencies;
    const known = await servers.read(project);
    if (known !== undefined && (await probe.answers(`${known.url}index.html`))) return this.#show(known.url, options, true);

    const pid = await background.start(backgroundArgs(options));
    if (pid !== undefined) {
      for (const deadline = clock() + WAIT_MS; clock() < deadline; await sleep(ASK_EVERY_MS)) {
        const started = await servers.read(project);
        if (started?.pid === pid && (await probe.answers(`${started.url}index.html`))) return this.#show(started.url, options, false);
        if (!background.running(pid)) break;
      }
    }
    return this.#asFiles(options);
  }

  /** The page asked for on a running server: the session's report where it serves one, else every conversation (SW10). */
  async #show(base: string, options: StartOptions, reused: boolean): Promise<StartResult> {
    const { probe, browser } = this.#dependencies;
    const asked = options.session === undefined ? undefined : `${base}${options.session}.html`;
    const found = asked === undefined || (await probe.answers(asked));
    const url = asked !== undefined && found ? asked : `${base}index.html`;
    const opened = options.open && (await browser.open(url));
    // A conversation asked for and not served is said in every output, never passed off as its report (SW10).
    const missing = found ? '' : 'That conversation was not found here, so all conversations are served.\n';
    // Not opened, a served page is still there to open: said as served, never as a file written.
    if (options.quiet === true) return { outcome: 'written', output: opened ? quietlySaid(url, true, found) : `${missing}Serving: ${url}\n` };
    return {
      outcome: 'written',
      output: missing +
        `${reused ? 'agentwhy was already running for this project' : 'agentwhy runs in the background for this project'}: ${url}\n` +
        'It stops by itself 30 minutes after its last page is closed.\n',
    };
  }

  /** PF4: no server came up - a sandbox, a refusal - so the pages are files, and what would serve them is said. */
  async #asFiles(options: StartOptions): Promise<StartResult> {
    const written = await this.#dependencies.files.run({ ...options, serve: false });
    return {
      ...written,
      output: 'agentwhy could not keep running in the background here, so the pages were written as files. To open them live, ' +
        'run this command again outside the sandbox, or type npx @agentwhy/cli in a terminal.\n' + written.output,
    };
  }
}

/** What the server in the background is started with: the same choices, served, opening nothing of its own. */
function backgroundArgs(options: StartOptions): string[] {
  return [
    'start', '--serve', '--no-open', '--since', options.since.asked,
    ...(options.out === undefined ? [] : ['--out', options.out]),
    ...(options.policyPath === undefined ? [] : ['--policy', options.policyPath]),
    ...(options.settingsPath === undefined ? [] : ['--settings', options.settingsPath]),
    ...(options.session === undefined ? [] : ['--session', options.session]),
  ];
}
