// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AccessSource } from '../core/access/protected-access.ts';
import type { ReturnStrength } from '../core/access/returns.ts';
import type { UseLanding, UseSource } from '../core/access/uses.ts';
import type { CapabilityState } from '../core/capability.ts';
import type { CapabilityQuestion, Completeness, GapKind } from '../core/completeness.ts';
import type { ContextKind } from '../core/context.ts';
import type { EventOutcome } from '../core/event.ts';
import type { ProjectRoot } from '../core/project-root.ts';
import type { Redacted } from '../core/redaction/redacted.ts';
import type { ReviewOutcome } from '../core/review.ts';
import type { Provider } from '../core/session-format.ts';
import type { RuntimePermissions } from '../core/turn.ts';
import type { RefusedByOthers } from './refusals.ts';

/**
 * What a report says, after the redaction boundary. Every field that came out of a transcript is `Redacted`, so
 * a renderer cannot print a raw value however it is written - the compiler refuses first (`2026-09-13-overview.md`,
 * invariant 1). Counts and enumerations are the tool's own vocabulary and stay as they are.
 */
export interface ReportModel {
  /** The answer, in one sentence, before any of the detail. A reader who stops here has still been told. */
  readonly headline: Headline;
  /** Counted once here so that no two places on a page can count the same thing differently. */
  readonly tally: Tally;
  /** The session as a shape: who was asked for what, and which of them reached something. */
  readonly graph: SessionGraph;
  /**
   * What is worth reading, in order: how a protected file came to be reached, who reached it, and what that
   * agent had been asked to do. A list of every action is an inventory; this is the report.
   */
  readonly stories: readonly FindingStory[];
  readonly scope: ReportScope;
  readonly summary: ReportSummary;
  /**
   * What the session's own agent did, before and between its delegations. Counting these in the summary and
   * showing them nowhere would leave a reader adding up actions that are not on the page.
   */
  readonly mainAgent: readonly ReportAction[];
  readonly delegations: readonly ReportDelegation[];
  /**
   * Agents that ran with no recorded delegation. Not every route records the call that started one - a skill
   * spawns an agent and leaves no join key - and an agent whose cause cannot be read is exactly what this tool
   * must not drop. What it did is still evidence.
   */
  readonly unattributedAgents: readonly ReportAgent[];
  readonly findings: readonly ReportFinding[];
  /** Results that carried something of a recognised key format, named by kind and never by value. */
  readonly secretShapes: readonly SecretShapeFinding[];
  /**
   * What came back from each delegation whose agent, or an agent below it, reached a protected file
   * (`specs/2026-09-15-what-came-back.md`): one statement per return, in the order of the delegations.
   */
  readonly returns: readonly ReturnStatement[];
  /**
   * Where a traced value appeared after it was read or came back (`specs/2026-09-15-where-the-value-went.md` R7-R10):
   * one statement per use, in the order of the agents and of their records.
   */
  readonly uses: readonly UseStatement[];
  /**
   * What each agent did with protected files and values, step by step (`specs/2026-09-15-agent-flow.md`): one flow for
   * every agent with a step, in the order of the agents.
   */
  readonly flows: readonly AgentFlow[];
  /** Each protected file reached, with what was read from it (`specs/2026-09-23-the-report-page.md` M1, M2). */
  readonly privateFiles: readonly PrivateFile[];
  /**
   * Every file of the session that no protected pattern matches (the same spec, M6; P32 changed 2026-10-05): what a file
   * tool or a command read or wrote, and every name a listing printed or a command named.
   */
  readonly everydayFiles: readonly EverydayFile[];
  /** Names seen past the most a page lists (`EVERYDAY_NAMES_LISTED`): counted, and said, never dropped in silence. */
  readonly everydayNamesLeftOut?: number;
  /** Where each file of the session first came up (`the-order-it-went.md` OW1, OW2). Absent from older models. */
  readonly fileSteps?: readonly FileStep[];
  /** What could not be established. Never empty when the session was incomplete (architecture invariant 4). */
  readonly missing: readonly Redacted[];
  /**
   * What `missing` says, line for line, by kind rather than in words: a page says it in its reader's language
   * (`specs/2026-09-23-the-report-page.md` P61).
   */
  readonly gaps: readonly ReportGap[];
  /** What the runtime recorded beside the actions: permissions, reviews, and what the format answers. */
  readonly recorded: ReportRecorded;
}

