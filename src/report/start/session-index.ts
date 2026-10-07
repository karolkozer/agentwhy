// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { GapReasons } from '../gap-reasons.ts';
import type { Provider } from '../../core/session-format.ts';
import type { EntryPoint } from '../../core/entry-point.ts';
import type { FolderState } from '../../core/project-catalogue.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import type { AlertThreshold } from '../watch/agent-alert.ts';
import type { CleanMode, NoticeChannel, SaidAs } from '../watch/notice-choices.ts';
import type { RulesRead } from '../../adapter/claude-code/settings/hook-entries.ts';
import type { Behind } from '../../setup/behind.ts';
import type { FoundDefault } from '../../setup/global-defaults.ts';
import type { Tally } from '../report-model.ts';
import type { IndexCheck, RowProject } from '../check/check-lines.ts';
import type { ComputerScope } from '../../ports/computer-view.ts';
import type { SessionStories } from '../render/report-page/file-story.ts';

/**
 * One protected file this session touched, and what became of it - the same four the row's own badge climbs.
 * The page is given what it renders and not the whole of `SessionActions`: a path, and one word about it.
 */
export interface IndexFile {
  readonly path: Redacted;
  /** `told`: a file the person let the agent read and asked to be told about (F57) - listed, and asking for nothing. */
  readonly kind: 'seen' | 'named' | 'result' | 'unknown' | 'told';
}

/**
 * What the run was read under, for the Settings view: the rules in force and where they came from, plus where the
 * run put its answer. It mirrors `core/policy/policy.ts` rather than carrying a Policy, because this model is what
 * a page is rendered from - a renderer holding the policy itself would in time read more of it than a page should
 * say (`specs/2026-09-18-the-rules-this-run-read.md`).
 */
export interface IndexSettings {
  readonly level: 'no-read' | 'no-disclose';
  /** Every pattern, not how many: a reader checks whether their own file is covered by reading the list. */
  readonly protected: readonly string[];
  readonly allowed: readonly string[];
  readonly origin:
    | { readonly kind: 'file'; readonly path: string }
    | { readonly kind: 'settings'; readonly path: string; readonly used: number; readonly ignored: number }
    | { readonly kind: 'default' };
  /** Where the reports were written. Absent on a shared page: it names the machine. */
  readonly out?: string;
  /**
   * What the project's own settings file runs now, so Settings can show a switch in the state the file is in
   * rather than the state a click hoped for (`worth-running-every-day` R60). Absent on a shared page, and where
   * the file could not be read - a switch is never drawn from a guess.
   */
  readonly hooks?: IndexHooks;
  /**
   * Of the protected patterns above, the ones written as deny rules in a settings file of this project, and which
   * of the two holds each: `local` is the file that is this machine's alone, `shared` the one that is committed
   * and that everyone who clones the project gets. Those are the ones Settings can change, because `init` writes
   * both - `--shared` names the second. The rest are the built-in list or a policy file, and neither is a rule
   * `init` wrote. Absent wherever `hooks` is.
   */
  readonly mine?: Readonly<Record<string, IndexRule>>;
  /**
   * Every pattern each of the two files denies, whole rules and halves alike. `mine` names one file per pattern; a
   * pattern both files deny is in both lists here, which is what "does the file the hooks read hold it?" needs.
   * Absent wherever `mine` is.
   */
  readonly held?: Readonly<Record<SettingsFile, readonly string[]>>;
  /**
   * What this person chose to be told when a turn ends, and which answer is doing the deciding
   * (`the-agent-tells-you.md` R26). Absent on a shared page, which names no machine and offers no choices, and
   * absent where this run has no preferences file to read.
   */
  readonly notices?: IndexNotices;
  /**
   * The files a person asked only to be told about (F57), by the list that holds them - `local` this person's own,
   * `shared` the project's - or `unreadable` where a list is there and could not be read. Absent where this run has no
   * such lists to read, and on a shared page.
   */
  readonly told?: Readonly<Record<SettingsFile, readonly string[] | 'unreadable'>>;
}

