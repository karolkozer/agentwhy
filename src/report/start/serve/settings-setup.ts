// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SetupOptions, SetupUseCase } from '../../../setup/project-setup.ts';
import { patternsOf } from '../../../setup/protected-patterns.ts';
import type { SettingsAnswer, SettingsChange, SettingsFile } from './settings-request.ts';

/** What F57's switch writes besides the settings files: agentwhy's own told lists (`private-files/tell-lists.ts`). */
export interface ToldListWriter {
  change(file: SettingsFile, add: readonly string[], remove: readonly string[]): Promise<boolean>;
}

/**
 * One change from the served Settings view, as the `SetupOptions` the equivalent `init` flags would build
 * (`worth-running-every-day` R58). Nothing new decides what is written: this only chooses the flags, and the
 * setup a terminal runs does the rest.
 *
 * `yes` is given because the page's own confirm step (R56) is the consent R7 asks for, off a terminal; the setup
 * is built with `interactive: false`, so no question is ever opened.
 */
export async function settingsChangeToSetup(setup: SetupUseCase, change: SettingsChange): Promise<SettingsAnswer> {
  // A pattern `init` would not write is refused here, before anything runs (R46, R59). `init` itself only says "Not
  // written" and goes on with the rest - an answer that reads as success, and a page that reloads on success would
  // show the list unchanged with no reason at all.
  const refused = patternsOf(patternsIn(change)).refused;
  if (refused.length > 0) {
    return { outcome: 'refused', output: refused.map(({ pattern, reason }) => `"${pattern}" was not written: ${reason}.`).join('\n') };
  }
  // U7: `init --update`, the same run a terminal makes; the setup reads both files and the version itself.
  if (change.change === 'update') {
    const result = await setup.run({ ...base(undefined), update: true });
    return { outcome: result.outcome, output: result.output };
  }
  // CK5: `init --codex`; the setup reads what Claude Code's `refuse` runs, and writes Codex's to match.
  if (change.change === 'codex') {
    const result = await setup.run({ ...base(undefined), codex: true });
    return { outcome: result.outcome, output: result.output };
  }
  if (change.change === 'adopt') {
    // One run: `init --protect … --refuse`, keeping every other hook as it runs. A private file is kept from the
    // agent's searches as well as from being opened (F38, amended 2026-09-24): `refuse` is what stops a `grep -r`
    // that the deny rule never sees, and it is installed with the rules rather than asked for on a tab of its own.
    const result = await setup.run({ ...base(change.where), hooks: ['refuse'], keep: true, protect: [...change.patterns] });
    return { outcome: result.outcome, output: result.output };
  }
  if (change.change === 'scope') return scope(setup, change);
  if (change.change === 'uninstall') return uninstall(setup, change);
  if (change.change === 'mode') return { outcome: 'refused', output: 'This page cannot change what is told: agentwhy has no told lists to write here.' };
  if (change.change === 'move') return move(setup, change);
  if (change.change === 'edit') return edit(setup, change.from, change.pattern, change.where);
  // An add is what the Add window confirmed: "your AI won't be able to open it or search through it" (F38).
  const result = await setup.run(change.change === 'protect' ? { ...optionsFor(change), hooks: ['refuse'], keep: true } : optionsFor(change));
  return { outcome: result.outcome, output: result.output };
}

/**
 * Changing a pattern: the old rule out, then the new one in. `init` has no flag that rewrites a rule in place, so
 * this is the two runs a terminal would do, in that order. The first failing stops the second, so a change that
 * cannot take the old rule out never leaves both patterns protected; the page then says what went wrong and the
 * file is as it was.
 */
async function edit(setup: SetupUseCase, from: string, pattern: string, where?: SettingsFile): Promise<SettingsAnswer> {
  const out = await setup.run(optionsFor({ change: 'unprotect', pattern: from, ...(where === undefined ? {} : { where }) }));
  if (out.outcome !== 'written' && out.outcome !== 'unchanged') return { outcome: out.outcome, output: out.output };
  // The new rule goes back into the file the old one came out of, so changing a rule never moves it between the
  // file that is this machine's and the one the project shares.
  const back = await setup.run(optionsFor({ change: 'protect', pattern, ...(where === undefined ? {} : { where }) }));
  return { outcome: back.outcome, output: [out.output.trim(), back.output.trim()].filter((line) => line !== '').join('\n') };
}