/** A gap of the session's model, or an agent's answer that could not be read (`answer-unread`) or never arrived (`answer-awaited`). */
export type ReportGapKind = GapKind | 'answer-unread' | 'answer-awaited';

/** One line of `missing`: its kind, the question a capability gap cannot answer, and how many times it was found. */
export interface ReportGap {
  readonly kind: ReportGapKind;
  readonly question?: CapabilityQuestion;
  readonly count: number;
}

/**
 * What the runtime recorded beside the session's actions (`2026-09-27-what-codex-wrote.md` X19-X23). Evidence of what was
 * configured and decided at the time, never a verdict: the policy the report was evaluated by is `scope.policy`, and
 * nothing here is agentwhy's policy, then or now (X21, X22). Empty where the format records none of it.
 */
export interface ReportRecorded {
  /** The runtime permissions recorded for turns, one entry per distinct set of settings. */
  readonly permissions: readonly RecordedPermissions[];
  readonly reviews: readonly ReportReview[];
  /** Which questions the session's sources can answer, by what their format declares, counted by source (X23). */
  readonly capabilities: readonly ReportCapability[];
  /** Output agents' models were handed from no call an id names, counted; its text is never here (X10). */
  readonly deliveries: number;
  /**
   * Content kept only to be scanned, by kind: code an agent wrote, words it was given, instructions and output that
   * joined nothing (X14, X17). None of its text is here.
   */
  readonly contexts: Readonly<Record<ContextKind, number>>;
}

/** One set of runtime settings, as recorded, and how many turns of which agents it was recorded for (X22). */
export interface RecordedPermissions {
  readonly turns: number;
  readonly agentIndexes: readonly number[];
  /** When the runtime asked before acting, in its own recorded words. */
  readonly approval?: Redacted;
  readonly approver: RuntimePermissions['approver'];
  readonly sandbox?: Redacted;
  readonly network: RuntimePermissions['network'];
  readonly readScopes: number;
  readonly writeScopes: number;
  /** The paths the write scopes name, through the path door. A scope allows; none here says a path was reached. */
  readonly writablePaths: readonly Redacted[];
  /** False where the record held a part the contract does not list, which is kept out and said. */
  readonly complete: boolean;
}

/** A reviewer the runtime started: no agent and no delegation, but decisions on a turn of the agent it reviewed (X19). */
export interface ReportReview {
  readonly reviewedAgentIndex?: number;
  readonly verdicts: readonly ReportVerdict[];
}

export interface ReportVerdict {
  readonly outcome: ReviewOutcome;
  /** Whether it names a turn the reviewed agent had. A verdict never names the action it judged (X20). */
  readonly turnKnown: boolean;
  readonly risk?: Redacted;
  /** The reviewer's reasons are free text: said by their size and never quoted, as an instruction is. */
  readonly rationaleSize?: number;
  readonly evidence: Redacted;
}

export interface ReportCapability {
  readonly question: CapabilityQuestion;
  readonly state: CapabilityState;
  /** How many sources of the session declared it. */
  readonly sources: number;
}

/**
 * One protected file, and what reading it left behind: which kinds of key were in it and which variables it sets. Names
 * only - `stripe-key`, `STRIPE_SECRET_KEY` - never a value (`specs/2026-09-23-the-report-page.md` M1, M2). The Fix it
 * wizard reads these to say which service a key belongs to and which lines to replace; nothing here is guessed from the
 * file's name.
 */
export interface PrivateFile {
  readonly path: Redacted;
  /**
   * The known key formats found in what was read from this file alone, by class name (`stripe-key`, `jwt`, `value
   * beside a sensitive name`), in the order they were first found.
   */
  readonly keys: readonly Redacted[];
  /** The variable names read from this file, in the order first read, at most `NAMES_PER_FILE`. */
  readonly names: readonly Redacted[];
  /**
   * Of those, the lines whose value is a key, each with what the value was recognised as (`stripe-key`, `jwt`, `high-entropy
   * value`) - M2a: the lines a person has to change, where `names` also holds `NODE_ENV`. At most `NAMES_PER_FILE`.
   */
  readonly keyed: readonly KeyedLine[];
  /**
   * A read reached this file together with another protected one - `cat a.env b.env` - so what came back cannot be told
   * apart by file. What that read carried is given to neither; this says the lists above may be short.
   */
  readonly mixed?: true;
}