/** The Notifications panel's state: what holds now, and what each of the two levels of answer says. */
export interface IndexNotices {
  readonly on: AlertThreshold;
  readonly clean: CleanMode;
  readonly say: SaidAs;
  readonly notify: readonly NoticeChannel[];
  /** Which level answered each, so the panel can say whose answer it is showing. */
  readonly from: Readonly<Record<'on' | 'clean' | 'say' | 'notify', 'project' | 'everywhere' | 'default'>>;
  /** Where the answers are kept, said once under the panel: it is a file outside every project. */
  readonly path: string;
  /** The file is there and could not be read (R24), so nothing shown is an answer anybody gave. */
  readonly unusable: boolean;
}

/** Which of the project's two settings files a rule or a hook is in, and which one a change to it writes. */
export type SettingsFile = 'local' | 'shared';

/**
 * One deny rule of the project's, as both things it is. A rule is written `Read(./.env*)` while the policy lists
 * what it protects anchored at any depth, with a doubled-star prefix, because a transcript records the path a
 * tool was given and the two have to be comparable. `--unprotect` matches a rule by the exact string the file
 * holds, so a page that kept only the pattern could name a rule it could not then take out - which is what it
 * did: the list was joined on the two different spellings, nothing ever matched, and no row carried a control.
 */
export interface IndexRule {
  readonly file: SettingsFile;
  /** The path as the deny rule writes it: what `--unprotect` is given, and what the row shows. */
  readonly rule: string;
  /**
   * Whether the file denies the path for every tool `init` writes it for. Half a pair - `Read()` with no `Edit()`
   * - is a rule somebody wrote by hand, and offering to change it would be offering to rewrite someone's work in
   * a shape they did not choose. Such a rule is still listed: it protects a file, and a list that leaves it out
   * answers "where is my rule?" with silence.
   */
  readonly whole: boolean;
}

/**
 * The two hooks `init` installs, as the page finds them. A hook says which file it is installed in rather than
 * whether it is installed: a switch that reads `false` where the committed file runs the hook would be the one
 * thing this tool must never do, which is say a project is quieter than it is.
 */
export interface IndexHooks {
  readonly watch: SettingsFile | false;
  readonly refuse: SettingsFile | false;
  /**
   * Which rules each hook reads: the settings file its command names, the built-in list where it names none, or a
   * policy or another file somebody chose. A settings file's rules replace the built-in list, so this - not the list
   * this run read - is what a page may call watched. For a hook not installed, what `init` would point it at (R6).
   */
  readonly reads: Readonly<Record<'watch' | 'refuse', RulesRead>>;
  /** Where a hook that is not installed yet would be written, relative to the project. */
  readonly path: string;
  /** That file's counterpart, the committed one, relative to the project: what a `shared` above names. */
  readonly sharedPath: string;
  /**
   * That the hooks run an older release than the agentwhy writing this page (`nothing-updates-by-itself.md` U2): what
   * the update notice says. Absent where they do not, where nothing here knows its own version, and on a shared page.
   */
  readonly behind?: Behind;
  /**
   * `2026-10-02-codex-approves-its-own-hook.md` AO3: whether agentwhy's check runs in Codex without asking. `on` is
   * verified - the entries in the person's `~/.codex/hooks.json`, each approved with the hash of the entry as it
   * stands; `stale` is a check written somewhere (the person's files unverified, or the old project-level copy) that
   * Codex may still ask about; `off` is a project that uses Codex with nothing written. Absent with no sign of Codex.
   */
  readonly codex?: 'on' | 'stale' | 'off';
}

/** What became of one session in a run of `start`. */
export type IndexReport =
  | {
      readonly kind: 'generated';
      readonly file: string;
      readonly tally: Tally;
      /**
       * The record behind these counts has gaps - an unjoined delegation, a missing result. A zero counted from a
       * record like that is not a zero, and the row says so rather than reading as a clean session.
       */
      readonly incomplete: boolean;
      /** Which files, and what became of each. Absent where the report could say nothing about any. */
      readonly files?: readonly IndexFile[];
      /** What happened to each file still to do, as its report tells it (To fix T11a). */
      readonly stories?: SessionStories;
      /** How many files its report's Files tab lists: "All {n} files" (`for-people-who-build-with-ai.md` F14). */
      readonly reached?: number;
      /** Why its record is not whole, where it is not - said under "Couldn't check fully" (the maintainer, 2026-10-07). */
      readonly gaps?: GapReasons;
    }
  /** It was inside the range and could not be read, which is a different answer from "nothing happened". */
  | { readonly kind: 'failed' }
  /** It was listed and not generated. The page says so, and says how to reach it (spec R2). */
  | { readonly kind: 'outside-range' };