/**
 * The same rule, in the other file: the deny rule out of the file that holds it, then in to the other, in that
 * order, because nothing removes a deny rule except `--remove --unprotect`. The first failing stops the second,
 * so a move that cannot take the old rule out never leaves the same rule in both files.
 */
async function move(setup: SetupUseCase, change: Extract<SettingsChange, { readonly change: 'move' }>): Promise<SettingsAnswer> {
  const out = await setup.run(optionsFor({ change: 'unprotect', pattern: change.pattern, where: change.from }));
  if (out.outcome !== 'written' && out.outcome !== 'unchanged') return { outcome: out.outcome, output: out.output };
  const back = await setup.run(optionsFor({ change: 'protect', pattern: change.pattern, where: change.where }));
  return { outcome: back.outcome, output: [out.output.trim(), back.output.trim()].filter((line) => line !== '').join('\n') };
}

/**
 * General (F56): the rules first, each moved as `move` moves one, then the hooks, installed in the file they are to run
 * from - which takes them out of the other (R4g) and points them at the rules now there. The first failure stops the
 * rest and is said: what was moved before it stays moved, and every rule is in one file or the other, never neither.
 */
async function scope(setup: SetupUseCase, change: Extract<SettingsChange, { readonly change: 'scope' }>): Promise<SettingsAnswer> {
  const from: SettingsFile = change.where === 'shared' ? 'local' : 'shared';
  const said: string[] = [];
  for (const pattern of change.patterns) {
    const moved = await move(setup, { change: 'move', pattern, from, where: change.where });
    said.push(moved.output.trim());
    if (moved.outcome !== 'written' && moved.outcome !== 'unchanged') return { outcome: moved.outcome, output: said.filter(Boolean).join('\n') };
  }
  if (change.hooks.length > 0) {
    const hooks = await setup.run({ ...base(change.where), hooks: change.hooks, keep: true });
    said.push(hooks.output.trim());
    if (hooks.outcome !== 'written' && hooks.outcome !== 'unchanged') return { outcome: hooks.outcome, output: said.filter(Boolean).join('\n') };
  }
  return { outcome: said.length === 0 ? 'unchanged' : 'written', output: said.filter(Boolean).join('\n') };
}

/**
 * F59: `init --remove --watch --refuse --unprotect …` for each file the page named, the local one first. The first
 * failure stops the rest and is said: a file already done stays done, and the page, read again, shows what is left.
 */
async function uninstall(setup: SetupUseCase, change: Extract<SettingsChange, { readonly change: 'uninstall' }>): Promise<SettingsAnswer> {
  const said: string[] = [];
  let written = false;
  for (const file of ['local', 'shared'] as const) {
    const rules = change.rules[file];
    if (rules === undefined) continue;
    const out = await setup.run({ ...base(file), remove: true, hooks: ['watch', 'refuse'], unprotect: [...rules] });
    said.push(out.output.trim());
    if (out.outcome !== 'written' && out.outcome !== 'unchanged') return { outcome: out.outcome, output: said.filter(Boolean).join('\n') };
    written ||= out.outcome === 'written';
  }
  // AO17, ticked: agentwhy's check and its approvals out of the person's own Codex files too, after the project's part.
  // `hooks: []` is the empty set, not silence: this run is Codex's alone, and the files the window named were already
  // done above. Naming the two hooks here would take them out of the local file as well, which no tick asked for.
  if (change.codex === true) {
    const out = await setup.run({ protect: [], remove: true, yes: true, codex: true, hooks: [] });
    said.push(out.output.trim());
    if (out.outcome !== 'written' && out.outcome !== 'unchanged') return { outcome: out.outcome, output: said.filter(Boolean).join('\n') };
    written ||= out.outcome === 'written';
  }
  return { outcome: written ? 'written' : 'unchanged', output: said.filter(Boolean).join('\n') };
}

/**
 * Whether a change only takes something out: the one change the setup makes where no project is (`which-project.md`
 * V8), since what an earlier agentwhy wrote there has to be removable. Every other change writes something, and an edit,
 * a move, General's scope and a switch to Block or Tell me take something out first - refused only at the step that
 * writes, each left the file neither protected nor told. Found by a review.
 */