/** A line of a private file whose value is a key: its variable name and the class its value matched. Never the value. */
export interface KeyedLine {
  readonly name: Redacted;
  readonly key: Redacted;
}

/** At most this many variable names are kept per file: enough to name every line a person has to change. */
export const NAMES_PER_FILE = 20;

/**
 * A file no protected pattern matches, that a file tool worked on - a tool whose profile says which input names the
 * file, and whose result is that file's text or which writes it. A file only a shell command or a listing named is not
 * here: telling a file from any other word of a command line is a guess the report makes only against the policy
 * (`protected-access.ts`). Protected files are `privateFiles`, and how each was reached is `actionsOf`'s to say.
 */
/**
 * The first action that reached a file (`the-order-it-went.md` OW1): read it, wrote it, was stopped from it, printed or
 * named it. Each AI's actions are in its own record's order; no order across AIs is claimed (invariant 3).
 */
export interface FileStep {
  readonly path: Redacted;
  /** The AI that took it, by its index among the session's agents - the graph's. */
  readonly agentIndex: number;
  /** That AI's action number: the `sequence` Advanced prints beside the action. */
  readonly step: number;
  /** Its place among the files that action reached, as the action gave them: named in it first, then as printed. */
  readonly place: number;
  /**
   * What that action did to the file, as its row would say it (`the-order-it-went.md` OW1 as amended 2026-10-05): a
   * file has one step for each thing first done to it, so its row can stand at the step that gave it its status - the
   * read after the listing. Absent from models written before it, which hold the first step alone.
   */
  readonly how?: 'read' | 'changed' | 'stopped' | 'unknown' | 'opened' | 'named';
}

/**
 * One call that reached an everyday file (`the-same-window-for-every-file` EF2): what a protected file's flow step
 * holds, without the value tracing only a protected file gets - agentwhy follows no value out of an everyday file, so
 * nothing here says where its contents went afterwards, and the window says so (EF4).
 */
export interface EverydayCall {
  /** The AI that made it, by its index among the session's agents - the graph's, as `FileStep` gives it. */
  readonly agentIndex: number;
  /** What it ran, as a flow step names a route: the tool, and for a shell the programs it ran. */
  readonly did: Redacted;
  readonly outcome: EventOutcome;
  readonly evidence: Redacted;
  /** M4: when its record was written, for display beside the order - never instead of it, and never under `--share`. */
  readonly at?: number;
  /** What it did to the file, as the row would say it. */
  readonly how: EverydayFile['how'];
}

export interface EverydayFile {
  readonly path: Redacted;
  /** The calls that reached it: read it, wrote it, were refused it, or printed or named it. */
  readonly calls: number;
  /**
   * EF1, EF2: the calls themselves, in the order of the records, for the window its row opens. Absent on a file whose
   * name only was seen - its story is one line, and it keeps the simple window (EFD1) - and on models written before
   * this, whose rows keep the simple window too.
   */
  readonly reaches?: readonly EverydayCall[];
  /** EF8: calls past the most kept (`EVERYDAY_CALLS_KEPT`), counted and never dropped in silence. */
  readonly reachesLeftOut?: number;
  /**
   * The strongest of them: its text came back (`read`), it was written (`changed`), every call was refused, a program
   * opened it and printed a fact about it rather than its text (`opened`, 2026-10-07), or only its name was seen - a
   * listing printed it or a command named it (`named`, P32 changed 2026-10-05).
   */
  readonly how: 'read' | 'changed' | 'stopped' | 'opened' | 'named';
}

