import type { OnboardingStore } from '../../../ports/onboarding-store.ts';
import { patternsOf } from '../../../setup/protected-patterns.ts';
import type { NoticeChange } from '../../watch/notice-settings.ts';
import type { SettingsAnswer, SettingsChange } from '../serve/settings-request.ts';
import type { IndexSettings, SettingsFile } from '../session-index.ts';
import { settingsView } from '../settings/settings-view.ts';
import { onboardingChanges, type OnboardingChange, type OnboardingChoices } from './onboarding-changes.ts';
import { deniedIn, inForceOf, rowKey } from './onboarding-view.ts';

export interface FinishDependencies {
  /** The settings as the files hold them now - Settings' own reading, read again after every write (R60). */
  readonly settingsNow: () => Promise<IndexSettings>;
  /** One change to the project's settings, through the setup Settings writes with (`settingsChangeToSetup`, R58). */
  readonly settings: (change: SettingsChange) => Promise<SettingsAnswer>;
  /**
   * One switch of F57, through the route Settings' switch writes with (`modeChange`, which keeps the told lists). Absent
   * where this run keeps no told lists: nothing is then switched, and Done says so.
   */
  readonly mode?: (change: Extract<SettingsChange, { readonly change: 'mode' }>) => Promise<SettingsAnswer>;
  /** One change to what this person is told, through `NoticeSettings` (R26a). */
  readonly notify: (change: NoticeChange) => Promise<{ readonly written: boolean; readonly said: string }>;
  readonly store: OnboardingStore;
  /** The moment the record is written with. */
  readonly clock: () => number;
}

/** What became of one change of W15, in the words of whatever wrote it (R59). */
export interface FinishResult {
  readonly change: OnboardingChange['change'];
  readonly written: boolean;
  readonly message: string;
}

export type FinishAnswer =
  /** A name that cannot be written: nothing was written, and nothing recorded (W15, R46). */
  | { readonly outcome: 'refused'; readonly message: string }
  /**
   * Every change was tried, in order; `recorded` says whether the record was kept (W22, W26). `codex`, in a project that
   * uses Codex and blocks files in Claude Code after Finish, is whether Codex's hook runs too (W20a, `codex-blocks-too`
   * CK8): Done then says what Codex needs, or that it is not blocked yet.
   */
  | { readonly outcome: 'finished'; readonly results: readonly FinishResult[]; readonly recorded: boolean; readonly codex?: 'on' | 'off' };

/**
 * Finish (`.ai/specs/2026-09-24-onboarding.md` W14-W16, W22): the person's choices, written through the routes Settings
 * already uses - nothing here decides what a file holds - and then the record that the onboarding was finished.
 *
 * The changes are made from the files as they are now, not as they were when the page was drawn, so a choice made in
 * another tab since is never written over. Each change is tried whatever the one before answered, and the record is
 * written whatever they answered: a person who reached Done is not sent through the onboarding again for one failed
 * write, which Done names and Settings can make (W20).
 */
export async function finishOnboarding(dependencies: FinishDependencies, choices: OnboardingChoices): Promise<FinishAnswer> {
  // Refused whole, before anything runs: a request half written would leave a project set up in a way nobody chose.
  const refused = patternsOf([...choices.protect, ...choices.tell]).refused;
  if (refused.length > 0) {
    return { outcome: 'refused', message: refused.map(({ pattern, reason }) => `"${pattern}" was not written: ${reason}.`).join('\n') };
  }

  const changes = onboardingChanges(choices, inForceOf(await dependencies.settingsNow()));
  const results: FinishResult[] = [];
  // KD2: what goes onto the told list is not blocked by the add that comes before it.
  const telling = new Set(changes.flatMap((change) => (change.change === 'tell' ? change.patterns : [])));
  for (const change of changes) results.push(await written(dependencies, change, choices.scope, telling));
  const recorded = await dependencies.store.add(dependencies.clock());
  // W20a: read from the files as Finish left them - the writes above go through `CodexMirror`, which writes Codex's hook
  // with Claude Code's `refuse` - and said only where Claude Code's block runs, so a project that blocks nothing is not
  // told Codex isn't blocked.
  const after = (await dependencies.settingsNow()).hooks;
  const codex = after !== undefined && after.refuse !== false ? after.codex : undefined;
  return { outcome: 'finished', results, recorded, ...(codex === undefined ? {} : { codex }) };
}