/**
 * One row. What the catalogue knows without reading a transcript (spec R3), what a generated report counted, and
 * the session's title. The title is the one piece of transcript content, and it arrives already past the redactor.
 */
export interface IndexEntry {
  /** The session's key (`sessionKey`), or its position in the list under `--share`, where an id is not shown. */
  readonly name: string;
  /** Which AI wrote it: every row names it (`2026-09-27-what-codex-wrote.md` X28). */
  readonly provider: Provider;
  /**
   * The title Claude Code gave the session - what a person recognises it by, as `sessions` shows it. Absent when
   * none was found, and always under `--share`: a model wrote it from what the user typed.
   */
  readonly title?: Redacted;
  readonly modifiedAt: number;
  readonly delegations: number;
  readonly report: IndexReport;
  /**
   * The project it was held in, on the computer's page (`.ai/plans/2026-10-06-everything-on-this-computer.md` step 2):
   * the id the projects window lists it under, its folder's name, and where it is as a person reads it. Absent on a
   * project's page, where every row is that project's.
   */
  readonly project?: RowProject;
}

/** The page `start` writes: every session it could see, and what it did about each. */
export interface SessionIndex {
  /** When the run started. Every age on the page is measured from this, never from the reader's clock. */
  readonly now: number;
  /**
   * The time zone of the machine that ran `start`, as an IANA name. Days, weeks and times on the page are this zone's
   * (`for-people-who-build-with-ai.md` O2): fixed when the page is written, so a page reads the same wherever it is
   * opened. Absent means UTC.
   */
  readonly timeZone?: string;
  readonly since: number;
  /** The range as it was asked for, so the page can repeat it in the reader's own terms. */
  readonly asked: string;
  /** The project, where it may be shown. Absent under `--share`: a project path names a client (spec R6). */
  readonly project?: string;
  /**
   * Where the project is, as a person reads it: `~/Projects/shop` (`.ai/specs/2026-09-27-which-project.md` V1). Absent
   * where `project` is, and where the run was not told the home directory.
   */
  readonly place?: string;
  /**
   * How many of the listed conversations were held each way - in the terminal, in a code editor, by a script
   * (`.ai/specs/2026-09-27-which-project.md` V4). A conversation whose transcript said nothing is not counted. Absent under
   * `--share`, where no transcript's end is read.
   */
  readonly entryPoints?: Readonly<Partial<Record<EntryPoint, number>>>;
  /**
   * The run's folder is the home directory or the root of a disk, which is no project (`which-project.md` V6, V7): its
   * onboarding offers only the project step, and its pages offer no Settings. Absent everywhere else.
   */
  readonly notAProject?: 'home' | 'root';
  /**
   * The person's projects, for the window the sidebar's card opens (`.ai/specs/2026-09-27-which-project.md` V9-V11).
   * Absent where the run is not served, and under `--share`: the list names other folders on this computer.
   */
  readonly projects?: IndexProjects;
  readonly shared: boolean;
  /** The command that would bring the oldest listed session into range. */
  readonly widen: string;
  readonly entries: readonly IndexEntry[];
  /** What to do about the sessions this run read. Absent where none was read. */
  readonly check?: IndexCheck;
  /** Absent where a page has no run behind it; the view and its way in are then not rendered at all. */
  readonly settings?: IndexSettings;
  /**
   * The onboarding is served with this run (`.ai/specs/2026-09-24-onboarding.md` W1, W25). Absent where it is not: a
   * shared page, a page opened as a file, a run with no record to keep.
   */
  readonly onboarding?: IndexOnboarding;
  /**
   * `2026-10-06-everything-on-this-computer.md` step 1, GD15-GD16: the page is the computer's - every view a project has,
   * scoped to the whole computer - in place of one project's. `project`, `place` and `notAProject` are then absent.
   */
  readonly scope?: 'computer';
  /**
   * GD20, GD21, GD27: what the computer's page shows - what no set-up project's view does (`outside`), or the set-up
   * projects' own (`projects`) - for the switch on its pages. Absent where it offers no choice.
   */
  readonly computerView?: { readonly shown: ComputerScope };
  /**
   * What the onboarding's computer-wide path starts from (`.ai/specs/2026-10-05-protected-everywhere.md` G7-G9). Absent
   * where the onboarding is not served, or this run cannot write the person's own files.
   */
  readonly everywhere?: IndexEverywhere;
}