export interface ReportScope {
  readonly sessionId: Redacted;
  /** Which AI wrote the conversation (`2026-09-27-what-codex-wrote.md` X28): the page names it. */
  readonly provider: Provider;
  readonly policy: {
    readonly level: Redacted;
    /** Where the policy came from, in words - including when it was the built-in default. */
    readonly origin: Redacted;
    readonly patterns: number;
    readonly exceptions: number;
  };
  readonly redaction: {
    readonly rulesetVersion: number;
    /** Occurrences replaced, and how many different values those were. */
    readonly redactions: number;
    readonly distinctValues: number;
    readonly protectedContents: number;
    /** Match classes that are not implemented yet, named so the reader can weigh the output. */
    readonly missingClasses: readonly Redacted[];
  };
  readonly completeness: Completeness;
  /**
   * M4: when the first and the last recorded call were written, epoch milliseconds - for display only. Absent where no
   * record carries a time, and always under `--share`.
   */
  readonly times?: { readonly first: number; readonly last: number };
  /**
   * Which view produced this report and whether a project root was established. A reader handed a report has to
   * be able to tell a short path that is the whole truth from a short path that is all they were given.
   */
  readonly paths: {
    /** Whether `--share` produced this report. A reader of a short path has to know which view they hold. */
    readonly shared: boolean;
    readonly root: ProjectRoot['kind'];
    /** How many working directories the session recorded, which is why there is no single root. */
    readonly workingDirectories?: number;
  };
}

export interface ReportSummary {
  readonly agents: number;
  readonly delegations: number;
  readonly actions: number;
  readonly byOutcome: Readonly<Record<EventOutcome, number>>;
  readonly findings: number;
  readonly secretShapes: number;
  /** Tool name to how many times it was used, so 740 actions can be read without listing 740 actions. */
  readonly tools: Readonly<Record<string, number>>;
  /** Counted apart from delegations, so "0 delegations, 3 agents" cannot read as a contradiction. */
  readonly unattributedAgents: number;
}

export interface ReportDelegation {
  readonly id: Redacted;
  /** Numeric references retain exact correlations without exposing raw identifiers in HTML attributes. */
  readonly parentAgentIndex?: number;
  readonly childAgentIndex?: number;
  readonly evidence: Redacted;
  readonly agentType?: Redacted;
  readonly depth?: number;
  /**
   * The one-line description the delegation carried, scanned. The **full instruction is deliberately not here**:
   * §7.3 keeps the whole text of a prompt out of a report, and quoting the fragment a verdict rests on needs a
   * verdict - which arrives with the detector. Its size is reported instead, so nobody mistakes absence for
   * emptiness.
   */
  readonly description?: Redacted;
  readonly instructionSize?: number;
  /**
   * Words the delegating agent gave this helper later, in the order given (X17): by size, as the first instruction is,
   * never quoted. Empty where there were none.
   */
  readonly laterInstructions: readonly { readonly size: number; readonly evidence: Redacted }[];
  readonly actions: readonly ReportAction[];
  readonly completeness: Completeness;
}

/**
 * The findings as numbers, counted once. A headline that says `30` above a set of tiles that say `44` is read as
 * a broken tool, and rightly: they are the same facts counted two ways. Every count here is of **files**, except
 * where it says otherwise, because a file reached twice is one file.
 */