async function written(dependencies: FinishDependencies, change: OnboardingChange, scope: SettingsFile, telling: ReadonlySet<string>): Promise<FinishResult> {
  try {
    if (change.change === 'watch') {
      // Installing where it is not also takes it out of the other file (R4g): the move of W15.1 is this same change.
      return fromSetup('watch', await dependencies.settings({ change: 'hooks', hooks: ['watch'], on: true, where: change.where }));
    }
    if (change.change === 'protect') {
      // W15.2: read again. The hook just installed can change which file the hooks read, and so where an add goes and
      // which built-in patterns go with it - Settings' add, decided from what the files hold now.
      const now = await dependencies.settingsNow();
      const view = settingsView(now);
      if (!view.canAdd) {
        return { change: 'protect', written: false, message: 'The files were not added: the hooks read rules this page cannot change.' };
      }
      // KD2: the rows left on Block, found by key, with the rules no file holds now. A file told about keeps no rule (F57).
      const rows = view.rows.filter((row) => row.mode === 'block' && change.rows.includes(rowKey(row)))
        .flatMap((row) => row.patterns.filter((pattern) => !deniedIn(now, pattern)));
      const told = new Set(view.rows.filter((row) => row.mode === 'tell').flatMap((row) => row.patterns));
      const patterns = [...new Set([...view.withBuiltIn, ...rows, ...change.patterns])].filter((pattern) => !told.has(pattern) && !telling.has(pattern));
      if (patterns.length === 0) return { change: 'protect', written: true, message: '' };
      return fromSetup('protect', await dependencies.settings({ change: 'adopt', patterns, where: view.addTo }));
    }
    if (change.change === 'search') {
      // W12a: what Settings' **Block searches too** writes - `refuse`, in the file step 1 chose (F38, as amended).
      return fromSetup('search', await dependencies.settings({ change: 'hooks', hooks: ['refuse'], on: true, where: change.where }));
    }
    if (change.change === 'mode' || change.change === 'tell') {
      if (dependencies.mode === undefined) {
        return { change: change.change, written: false, message: 'This run keeps no list of files to tell you about, so nothing was switched.' };
      }
      if (change.change === 'tell') {
        // A name added and switched to Tell me: onto the told list, and no rule is written for it.
        return fromMode('tell', await dependencies.mode({ change: 'mode', to: 'tell', patterns: change.patterns, rules: [], where: scope }));
      }
      // W12a: the row's switch as the files hold it now, never as the page sent it - Settings' own, found by the row's key.
      const row = settingsView(await dependencies.settingsNow()).rows.find((each) => rowKey(each) === change.key);
      const to = row?.switchTo;
      if (to === undefined || to.to !== change.to) {
        return { change: 'mode', written: false, message: 'This file can no longer be switched here. Settings shows it as it is now.' };
      }
      return fromMode('mode', await dependencies.mode({ change: 'mode', to: to.to, patterns: to.patterns, rules: to.rules, where: scope }));
    }
    const answer = await dependencies.notify({
      scope: 'project',
      choices: { ...(change.on === undefined ? {} : { on: change.on }), ...(change.clean === undefined ? {} : { clean: change.clean }) },
    });
    return { change: 'notices', written: answer.written, message: answer.said.trim() };
  } catch (error) {
    // One change that could not be made does not stop the next one, nor the record (W15, W22).
    return { change: change.change, written: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function fromSetup(change: 'watch' | 'protect' | 'search', answer: SettingsAnswer): FinishResult {
  return { change, written: answer.outcome === 'written' || answer.outcome === 'unchanged', message: answer.output.trim() };
}

function fromMode(change: 'mode' | 'tell', answer: SettingsAnswer): FinishResult {
  return { change, written: answer.outcome === 'written' || answer.outcome === 'unchanged', message: answer.output.trim() };
}