/** The computer-wide rules as they are now, and what the path offers (G9, GD11, GD14). */
export interface IndexEverywhere {
  /** GD14's rows, for the system the computer runs, each with whether its path is here. */
  readonly rows: readonly FoundDefault[];
  /** What the person's own Claude Code settings block now, anchored as `refuse` reads it. `unreadable` blocks a write. */
  readonly blocked: readonly string[] | 'unreadable';
  /** The computer's told list (GD11). */
  readonly told: readonly string[] | 'unreadable';
  /** Whether Codex is used on this computer: the page says "in Codex" only where G17 then turns its check on. */
  readonly codex: boolean;
  /**
   * GD23: whether alerts run in every project, from the person's own Claude Code settings - `unreadable` where they
   * cannot be read. Absent where this run cannot turn them on.
   */
  readonly alerts?: boolean | 'unreadable';
  /**
   * `2026-10-07-a-file-in-its-place.md` IP2: what the computer's own window can choose, through the server - files and
   * folders together (Mac), or one kind at a time (Windows). Absent where it has none: a place is typed instead.
   */
  readonly places?: 'both' | 'separate';
}

/** What the onboarding needs from the run beyond the index itself. */
export interface IndexOnboarding {
  /** W24: no project of this person's has finished it, so the intro plays. */
  readonly intro: boolean;
  /**
   * The page opens at its project step, not the welcome: a run in the home directory, for a person who has finished an
   * onboarding before (`.ai/specs/2026-09-27-which-project.md` V7).
   */
  readonly atProject?: true;
  /**
   * G7a: this project is set up, however it was (N6, V10 as GD29 amended it) - so the page Settings leads back to says
   * it is the setup seen again, and its card says what is in force.
   */
  readonly setUp?: true;
}

/** The person's projects as the window draws them (`which-project.md` V9, V10). */
export interface IndexProjects {
  /** Newest conversation first, the project shown on this page among them. */
  readonly rows: readonly IndexProject[];
  /** Projects whose conversations did not say their folder: counted under the list, never listed (V9). */
  readonly unreadable: number;
  /** Projects in the computer's temporary space: counted under the list, never listed (the maintainer's design, V10). */
  readonly temporary?: number;
  /** The run can show another project in this tab (V14): each other project offers the way to it. */
  readonly switchable: boolean;
  /** It can open the computer's own folder window too (V12): the list offers **Choose a folder…**. */
  readonly choosable: boolean;
  /**
   * A project can be taken off this list from the page (`remove-a-project-from-the-list` RM4): every listed row carries
   * a trash. What was removed is not listed anywhere (RM11).
   */
  readonly removable: boolean;
  /**
   * The listed project whose folder holds this run's, where this run's folder has no conversations of its own: its id,
   * and the way from it to here, `src` (V20). Claude Code keeps a project under the folder the editor opened.
   */
  readonly above?: { readonly id: string; readonly within: string };
}

/** One row of the list: a project, as its newest conversation and its own settings say. */
export interface IndexProject {
  /** The name the agent keeps its conversations under: what a page names it by, never a path (V17). */
  readonly id: string;
  /** Where the folder is, as a person reads it: `~/Projects/shop`. */
  readonly place: string;
  /** The folder's own name. */
  readonly name: string;
  /** There, gone, or not looked at because the system guards where it lies (`which-project.md` V10b). */
  readonly folder: FolderState;
  readonly conversations: number;
  readonly newest: { readonly modifiedAt: number; readonly title?: Redacted; readonly entryPoint?: EntryPoint };
  /**
   * W23's two facts for that folder: set up where its onboarding was finished or `watch` runs there. Absent where they
   * could not be read, the folder is gone, or it was not looked at (V10b) - nothing is said rather than a guess.
   */
  readonly setUp?: boolean;
  /** The project this page is about. */
  readonly current: boolean;
}