export interface Tally {
  /**
   * Agents whose context the contents of a protected file reached - the question the report's own headline
   * answers first, counted here so every view of this session answers it the same way. `session-view.ts`
   * decides it per agent (`AgentEntry.saw`); this is how many of them it decides it for.
   */
  readonly contentsSeen: number;
  /**
   * Distinct protected files the record shows an agent was handed the text of (2026-10-07): the page's word for a read
   * (S3), counted for the ladder a conversation's row climbs. `contentsSeen` above is the stronger fact and keeps its
   * meaning - a value traced out of the file - which a row of ordinary words never is (§5.2), so a file read and
   * nothing traced in it is counted here and not there. Absent where there are none, and on models written before it.
   */
  readonly filesRead?: number;
  /**
   * Distinct paths the record establishes were reached. A refused attempt reached nothing, and an attempt whose effect
   * the record does not establish is not a reach either (`2026-09-27-what-codex-wrote.md` X11): neither is among these.
   */
  readonly filesReached: number;
  /** Of `filesReached`, those no call parameter ever named: they appeared only in what came back. */
  readonly onlyThroughResult: number;
  /** Of `filesReached`, those a call named outright and nothing refused. */
  readonly namedByCall: number;
  /**
   * Of `filesReached`, those some call opened without printing their text - `wc -l`, `stat`, a checksum (2026-10-07) -
   * and no call printed a line of. The file was opened, and what is inside it did not reach the agent. A file listed
   * first and opened after is one of these: opening it is the stronger fact. Absent where there are none, and on
   * models written before it.
   */
  readonly filesOpened?: number;
  /**
   * Attempts that were refused: by a rule, unless `refusedByOthers` counts them otherwise. Counted as attempts, not
   * files: a refusal is something that happened, not a file.
   */
  readonly refusedAttempts: number;
  /** Of `refusedAttempts`, those no rule refused (`who-stopped-it` WS3). Absent where a rule refused every one. */
  readonly refusedByOthers?: RefusedByOthers;
  /**
   * Attempts at protected files whose effect the record does not establish: no result, or a process that ran without
   * showing what it reached. Counted apart from both, since the file may or may not have been reached (X11).
   */
  readonly unknownAttempts: number;
  /**
   * Where no agent is shown to have seen the contents of a protected file: the protected files a call printed the text
   * of all the same (X10, X14) - `cat .env` ran, and the cell handed its model only a count. Read by a process, not
   * known to be seen, so a record with gaps cannot call it nothing to fix. Absent from indexes written before it.
   */
  readonly printedUnseen?: number;
  /** Delegations whose return carried a value from a protected file. Counted as returns, not files (R15). */
  readonly valuesReturned: number;
  /**
   * Delegations whose agent wrote a traced value into its own messages and none came back (R4b): the session's
   * transcript keeps it, whatever reached the agent that delegated.
   */
  readonly valuesWritten: number;
  /**
   * Agents that wrote a traced value into their own words, of either kind: what the report's own agent panel
   * answers "Wrote it in its messages" from (`agent-summary.ts`). `valuesWritten` above is read from delegation
   * returns alone, so a session that delegated to no one had no count for this at all, and its row in the index
   * said nothing where the report beside it said yes.
   */
  readonly wroteInMessages: number;
  /** Distinct files that are not protected a traced value was put into (`2026-09-15-where-the-value-went.md` R11, R14). */
  readonly filesWrittenOnward: number;
  /** Every use of a traced value, of every kind (R14). */
  readonly valueUses: number;
}

/**
 * The session drawn rather than listed: one agent asks, others run in their own context, and what they found
 * comes back into the transcript. A reader who has never thought about how delegation works can see the shape
 * of it here - which is the point, because the shape is the reason a rule on a tool call is not enough.
 */
export interface SessionGraph {
  /** The agent the session itself is. It does the delegating, and can reach files of its own. */
  readonly main: GraphAgent;
  /** Everyone it handed work to, worst first. A drawing shows the first few and says what it left out. */
  readonly agents: readonly GraphAgent[];
  readonly totalAgents: number;
}

export interface GraphAgent {
  readonly index: number;
  /** Absent when the parent cannot be established. Never inferred from depth or display order. */
  readonly parentIndex?: number;
  /** Its identity, as the transcript had it. The page shows this as a detail; neither renderer calls it a name. */
  readonly label: Redacted;
  /**
   * What both renderers call it: its position among the delegated agents, 1-based. Absent for the session's own
   * agent, which has a name rather than a number. It lives here because a rule each renderer works out for
   * itself is a rule they will one day disagree about.
   */
  readonly ordinal?: number;
  readonly type?: Redacted;
  /** What it was asked to do. Absent when no delegation recorded it - which is drawn, not glossed over. */
  readonly askedTo?: Redacted;
  readonly actions: number;
  /** Distinct protected paths this agent reached, counted as `Tally` counts them. */
  readonly filesReached: number;
  readonly refusedAttempts: number;
  /** Of this agent's refused attempts, those no rule refused (WS3). Absent where a rule refused every one. */
  readonly refusedByOthers?: RefusedByOthers;
  /** The worst path it reached, so a node can name one thing instead of a number alone. */
  readonly topPath?: Redacted;
  /** What came back from it into the context of the agent that delegated, when that was a value or a path (R12). */
  readonly returned?: 'value' | 'path';
  /** It wrote a value from a protected file into its own messages, and no value came back from it (R4b, R12). */
  readonly wroteValue?: true;
  /** It put a traced value into a file that is not protected (`2026-09-15-where-the-value-went.md` R12, R13). */
  readonly wroteOnward?: true;
  /**
   * The protected files whose values were in output its model was handed that is the result of none of its calls -
   * what a runtime handed back from code the agent wrote (`2026-09-27-what-codex-wrote.md` X10): the agent saw them.
   * Absent when there were none.
   */
  readonly received?: readonly Redacted[];
}

