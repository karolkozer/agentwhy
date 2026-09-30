import type { CommandResult } from './cli-command.ts';

/** What a page is told when it asks for another project: the address of the run that shows it, or why none does. */
export type SwitchAnswer = { readonly url: string } | { readonly failed: string };

/** Where a page asked for another project: the onboarding's project step, or the window over any page (V16). */
export type SwitchFrom = 'step' | 'window';

/** A run this process has served: the token its pages were given, and the folder it was for. */
export interface PastRun {
  readonly token: string;
  readonly folder: string;
}

/** What one run is given: the way to start another project's run, and - where a switch started it - where to say its address. */
export interface SwitchSeams {
  readonly switchTo: (folder: string, since: string, from: SwitchFrom) => Promise<SwitchAnswer>;
  readonly handedOver?: (url: string) => void;
  /** Where the page that started this run asked from, which decides the page it opens at (V16). */
  readonly arrivedFrom?: SwitchFrom;
  /** Said by the run once it serves, with the token its pages carry: the pages of a run are known after it ends. */
  readonly served: (token: string) => void;
  /** Every run this process has served, this one included once it serves (V14, amended: a page of one still reaches the process). */
  readonly pastRuns: () => readonly PastRun[];
}

/** One command in one folder: the composition root built for it, and routed. */
export type RunIn = (workingDirectory: string, argv: readonly string[], seams: SwitchSeams) => Promise<CommandResult>;

/**
 * `agentwhy` in the folder it was typed in, and every project a page switches to after it, in this one process
 * (`.ai/specs/2026-09-27-which-project.md` V14, V18). A switch starts `start` for the chosen folder with the range the page
 * was drawn with; the page is answered with the new run's address once that run serves, and the run it came from ends.
 * A run that ends before it serves - nothing there to show, a folder that cannot be read - answers the page with what it
 * said, and nothing else changes. The terminal is given back when the last run shown has ended: Ctrl+C there stops it,
 * as it stopped the first.
 *
 * `write` is given each run's result as it ends; the last one's is returned for the shell to write and exit with.
 */
export async function runSwitching(runIn: RunIn, workingDirectory: string, argv: readonly string[], write: (result: CommandResult) => void): Promise<CommandResult> {
  const shown: Promise<CommandResult>[] = [];
  const past: PastRun[] = [];
  const seams = (folder: string, handedOver?: (url: string) => void, arrivedFrom?: SwitchFrom): SwitchSeams => ({
    switchTo: (folder, since, from) =>
      new Promise((resolve) => {
        let answered = false;
        const run = runIn(folder, ['start', '--since', since], seams(folder, (url) => {
          answered = true;
          shown.push(run);
          resolve({ url });
        }, from));
        run.then(
          (result) => {
            if (!answered) resolve({ failed: reasonOf(result) });
          },
          (error: unknown) => {
            if (!answered) resolve({ failed: error instanceof Error ? error.message : String(error) });
          },
        );
      }),
    ...(handedOver === undefined ? {} : { handedOver }),
    ...(arrivedFrom === undefined ? {} : { arrivedFrom }),
    served: (token) => { past.push({ token, folder }); },
    pastRuns: () => past,
  });

  let result = await runIn(workingDirectory, argv, seams(workingDirectory));
  for (let at = 0; at < shown.length; at += 1) {
    write(result);
    result = await (shown[at] as Promise<CommandResult>);
  }
  return result;
}

/** What a run that never served said, as one line a page can show. */
function reasonOf(result: CommandResult): string {
  const said = result.kind === 'completed' ? result.output : result.kind === 'hook-block' ? result.reason : result.kind === 'usage-error' ? result.message : result.usage;
  return said.trim().split('\n')[0] || 'agentwhy could not show that project.';
}