export function onlyTakesOut(change: SettingsChange): boolean {
  return change.change === 'uninstall' || change.change === 'unprotect' || (change.change === 'hooks' && !change.on);
}

/** The patterns a change writes: the ones it protects, and what an edited rule becomes. */
function patternsIn(change: SettingsChange): readonly string[] {
  if (change.change === 'adopt' || change.change === 'scope' || change.change === 'mode') return change.patterns;
  if (change.change === 'protect' || change.change === 'edit') return [change.pattern];
  return [];
}

/** What every change here has in common: it writes one named file, and the page's confirm step is the consent. */
function base(where: SettingsFile | undefined): Omit<SetupOptions, 'hooks'> {
  // Where the change says nothing, it is the file `init` writes when `--shared` is not given: this page's own
  // default, and the one a pattern typed into the add field goes to. No `invoke`: the setup settles the command a
  // hook runs, for this page as for `init` (`a-hook-runs-what-you-ran.md` J1).
  return { protect: [], remove: false, yes: true, target: where ?? 'local' };
}

function optionsFor(change: Exclude<SettingsChange, { readonly change: 'edit' | 'move' | 'adopt' | 'scope' | 'mode' | 'uninstall' | 'update' | 'codex' }>): SetupOptions {
  const base_ = base(change.where);
  if (change.change === 'hooks') {
    // On installs the hook named and leaves the other as the file has it (`keep`: `init --watch` alone would take a
    // running `refuse` out, R4b); `init --remove --watch` takes out that one hook and leaves every deny rule. Turning
    // a switch on or off is one of those two and nothing else.
    return change.on
      ? { ...base_, hooks: change.hooks, keep: true }
      : { ...base_, remove: true, hooks: change.hooks };
  }
  // Both name no hook, so both name the empty set of them. Left unsaid, `init` off a terminal installs `watch`
  // and `--remove` takes every hook out - neither of which the confirm step offered, and R41 says a change
  // touches only what it names. An add names `refuse` itself, in `settingsChangeToSetup`; an edit or a move of a rule
  // that is already there does not: it stays the block it was, and where that was not whole, its row says so and
  // **Finish blocking** closes it (`block-means-blocked` K3, K7).
  return change.change === 'protect'
    ? { ...base_, hooks: [], protect: [change.pattern] }
    : { ...base_, remove: true, hooks: [], unprotect: [change.pattern] };
}

/**
 * F57's switch, where the told lists can be written. To `tell`: every deny rule named comes out of both files - a rule
 * left in either would still stop the agent - then the patterns go on the list General points at. To `block`: the
 * patterns come off both lists first, then are protected as an add is, `refuse` with them. The first failure stops the
 * rest and is said; a file is never left both off the rules and off the lists.
 */
export async function modeChange(
  setup: SetupUseCase,
  lists: ToldListWriter,
  change: Extract<SettingsChange, { readonly change: 'mode' }>,
): Promise<SettingsAnswer> {
  const refused = patternsOf(change.patterns).refused;
  if (refused.length > 0) return { outcome: 'refused', output: refused.map(({ pattern, reason }) => `"${pattern}" was not written: ${reason}.`).join('\n') };
  const said: string[] = [];
  const failed = (outcome: SettingsAnswer['outcome']): boolean => outcome !== 'written' && outcome !== 'unchanged';

  if (change.to === 'tell') {
    for (const file of ['local', 'shared'] as const) {
      if (change.rules.length === 0) break;
      const out = await setup.run({ ...base(file), remove: true, hooks: [], unprotect: [...change.rules] });
      said.push(out.output.trim());
      if (failed(out.outcome)) return { outcome: out.outcome, output: said.filter(Boolean).join('\n') };
    }
    if (!(await lists.change(change.where, change.patterns, []))) return { outcome: 'unwritable', output: 'The list of files to tell you about could not be written.' };
    return { outcome: 'written', output: said.filter(Boolean).join('\n') };
  }

  for (const file of ['local', 'shared'] as const) {
    if (!(await lists.change(file, [], change.patterns))) return { outcome: 'unwritable', output: 'The list of files to tell you about could not be written.' };
  }
  if (change.to === 'none') return { outcome: 'written', output: '' };
  const back = await setup.run({ ...base(change.where), hooks: ['refuse'], keep: true, protect: [...change.patterns] });
  return { outcome: back.outcome, output: back.output };
}