export interface Headline {
  /** `clear` when nothing protected was reached; `attention` when something was. Never a verdict on intent. */
  readonly severity: 'clear' | 'attention';
  readonly sentence: Redacted;
  /** The honest qualifier: how much of the count below is likely to be a mention rather than an opening. */
  readonly caveat?: Redacted;
}

/**
 * One protected path, and the chain that led to it. This is the shape the motivating case needs in order to
 * be legible: the instruction is the cause, the command is the route, and the result is where the file appeared.
 */
export interface FindingStory {
  readonly agentIndex?: number;
  readonly path: Redacted;
  readonly source: AccessSource;
  readonly outcome: EventOutcome;
  /**
   * The file's text reached the agent (`the-chat-says-what-the-report-says` S3): a succeeded call the file was named
   * to that printed its text, or whose search printed its lines. A name seen in a listing, a write and a refusal are
   * not reads, and carry no flag.
   */
  readonly read?: true;
  /** Who reached it: the delegated agent, or the session's own agent. */
  readonly who: Redacted;
  /** What that agent had been asked to do, when a delegation recorded it. The cause, in its own words. */
  readonly askedTo?: Redacted;
  /** The tool, and the programs a shell command ran - structure, never the command text (§7.3). */
  readonly did: Redacted;
  /**
   * The adapter knows this tool and where it names a file. False for a tool it does not know, whose whole input was
   * searched: a path in the text such a call carried is a mention of a file, not a call that opened one. The report
   * shows both and says which; `check` counts only the first (`2026-09-16-worth-running-every-day.md` R12b).
   */
  readonly toolKnown: boolean;
  readonly evidence: Redacted;
  /** How many times this same path was reached the same way, so one line can stand for many. */
  readonly occurrences: number;
  /** How many lines of the file those calls' searches printed (`search-hits-are-reads` H10). Absent where none. */
  readonly lines?: number;
  /** What the agent wrote immediately before the call (`specs/2026-09-15-why-this-call.md`). Never called a reason. */
  readonly wrote: WroteBefore;
}

/**
 * What an agent wrote before the call this finding rests on (`specs/2026-09-15-why-this-call.md` R6, R7). The fact - how
 * much, before how many calls, and where it is written - is in every view. The words themselves are one sentence,
 * redacted and capped, and are absent under `--share` and absent whenever they carried a value from a protected
 * file: the scanner recognises the minority of secrets, so a traced run decides that, not a pattern.
 */
export interface WroteBefore {
  /** Characters of words before the call; 0 when there were none. */
  readonly size: number;
  /**
   * Blocks the record kept before the call without any words in them. In the measured session every reasoning
   * block is empty, and "the agent wrote nothing" would be a different statement from "the record kept no words".
   */
  readonly blank: number;
  /** How many calls the same words stand before. */
  readonly covers: number;
  readonly sentence?: Redacted;
  /** Which words the sentence came from: what the agent worked out, or what it said (R7a). */
  readonly kind?: 'said' | 'reasoning';
  /** The sentence was cut at the cap, and says so rather than reading as a whole thought. */
  readonly cut?: true;
  /** Protected files a traced value in those words came from. When set, the words themselves are not shown. */
  readonly carried: readonly Redacted[];
  readonly evidence: Redacted;
}

export interface ReportAgent {
  readonly agentIndex: number;
  readonly id: Redacted;
  readonly type?: Redacted;
  readonly depth?: number;
  readonly actions: readonly ReportAction[];
}

export interface ReportAction {
  readonly sequence: number;
  readonly tool: Redacted;
  readonly outcome: EventOutcome;
  readonly target?: Redacted;
  readonly evidence: Redacted;
  /** M4: when the call's record was written, for display only; never under `--share`. */
  readonly at?: number;
}

