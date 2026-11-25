// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../core/entry-point.ts';
import type { Provider } from '../../core/session-format.ts';
import type { ComputerScope } from '../../ports/computer-view.ts';
import type { FileAccess } from '../render/report-page/files.ts';
import type { StepTone } from '../render/report-page/step-looks.ts';
import type { Look } from '../render/ui/status-look.ts';
import type { AnswerScope } from './answer-kinds.ts';

/**
 * What agentwhy answers in the chat, as plain data (`2026-11-24-talking-about-agentwhy.md` CV12): the text, the card in the app and the
 * card in the terminal are all drawn from this and nothing else. Every string crossed the redaction boundary already; a path
 * is as the chat names it (AYD9).
 */
export interface AnswerPath {
  readonly path: string;
  /** Not a file of the project the page shows it for: its name alone, and where it lies. */
  readonly place?: 'outside' | 'elsewhere';
}

export interface AnswerFile extends AnswerPath {
  readonly access: FileAccess;
  /** Which AIs that happened to it with, where the record says: your own is 0, a helper its number. */
  readonly by?: readonly number[];
}

/** A file of a step: `everyday` is one no rule holds, named and never drawn as one to act on. */
export interface AnswerMet extends AnswerFile {
  readonly everyday?: true;
}

export interface AnswerStep {
  readonly tone: StepTone;
  readonly label: string;
}

/** Some steps of one AI, in order, as one thing that happened; `ordinary` ones are only counted. */
export interface AnswerMoment {
  readonly from: number;
  readonly to: number;
  readonly tone: StepTone;
  /** The page's sentence, as plain words. */
  readonly said: string;
  readonly files: readonly string[];
  /** Every file of those steps with the strongest thing that happened to it there, private ones first; `metMore` are left out. */
  readonly met?: readonly AnswerMet[];
  readonly metMore?: number;
  /** What they ran: a tool, and a shell's programs - never a command line. */
  readonly ran?: readonly string[];
  /** What the page labels it: its look, or a key written over. */
  readonly label: string;
  /** The sentence its AI wrote before it, as the page quotes it; `noted` is what it worked out and did not say. */
  readonly wrote?: { readonly text: string; readonly noted?: true; readonly cut?: true };
  /** Which AI: your own, or a helper by its number. */
  readonly helper?: number;
  readonly first?: true;
}

export interface AnswerHelper {
  readonly helper: number;
  readonly asked?: string;
  /** No action of it was recorded: nothing is known of what it met. */
  readonly unrecorded?: true;
  readonly files: readonly AnswerFile[];
  readonly filesMore: number;
}

/** This conversation: one model for every question about it, so a card can turn from one to another by itself. */
export interface ConversationAnswer {
  readonly about: 'conversation';
  readonly look: Look;
  readonly numbers: { readonly read: number; readonly name: number; readonly stopped: number; readonly opened: number; readonly unknown: number; readonly changed: number; readonly helpers: number };
  readonly steps: { readonly n: number; readonly leftOut: number; readonly list: readonly AnswerStep[]; readonly moments: readonly AnswerMoment[]; readonly momentsMore: number;
    /** How many of your AI's steps read a private file: never one that only wrote it (I8). */
    readonly reads: number;
    /** Your AI's steps that named no private file, and, apart, its helpers'. */
    readonly ordinary: number;
    readonly helperSteps: number;
    /** TK2: what of those steps is not known, in the page's words. Absent where all of it is. */
    readonly notKnown?: readonly string[];
  };
  readonly files: readonly AnswerFile[];
  readonly filesMore: number;
  /** The private files your own AI met, as a helper's are said; `mineMore` are left out. */
  readonly mine?: readonly AnswerFile[];
  readonly mineMore?: number;
  readonly helpers: readonly AnswerHelper[];
  readonly helpersMore: number;
  readonly todo: readonly (AnswerPath & { readonly kind: 'keys' | 'data' })[];
  readonly todoMore: number;
  /** How many of every thing to do ask for new keys; the rest ask what the file holds. */
  readonly todoKeys: number;
  /** How many files its report lists, of every kind. */
  readonly all: number;
  /** TK2, F17: why the record could not be checked fully, in the row's words. Absent where it was. */
  readonly notChecked?: readonly string[];
}

/** One group a conversation of the list is in, and every one is in exactly one. */
export type AnswerGroup = 'attention' | 'fixed' | 'tracked' | 'stopped' | 'seen' | 'none' | 'partly' | 'failed';

export interface AnswerRow {
  /** The conversation by the name the page gives it, for a question about it alone (CV7). */
  readonly key: string;
  /** What a person or their AI asks about it by: no two of one answer have the same. */
  readonly ref: string;
  /** Whether the page has a report of it to open. */
  readonly report: boolean;
  readonly title?: string;
  readonly provider: Provider;
  readonly day: { readonly year: number; readonly month: number; readonly day: number };
  readonly relative?: 'today' | 'yesterday';
  /** The local time it was last active, `HH:MM`, as the page says it. */
  readonly time: string;
  /** Where it was held, where its record says so (`where-it-was-held` WH1, WH4). */
  readonly held?: Exclude<EntryPoint, 'unknown'>;
  readonly look: Look;
  readonly group: AnswerGroup;
  readonly read: number;
  /** Its private and tracked files, each once by the strongest thing that happened to it. */
  readonly files: Readonly<Record<FileAccess, number>>;
  /** How many files its report lists, of every kind. */
  readonly all?: number;
  readonly helpers: number;
  /** CV15: on this computer's answer, the project it was held in. */
  readonly project?: string;
}

/** CV16: how many times the AIs wanted one private or tracked file, over the conversations read. */
export interface OftenRow extends AnswerPath {
  readonly wanted: number;
  readonly read: number;
  readonly changed: number;
  readonly opened: number;
  readonly stopped: number;
  readonly named: number;
  readonly unknown: number;
  readonly tracked: boolean;
  readonly conversations: number;
  readonly project?: string;
}

/** A project, or this computer: one model for every question about them. */
export interface ListAnswer {
  readonly about: 'list';
  readonly scope: AnswerScope;
  /** Which of this computer's two lists (GD28): what belongs to no set-up project, or the set-up projects. */
  readonly list?: ComputerScope;
  /** The range the pages read, as it was asked for: an answer never covers more than the page does (CV12). */
  readonly asked: string;
  /** CV17: how many of the range's conversations have been read so far. One not read is in no group. */
  readonly checked: { readonly read: number; readonly of: number };
  /** CV17: the page is still reading, so what is counted here may change. */
  readonly reading?: true;
  readonly groups: Readonly<Record<AnswerGroup, number>>;
  /** Newest first: the newest ones, then - from further back - the newest of each group that is asked for by itself. */
  readonly rows: readonly AnswerRow[];
  /** Where some are not read yet, how many of the newest are, up to the first that is not: the rows are no list of the newest past it. */
  readonly newestRead?: number;
  /** How many of the rows, from the first, are the newest conversations; `rowsMore` are the ones older than these. */
  readonly recent: number;
  readonly rowsMore: number;
  /** Most wanted first; a file nobody wanted is in `namedOnly`. */
  readonly often: readonly OftenRow[];
  readonly oftenMore: number;
  readonly namedOnly: number;
  /** CV15: this computer's other list, with its own counts: two lists, never one sum. */
  readonly beside?: ListAnswer;
}

export type AnswerModel = ConversationAnswer | ListAnswer;
