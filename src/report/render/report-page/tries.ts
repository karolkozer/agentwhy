// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { IDENTIFIER_NOT_SHOWN, OUTSIDE_THE_PROJECT } from '../../../core/project-root.ts';
import type { Redacted } from '../../../core/redaction/redacted.ts';
import type { AgentRuns, FileHow, RunFile, RunStep } from '../../report-model.ts';
import { HOW_RANK, RUN_FILES_KEPT } from '../../runs.ts';

/**
 * TA1 (`2026-11-17-tried-again-after-a-stop.md`): what makes a step a try at a file - it reached for the file itself. A
 * name a listing printed (`named`) is not: seeing a name is not reaching for the file.
 */
const TRIES: ReadonlySet<FileHow> = new Set<FileHow>(['read', 'changed', 'opened', 'unknown', 'stopped']);

/** How the tries after a first stop ended: stopped every time, or the strongest way one of them reached the file. */
export type TryEnd = Exclude<FileHow, 'named'>;

/** One line under a step: what the same AI did with a file after it was first stopped over it (TA2), or before (TA3). */
export type TryNote =
  | {
    /** TA2: on the first stop of a file - how many more tries, how they ended, and in how many ways (TAD4). */
    readonly kind: 'after';
    readonly path: Redacted;
    readonly more: number;
    readonly ended: TryEnd;
    readonly ways: number;
  }
  | {
    /** TA3: on a later try - how many earlier steps of this AI were stopped trying the file. */
    readonly kind: 'before';
    readonly path: Redacted;
    readonly stops: number;
  };

/**
 * SB12, SB14 as amended 2026-10-20: the files a stopped step was stopped for - the blocked ones a rule can have refused it
 * over, else every file it tried. A tracked file in the same call was not, and is drawn as a file the step only named.
 */
export function stoppedFor(step: RunStep): readonly RunFile[] {
  const stopped = step.files.filter((file) => file.how === 'stopped');
  const blocked = stopped.filter((file) => file.private === true && file.tracked !== true);
  return blocked.length > 0 ? blocked : stopped;
}

/**
 * TA1-TA6: the one line each step of one AI carries about a file it had been stopped over - its first stop says what came
 * after, a later try says how many stops came before. Within this AI's steps only (TA1): there is no order across AIs.
 */
export function triesAfterStops(agent: AgentRuns): ReadonlyMap<RunStep, TryNote> {
  const steps = agent.runs.flatMap((run) => run.steps);
  const firstStop = new Map<string, number>();
  steps.forEach((step, place) => {
    for (const file of stoppedFor(step)) if (namesOneFile(file.path) && !firstStop.has(file.path)) firstStop.set(file.path, place);
  });
  const firstStopOf = (path: string): number => firstStop.get(path) ?? Number.POSITIVE_INFINITY;

  const notes = new Map<RunStep, TryNote>();
  steps.forEach((step, place) => {
    // A stopped step speaks of the file its sentence names (SB14); another step of the first file that stopped it before.
    const lead = stoppedFor(step)[0];
    if (lead !== undefined && firstStop.get(lead.path) === place) {
      const after = afterNote(steps, place, lead, agent.stepsLeftOut !== undefined);
      if (after !== undefined) notes.set(step, after);
      return;
    }
    const file = lead ?? step.files.find((one) => TRIES.has(one.how) && firstStopOf(one.path) < place);
    if (file === undefined || firstStopOf(file.path) >= place) return;
    const earlier = steps.slice(0, place);
    // TA5: a stop a step's cap may have hidden would make the count too small.
    if (earlier.some((one) => mayHide(one, file))) return;
    notes.set(step, { kind: 'before', path: file.path, stops: earlier.filter((one) => triedAs(one, file.path) === 'stopped').length });
  });
  return notes;
}

/** TA2, TA5: the tries at a file after its first stop, unless a cut - of the AI's steps or a step's files - could hide one. */
function afterNote(steps: readonly RunStep[], place: number, file: RunFile, cut: boolean): TryNote | undefined {
  if (cut) return undefined;
  const following = steps.slice(place + 1);
  if (following.some((step) => mayHide(step, file))) return undefined;
  const later = following.flatMap((step) => {
    const how = triedAs(step, file.path);
    return how === undefined ? [] : [{ step, how }];
  });
  if (later.length === 0) return undefined;
  const ended = later.reduce<TryEnd>((best, one) => HOW_RANK[one.how] > HOW_RANK[best] ? one.how : best, 'stopped');
  const ways = new Set([steps[place] as RunStep, ...later.map((one) => one.step)].map((step) => step.did)).size;
  return { kind: 'after', path: file.path, more: later.length, ended, ways };
}

/** How a step tried a file, where it did (TA1). */
function triedAs(step: RunStep, path: string): TryEnd | undefined {
  const how = step.files.find((file) => file.path === path)?.how;
  return how === undefined || !TRIES.has(how) ? undefined : how as TryEnd;
}

/**
 * Whether a step's cap (SB4: `RUN_FILES_KEPT`, private files kept first) may have cut this file from it: the step left
 * files out, does not list this one, and kept room for it - any file, or for a private one only a step that kept
 * nothing but private files.
 */
function mayHide(step: RunStep, file: RunFile): boolean {
  if ((step.filesLeftOut ?? 0) === 0 || step.files.some((one) => one.path === file.path)) return false;
  return file.private !== true || (step.files.length >= RUN_FILES_KEPT && step.files.every((one) => one.private === true));
}

/**
 * A path that stands for one file. Under `--share` every path outside the project is written as one phrase, and an
 * identifier in a path as another (`Redactor.path`), so two files can share a path there and their tries cannot be told
 * apart.
 */
function namesOneFile(path: string): boolean {
  return path !== OUTSIDE_THE_PROJECT && !path.includes(IDENTIFIER_NOT_SHOWN);
}