export interface ReportFinding {
  readonly path: Redacted;
  readonly source: AccessSource;
  readonly outcome: EventOutcome;
  readonly tool: Redacted;
  readonly pattern: Redacted;
  readonly evidence: Redacted;
  /**
   * The pattern that made it private is one the person asked only to be told about (F57): the agent was let read it.
   * Absent for a blocked one, which is every pattern written before F57.
   */
  readonly told?: true;
}

export interface SecretShapeFinding {
  readonly agentIndex?: number;
  readonly tool: Redacted;
  readonly outcome: EventOutcome;
  /** The class names, such as `aws-access-key-id`. The value itself never leaves the redactor. */
  readonly classes: readonly Redacted[];
  readonly evidence: Redacted;
  /**
   * The result is a private file's text - a call that named and read one (`2026-10-02-said-where-the-person-is.md` SW7):
   * the key is that file's, said where the file is, and not a key "in no file this project protects" (P59).
   */
  readonly inPrivateFile?: true;
}

/**
 * What came back from one delegation (`specs/2026-09-15-what-came-back.md` R4-R9), after the redaction boundary: files through
 * the path door, agents by index, and no text of what came back - no value, no fragment, no length of a match.
 */
export interface ReturnStatement {
  /** The delegated agent whose report came back. */
  readonly agentIndex?: number;
  /** The agent it came back to. */
  readonly parentAgentIndex?: number;
  readonly strength: ReturnStrength;
  /** Where a value that came back was read from (`value`), or the reached files the report named (`path`). */
  readonly paths: readonly Redacted[];
  /** Where a traced value in the agent's own messages was read from (R4b); empty when they carry none. */
  readonly writtenFrom: readonly Redacted[];
  /** Set when a matched value came from one of those files and the transcript does not say which; said as "one of". */
  readonly fileUncertain?: true;
  /** Protected files reached by the agent or by an agent below it. */
  readonly filesReached: number;
  /** Characters of the report - its own length, never the length of anything in it that matched. */
  readonly reportLength?: number;
  /** An unknown return whose agent was started in the background, and no report of it was delivered (where-the-value-went R5). */
  readonly awaited?: true;
  /**
   * The crossing was forced by where the value turned up rather than read out of the reply: this record does not
   * hold the reply itself. Said in its own words, so the page never claims to have read what it did not.
   */
  readonly inferred?: true;
  readonly evidence: Redacted;
}

export type { UseLanding, UseSource };

/**
 * One use of a traced value, past the redaction boundary (`specs/2026-09-15-where-the-value-went.md` R9, R10): where it
 * landed and what it came after. No value, no words, no command line and no length of a match crosses it.
 */
export interface UseStatement {
  readonly agentIndex?: number;
  /** The protected files the value was read from, through the path door. */
  readonly files: readonly Redacted[];
  readonly fileUncertain?: true;
  readonly landed: UseLanding;
  /** For `file`: the files written, through the path door, and whether one of them is itself protected. */
  readonly targets?: readonly Redacted[];
  readonly intoProtected?: boolean;
  /** For `command`: its programs, by name, and whether it commits. */
  readonly programs?: readonly Redacted[];
  readonly commits?: boolean;
  readonly source: UseSource;
  /** For `unprotected`: what the call whose result carried the value named, through the path door. */
  readonly sourceTargets?: readonly Redacted[];
  readonly evidence: Redacted;
}

/**
 * One agent's flow (`specs/2026-09-15-agent-flow.md` R1-R6): its steps in the order of its own records, consecutive steps
 * that say the same thing collapsed. The order was taken from records before the boundary; nothing of them crosses it.
 */
export interface AgentFlow {
  readonly agentIndex: number;
  readonly steps: readonly FlowStep[];
}

export type FlowStep = FlowAsked | FlowReached | FlowCarried | FlowUsed | FlowDelegated | FlowReturned | FlowReceived;

export interface FlowStepCommon {
  /** 1-based, as shown: what "after step N" names. */
  readonly number: number;
  /** How many consecutive steps that said the same thing this one stands for (R3). */
  readonly count: number;
  /** The chain cannot be followed through this step, and the step says why (R5). */
  readonly broken?: true;
  /** The record of the first step it stands for, and of the last when it stands for several. */
  readonly evidence: readonly Redacted[];
  /** M4: when the first record it stands for was written, for display only; never under `--share`. */
  readonly at?: number;
}

