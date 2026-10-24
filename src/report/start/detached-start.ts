// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Browser } from '../../ports/browser.ts';
import type { BackgroundRun, PageProbe, PageServerRecord, PageServers } from '../../ports/page-server.ts';
import { isOlder, plainVersion } from '../../shared/plain-version.ts';
import { printable } from '../../shared/printable.ts';
import { quietlySaid } from './render/start-words.ts';
import { DOOR } from './serve/index-handler.ts';
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
  /**
   * PF7: this agentwhy's own version, as its `package.json` names it - a running server is reused only where its record
   * names the same. Absent, or answering `undefined`: nothing to tell apart, and a running server is reused as before.
   */
  readonly version?: () => Promise<string | undefined>;
  readonly probe: PageProbe;
  readonly background: BackgroundRun;
  readonly browser: Browser;
  /** The project this run is for, as its running server is remembered under. */
  readonly project: string;
  /** The run that writes the pages as files, for where no server comes up (PF4). */
  readonly files: StartUseCase;
  readonly sleep: (ms: number) => Promise<void>;
  readonly clock: () => number;
  /**
   * AW1 of `2026-10-01-the-address-opens-the-welcome.md`, extended to `--detach` on 2026-10-04: the address this
   * command hands over names the page a person should meet, as the address a served run prints does. The decision is
   * asked for again here, and never taken from the server's record: the project may have been set up since it started.
   * Absent where nothing can serve the onboarding - then the index, as before.
   */
  readonly welcome?: {
    /** The onboarding's file, served beside the index by every served run (W25). */
    readonly file: string;
    /** The project's name, for the sentence that says what the address opens (AWD3). */
    readonly project: string;
    /** Whether W23 holds here, now. Its own silent record is written as a served run writes it (N6). */
    readonly opens: () => Promise<boolean>;
  };
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
    // PF7: a server of another agentwhy - an older release still serving after an update - is passed over as one that
    // does not answer: one of this version is started, and the older one stops by itself, leaving the newer record (PF2).
    if (known !== undefined && (await this.#thisVersion(known)) && (await probe.answers(`${known.url}index.html`))) {
      return this.#show(known.url, options, true);
    }

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

  /**
   * PF7 as amended, PFD5: whether a record's server is this agentwhy's or newer - its version named, and the same or a
   * later release. A newer one is handed over, never passed by: an older `--detach` - a hook pinned to an earlier
   * release - starting an older server beside it would hand over older pages and take the record. A version that is no
   * release (`0.0.0-dev`) is reused only where it is the same. With no version of its own, any is.
   */
  async #thisVersion(record: PageServerRecord): Promise<boolean> {
    const own = await this.#dependencies.version?.();
    if (own === undefined || record.version === own) return true;
    if (record.version === undefined) return false;
    return plainVersion(own) !== undefined && plainVersion(record.version) !== undefined && isOlder(own, record.version);
  }

  /**
   * The page asked for on a running server: the session's report where it serves one (SW10), else the welcome where
   * this project is to meet it (AW1), else every conversation.
   */
  async #show(base: string, options: StartOptions, reused: boolean): Promise<StartResult> {
    const { probe, browser } = this.#dependencies;
    const asked = options.session === undefined ? undefined : `${base}${options.session}.html`;
    const found = asked === undefined || (await probe.answers(asked));
    const welcome = await this.#welcome(asked, options.setupFirst === true);
    const url = welcome !== undefined ? await this.#welcomeAt(base, welcome.file, options.session) : asked !== undefined && found ? asked : `${base}index.html`;
    const opened = options.open && (await browser.open(url));
    // A conversation asked for and not served is said in every output, never passed off as its report (SW10).
    // Where the setup is opened in its place (AP7), the conversation is not what the address was for, found or not.
    const accounted = found || welcome !== undefined;
    const missing = accounted ? '' : 'That conversation was not found here, so all conversations are served.\n';
    // Not opened, a served page is still there to open: said as served, never as a file written.
    if (options.quiet === true) return { outcome: 'written', output: opened ? quietlySaid(url, true, accounted) : `${missing}Serving: ${url}\n` };
    return {
      outcome: 'written',
      output: missing +
        `${reused ? 'agentwhy was already running for this project' : 'agentwhy runs in the background for this project'}: ${url}\n` +
        // AWD3's sentence, in the words a served run already prints: true whether or not anyone opens the address.
        (welcome === undefined
          ? ''
          : `${opened ? 'Opened' : 'That address opens'} the welcome page, to set agentwhy up for ${printable(welcome.project)}.\n`) +
        'It stops by itself 30 minutes after its last page is closed.\n',
    };
  }

  /**
   * AW1: the onboarding's file where this run's address is to name it. A conversation asked for is the person's own
   * yes to that report and wins over a setup they did not ask for, as a served run's own page does (SW10).
   */
  async #welcome(asked: string | undefined, setupFirst: boolean): Promise<{ readonly file: string; readonly project: string } | undefined> {
    const { welcome } = this.#dependencies;
    // `2026-10-15-agentwhy-as-a-plugin.md` AP7: with `--setup-first` the setup wins over the conversation asked for.
    if ((asked !== undefined && !setupFirst) || welcome === undefined || !(await welcome.opens())) return undefined;
    return { file: welcome.file, project: welcome.project };
  }

  /**
   * AP19: the onboarding's address names the door, which the server answers at every visit with the page W23 chooses then
   * - the conversation named, once the setup is finished. A server an older agentwhy started has no door and answers it
   * 404, so there the onboarding's own address is handed over, as before.
   */
  async #welcomeAt(base: string, file: string, session: string | undefined): Promise<string> {
    const door = `${base}${DOOR}${session === undefined ? '' : `/${session}`}`;
    return (await this.#dependencies.probe.answers(door, 'counts')) ? door : `${base}${file}`;
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
    // AP13: the plugin's server says where the plugin is updated, as the run that started it would.
    ...(options.plugin === true ? ['--plugin'] : []),
  ];
}