/** The delegation that started the agent, recorded by the agent that asked (R2). */
export interface FlowAsked extends FlowStepCommon {
  readonly kind: 'asked';
  readonly byAgentIndex?: number;
  readonly askedTo?: Redacted;
}

/** A call that reached, or was refused, a protected file. */
export interface FlowReached extends FlowStepCommon {
  readonly kind: 'reached';
  readonly did: Redacted;
  /** As on a finding: false where the tool's own input was searched for want of a profile for it. */
  readonly toolKnown: boolean;
  readonly files: readonly Redacted[];
  readonly sources: readonly AccessSource[];
  readonly outcome: EventOutcome;
  /** Its result held a traced value: the call showed the agent a value, not only a path. */
  readonly carriedValue: boolean;
  /**
   * The files whose lines a search printed, and how many (`search-hits-are-reads` H5): their text reached the agent
   * whether or not a value was traced in it. Absent where it printed none.
   */
  readonly lines?: readonly { readonly path: Redacted; readonly count: number }[];
  /**
   * The files this call opened and printed no text of: `wc -l`, `stat`, a checksum (2026-10-07). The file was opened,
   * which a name seen never means, and nothing of what is inside it came back. Absent where it opened none that way.
   */
  readonly opened?: readonly Redacted[];
  /** The call ran a command line: a path it named may sit inside the text of a command, a mention rather than a read. */
  readonly viaCommand: boolean;
  /**
   * What came back is what the process printed, which the record keeps apart from what the agent's model was handed
   * (`2026-09-27-what-codex-wrote.md` X10): a value in it is not said to be seen, nor its absence to be unseen.
   */
  readonly processOutput?: true;
  readonly wrote: WroteBefore;
}

/**
 * Output the agent's model was handed that is the result of none of its calls - what a runtime handed back from code
 * the agent wrote - holding a value traced to these files (`2026-09-27-what-codex-wrote.md` X10): the agent read them,
 * and no call of its own is said to have brought them.
 */
export interface FlowReceived extends FlowStepCommon {
  readonly kind: 'received';
  readonly files: readonly Redacted[];
}

/** A call that reached nothing protected, whose result carried a value a later use came after. */
export interface FlowCarried extends FlowStepCommon {
  readonly kind: 'carried';
  readonly did: Redacted;
  readonly named: readonly Redacted[];
}

/** A use of a traced value (where-the-value-went R7), pointing at the step it came after (R4). */
export interface FlowUsed extends FlowStepCommon {
  readonly kind: 'used';
  readonly landed: UseLanding;
  readonly files: readonly Redacted[];
  readonly fileUncertain?: true;
  readonly targets?: readonly Redacted[];
  readonly intoProtected?: boolean;
  /** For a command: the programs of every use this step stands for. */
  readonly programs?: readonly Redacted[];
  readonly commits?: boolean;
  readonly source: UseSource;
  /** The number of the step it came after; absent when nothing earlier in the record carried the value. */
  readonly after?: number;
}

/** A delegation the agent made that reached something protected, and what came back from it. */
export interface FlowDelegated extends FlowStepCommon {
  readonly kind: 'delegated';
  readonly toAgentIndex?: number;
  readonly strength: ReturnStrength;
  readonly awaited?: true;
  /**
   * The crossing was forced by where the value turned up rather than read out of the reply: this record does not
   * hold the reply itself. Said in its own words, so the page never claims to have read what it did not.
   */
  readonly inferred?: true;
  readonly files: readonly Redacted[];
}

/** For a delegated agent, last: what came back from it, and into which agent. */
export interface FlowReturned extends FlowStepCommon {
  readonly kind: 'returned';
  readonly toAgentIndex?: number;
  readonly strength: ReturnStrength;
  readonly awaited?: true;
  /**
   * The crossing was forced by where the value turned up rather than read out of the reply: this record does not
   * hold the reply itself. Said in its own words, so the page never claims to have read what it did not.
   */
  readonly inferred?: true;
  readonly files: readonly Redacted[];
}
