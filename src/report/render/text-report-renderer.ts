// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PROVIDER_NAMES } from '../../core/session-format.ts';
import { paint, type Hue } from '../../shared/colour.ts';
import type { Renderer } from '../../shared/renderer.ts';
import { logoWidth, TAGLINE, terminalLogo } from '../../shared/terminal-logo.ts';
import { wrap } from '../../shared/wrap.ts';
import type {
  FindingStory,
  GraphAgent,
  ReportAction,
  ReportDelegation,
  ReportFinding,
  ReportModel,
  ReturnStatement,
  UseLanding,
  UseSource,
  UseStatement,
  WroteBefore,
} from '../report-model.ts';

const INDENT = '  ';
const DEEP = '    ';

/**
 * The lines the tree is drawn with. `--ascii` exists for a terminal whose `LANG` lacks UTF-8 (§7.5 constraint
 * 2); the shape has to survive the substitution, which is why the branch marks are the same width in both.
 */
const MARKS = {
  unicode: { branch: '├─ ', last: '└─ ', trunk: '│  ', clear: '   ', rule: '━' },
  ascii: { branch: '+- ', last: '`- ', trunk: '|  ', clear: '   ', rule: '-' },
} as const;

/** How many files a group of the summary shows before it says how many more there are (R7). */
const GROUP_LIMIT = 8;

/** Between a path and what is said about it. */
const GAP = '  ';

/** Narrower than this, a path column cuts too much to read, and every path takes a line of its own instead. */
const MIN_COLUMN = 12;

/** The outcome as a word, so that colour, when it comes, only ever repeats what is already written (R14). */
const OUTCOME_WORD: Readonly<Record<FindingStory['outcome'], string>> = {
  succeeded: 'reached',
  blocked: 'refused',
  unknown: 'outcome unknown',
};

/** The same outcome as a mark, so a column of rows can be read before its words are - never without them (R14). */
const OUTCOME_MARK: Readonly<Record<FindingStory['outcome'], string>> = {
  succeeded: '●',
  blocked: '○',
  unknown: '?',
};

/** A summary row's outcome mark and the space after it. */
const MARK_WIDTH = 2;

/** Under the first line of the headline, so the sentence reads as one block beside its mark. */
const HANG = '    ';

/** One agent drawn at its place in the tree. */
interface AgentRow {
  readonly prefix: string;
  readonly agent: GraphAgent;
}

/** A line of the tree: an agent, or something said under one. */
type GraphRow = AgentRow | { readonly prefix: string; readonly text: string };

/** What drawing the tree carries from one level to the next. */
interface TreeContext {
  readonly children: ReadonlyMap<number, readonly GraphAgent[]>;
  readonly drawn: Set<number>;
  readonly graph: ReportModel['graph'];
  readonly markUnresolved: boolean;
  /** Whether agents with nothing to say for themselves are said in one line rather than drawn one by one. */
  readonly fold: boolean;
}

/** How the terminal report is drawn. Every field defaults to off. */
export interface TextReportView {
  /** `+ - |` and plain punctuation, for a terminal whose LANG lacks UTF-8 (§7.5 constraint 2). */
  readonly ascii?: boolean;
  /** Every section in detail (R13). Without it the report is a summary whose last line says where the rest is. */
  readonly full?: boolean;
  /** Colour over words already written (R14). Ignored with `ascii`, which is for terminals trusted with ASCII alone. */
  readonly colour?: boolean;
}

/**
 * The §7.2 sections, in reading order: what was examined, what it adds up to, what happened per delegation,
 * what was found, and what could not be established.
 *
 * There is no verdict here and no hypothesis: judging a delegation is the detector's work, and the detector
 * does not exist until its measurement says it should (spec §6.5). The report states facts and where each one
 * was read from.
 *
 * **Two views of one model** (`specs/2026-09-15-findings-worth-reading.md` R5, R13). The summary is the default: on a real
 * session the detailed sections ran to 700 lines, and a gap printed below them was a gap nobody read. `--full`
 * prints those sections exactly as they were, and the summary's last line says so.
 */
export class TextReportRenderer implements Renderer<ReportModel> {
  readonly #width: number;
  readonly #marks: (typeof MARKS)[keyof typeof MARKS];
  readonly #ascii: boolean;
  readonly #full: boolean;
  readonly #colour: boolean;

  constructor(width: number, view: TextReportView = {}) {
    this.#width = width;
    this.#ascii = view.ascii === true;
    this.#full = view.full === true;
    this.#colour = view.colour === true && !this.#ascii;
    this.#marks = this.#ascii ? MARKS.ascii : MARKS.unicode;
  }

  render(report: ReportModel): string {
    const lines = this.#full ? this.#detailed(report) : this.#summarised(report);
    const body = this.#colour ? colourise(lines) : lines;
    const text = [...this.#masthead(report), '', ...body].join('\n');

    return this.#ascii ? toAscii(text) : text;
  }

  /**
   * The wordmark, and beside it what this report is about - the tool, the session and the policy - before a single
   * number (§7.5, "a header visible without scrolling"). A width too narrow for the words keeps the mark alone.
   */
  #masthead(report: ReportModel): string[] {
    const room = this.#width - logoWidth(this.#ascii);
    const about = [TAGLINE, `session ${report.scope.sessionId} · policy ${report.scope.policy.level}`];
    const beside = room < 20 ? [] : about.map((words) => fitWords(words, room, this.#ascii));

    return terminalLogo(beside, { colour: this.#colour, ascii: this.#ascii });
  }

  /** Every section, as the report printed them before it had a summary (R13). */
  #detailed(report: ReportModel): string[] {
    return [
      ...this.#headline(report),
      '',
      ...this.#graph(report, false),
      ...this.#stories(report),
      ...this.#returns(report),
      ...this.#uses(report),
      ...this.#summary(report),
      '',
      ...this.#scope(report),
      '',
      ...this.#secretShapes(report),
      ...this.#unattributed(report),
      ...this.#missing(report),
      ...this.#detail(report),
    ];
  }

  /**
   * What a reader takes in without scrolling far (R5): the answer, the shape, what could not be established, what
   * was reached, and the scope. The last line says where the rest is (R10), as flags to add rather than a command
   * to type: the command would read the newest session, not necessarily this one.
   */
  #summarised(report: ReportModel): string[] {
    return [
      ...this.#headline(report),
      '',
      ...this.#graph(report, true),
      ...this.#gaps(report),
      ...this.#reached(report),
      ...this.#scope(report),
      '',
      ...wrap('Every detail: add --full · the page: add --open', this.#width),
      '',
    ];
  }

  /** The line above and below the answer. It is drawn with the same characters the tree is (§7.5 constraint 2). */
  #rule(): string {
    return this.#marks.rule.repeat(Math.max(this.#width, 8));
  }

  /** The answer, before anything else. Someone who reads four lines has still been told what happened. */
  #headline(report: ReportModel): string[] {
    const { headline } = report;
    const mark = headline.severity === 'clear' ? '✓' : '!';

    return [
      this.#rule(),
      ...this.#hanging(` ${mark}  `, `${headline.sentence}`),
      ...(headline.caveat === undefined ? [] : this.#hanging(HANG, `${headline.caveat}`)),
      this.#rule(),
    ];
  }

  /**
   * The chain, per file: who reached it, what they had been asked to do, and how. The instruction comes first
   * because it is the cause - the whole argument of this tool is that the cause is in the delegation, not in
   * the call that ends up in an audit log.
   */
  #stories(report: ReportModel): string[] {
    if (report.stories.length === 0) return [];

    return [
      heading('What was reached'),
      '',
      ...[...byCall(report.stories).values()].flatMap((group) => this.#call(group)),
    ];
  }

  /**
   * One call, and the files it reached (the maintainer's choice of 2026-09-15, on a real session). A search that
   * returns four protected paths is one thing that happened: printing who, what they were asked, what they ran and
   * what they wrote four times over made the page read as four incidents.
   */
  #call(group: readonly FindingStory[]): string[] {
    const lead = group[0] as FindingStory;
    const files = group.map((story) => `${story.path}${story.occurrences > 1 ? `  (${story.occurrences}×)` : ''}`);

    return [
      `${INDENT}${group.length === 1 ? files[0] : `${group.length} files, in one call`}`,
      `${DEEP}${lead.source === 'result' ? 'appeared in the result' : 'named by the call'} · ${lead.outcome}${printed(group.reduce((sum, story) => sum + (story.lines ?? 0), 0))}`,
      ...(group.length === 1
        ? []
        : files.map((file, index) => `${DEEP}${index === 0 ? 'files    ' : '         '}${file}`)),
      `${DEEP}who      ${lead.who}`,
      ...(lead.askedTo === undefined
        ? []
        // The label is put on the first line below; wrapping it in as well printed it twice - `asked to asked to`.
        : wrap(`${lead.askedTo}`, this.#width - DEEP.length - 9).map((line, index) =>
            index === 0 ? `${DEEP}asked to ${line}` : `${DEEP}         ${line}`,
          )),
      `${DEEP}did      ${lead.did}  [${lead.evidence}]`,
      ...this.#wrote(lead.wrote),
      '',
    ];
  }

  /**
   * What the agent wrote immediately before the call (`specs/2026-09-15-why-this-call.md` R6-R8), at the level §5.1 settles:
   * one sentence, or the fact alone. It is introduced as what was written, never as a reason - naming it one
   * would be the verdict this tool does not make.
   */
  #wrote(wrote: WroteBefore): string[] {
    // Nothing written is nothing to count and nothing to point at: a record reference here would point at a silence.
    // A block the record kept empty is said as that, because it is not the same fact.
    if (wrote.size === 0) {
      return [
        `${DEEP}wrote    ${wrote.blank === 0 ? 'nothing before this call' : `no words before this call - the record kept ${wrote.blank} of them empty`}`,
      ];
    }
    const covers = wrote.covers > 1 ? ` · stands before ${wrote.covers} calls` : '';
    const words =
      wrote.sentence !== undefined
        ? `"${wrote.sentence}"${wrote.cut === true ? ' (cut)' : ''} · ${wrote.kind === 'reasoning' ? 'its own working-out' : 'a message to you'}`
        : wrote.carried.length > 0
          ? `not shown - these words carried a value from ${wrote.carried.join(', ')}`
          : `${wrote.size} characters, not shown in this view`;

    // The label is put on after wrapping: `wrap` collapses runs of spaces, and the column it keeps is the point.
    return wrap(`${words}${covers}  [${wrote.evidence}]`, this.#width - DEEP.length - 9).map((line, index) =>
      index === 0 ? `${DEEP}wrote    ${line}` : `${DEEP}         ${line}`,
    );
  }

  /**
   * The session as a shape: who was asked for what, and which of them reached something. The graph orients and
   * the list below it expands (§7.5) - which is why it comes first and says as little per agent as it can.
   *
   * An indented tree, not a fan-out: one real session holds fifteen agents, and at that count a fan-out is
   * unreadable at any width (lesson L006). Nothing here is carried by colour: the text is the whole signal, so
   * a redirected report says the same as one on a terminal.
   *
   * In the summary, more than one agent with no recorded delegation is said once, under the tree, by number
   * (R12): the same sentence under every node is a column of repetition a reader learns to skip.
   */
  #graph(report: ReportModel, summarised: boolean): string[] {
    const { graph } = report;
    if (graph.agents.length === 0) return [];

    const known = new Set([graph.main.index, ...graph.agents.map((agent) => agent.index)]);
    const children = new Map<number, GraphAgent[]>();
    for (const agent of graph.agents) {
      // A parent that cannot be established is not invented: the agent hangs from the session and says so.
      const parent = agent.parentIndex !== undefined && known.has(agent.parentIndex) ? agent.parentIndex : undefined;
      const key = parent ?? graph.main.index;
      children.set(key, [...(children.get(key) ?? []), agent]);
    }

    const missing = graph.totalAgents - graph.agents.length - 1;
    const unresolved = graph.agents.filter((agent) => agent.parentIndex === undefined);
    const once = summarised && unresolved.length > 1;
    const tree: TreeContext = { children, drawn: new Set<number>(), graph, markUnresolved: !once, fold: summarised };

    return [
      heading('Who ran, and what they reached'),
      '',
      ...this.#tree([{ prefix: INDENT, agent: graph.main }, ...this.#branches(graph.main.index, INDENT, tree)]),
      ...(missing > 0 ? [`${INDENT}${this.#marks.clear}… and ${missing} more not drawn`] : []),
      ...(once ? this.#item(`nothing recorded what asked for ${agentsNamed(unresolved)}`) : []),
      '',
    ];
  }

  /**
   * The agents below `parent`, in the order they ran. In the summary, two or more that reached, refused, returned
   * and wrote nothing, and have no agent below them, are said in one line: R12's reasoning one step further. On a
   * real session nine rows of fifteen said only how many actions an agent took, and buried the six that mattered.
   */
  #branches(parent: number, prefix: string, tree: TreeContext): GraphRow[] {
    const { children, drawn, graph, markUnresolved, fold } = tree;
    const here = (children.get(parent) ?? []).filter((agent) => !drawn.has(agent.index));
    const quiet = fold ? here.filter((agent) => isQuiet(agent, parent, tree)) : [];
    const folded = new Set(quiet.length > 1 ? quiet.map((agent) => agent.index) : []);
    const drawnHere = here.filter((agent) => !folded.has(agent.index));
    for (const index of folded) drawn.add(index);

    const rows = drawnHere.flatMap((agent, position): GraphRow[] => {
      if (drawn.has(agent.index)) return [];
      drawn.add(agent.index);

      const last = position === drawnHere.length - 1 && folded.size === 0;
      const mark = last ? this.#marks.last : this.#marks.branch;
      const below = prefix + (last ? this.#marks.clear : this.#marks.trunk);
      const unresolved = agent.parentIndex === undefined && parent === graph.main.index;

      return [
        { prefix: `${prefix}${mark}`, agent },
        ...(unresolved && markUnresolved
          ? [{ prefix: `${below}${INDENT}`, text: 'nothing recorded what asked for this agent' }]
          : []),
        ...this.#branches(agent.index, below, tree),
      ];
    });

    if (folded.size === 0) return rows;
    return [
      ...rows,
      {
        prefix: `${prefix}${this.#marks.last}`,
        text: `${quiet.length} ${plural(quiet.length, 'agent')} reached nothing: ${agentsNamed(quiet)}`,
      },
    ];
  }

  /**
   * The tree in columns, so an eye can run down "reached" without reading every line. When the columns do not fit
   * the width, every agent is one line of its own words instead (§7.5 constraint 1): the same content, never a
   * squeezed table.
   */
  #tree(rows: readonly GraphRow[]): string[] {
    const agents = rows.flatMap((row) => ('agent' in row ? [row] : []));
    const digits = Math.max(...agents.map(({ agent }) => String(agent.actions).length));
    const cells = new Map(agents.map((row) => [row, nodeCells(row.agent, digits)] as const));
    const title = Math.max(...agents.map((row) => `${row.prefix}${agentTitle(row.agent)}`.length));
    const widths = [0, 1, 2, 3].map((column) => Math.max(0, ...agents.map((row) => cells.get(row)?.[column]?.length ?? 0)));

    const columned = (row: AgentRow): string =>
      [
        `${row.prefix}${agentTitle(row.agent)}`.padEnd(title),
        ...(cells.get(row) ?? []).flatMap((cell, column) =>
          (widths[column] ?? 0) === 0 ? [] : [cell.padEnd(widths[column] ?? 0)],
        ),
      ]
        .join(GAP)
        .trimEnd();
    const fits = agents.every((row) => columned(row).length <= this.#width);

    return rows.flatMap((row) => {
      if (!('agent' in row)) return this.#hanging(row.prefix, row.text);
      return fits ? [columned(row)] : this.#hanging(row.prefix, nodeLine(row.agent));
    });
  }

  /** Text after a prefix, wrapped under itself rather than back at the margin. */
  #hanging(prefix: string, text: string): string[] {
    return wrap(text, Math.max(this.#width - prefix.length, 20)).map(
      (line, index) => `${index === 0 ? prefix : ' '.repeat(prefix.length)}${line}`,
    );
  }

  /**
   * What could not be established, before what was reached (R8). A gap printed below the findings is read after
   * the reader has decided the report is complete, which §5.3 of the main specification says it must not read as.
   */
  #gaps(report: ReportModel): string[] {
    const { summary, scope } = report;
    const unknown = summary.byOutcome.unknown;
    const unattributed = summary.unattributedAgents;
    const lines = [
      ...(scope.completeness === 'complete' ? [] : [`evidence: ${scope.completeness}`]),
      ...(unknown === 0
        ? []
        : [`no outcome was established for ${unknown} of ${summary.actions} ${plural(summary.actions, 'action')}`]),
      ...report.missing.map((item) => `${item}`),
      // R9: a count, and where to see who they were.
      ...(unattributed === 0
        ? []
        : [
            `${unattributed} ${plural(unattributed, 'agent')} ran that nothing in the transcript asked for — ` +
              'add --full to see what they did',
          ]),
    ];

    return [
      heading('What could not be established'),
      '',
      ...(lines.length === 0 ? [`${INDENT}nothing: every source was read`] : lines.flatMap((line) => this.#item(line))),
      '',
    ];
  }

  /**
   * What was reached, as a list to run an eye down (R6, R7): one line per file, grouped under the agent that
   * reached it, at most eight to a group. A line starts with a mark for its outcome - `●` reached, `○` refused, `?`
   * not known - beside the word that says the same (R14). The chain behind each line - what the agent ran, and
   * which record says so - is what `--full` is for.
   */
  #reached(report: ReportModel): string[] {
    const { stories, graph, summary } = report;
    // R9: which formats came back is detail; that something did is not.
    const keyFormats =
      summary.secretShapes === 0
        ? []
        : this.#item(
            `${summary.secretShapes} ${plural(summary.secretShapes, 'result')} carried something shaped like a key — ` +
              'replaced, never shown; add --full for the formats',
          );
    if (stories.length === 0) {
      return [heading('What was reached'), '', `${INDENT}nothing this policy protects`, ...keyFormats, ''];
    }

    const groups = new Map<string, FindingStory[]>();
    for (const story of stories) {
      const key = story.agentIndex === undefined ? `who ${story.who}` : `agent ${story.agentIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), story]);
    }
    const listed = [...groups.values()].map((group) => ({ first: group[0] as FindingStory, rows: reachedRows(group) }));
    const shown = listed.flatMap(({ rows }) => rows.slice(0, GROUP_LIMIT));
    const columns: SaidColumns = {
      how: Math.max(...shown.map((row) => row.how.length)),
      outcome: Math.max(...shown.map((row) => OUTCOME_WORD[row.outcome].length)),
    };
    const column = Math.min(
      Math.max(...shown.map((row) => row.path.length)),
      this.#width - DEEP.length - MARK_WIDTH - GAP.length - Math.max(...shown.map((row) => said(row, columns).length)),
    );
    const fitted =
      column < MIN_COLUMN
        ? new Map<string, string | undefined>()
        : fitPaths(shown.map((row) => row.path), column, this.#ascii);
    const told = new Set<string>();

    return [
      heading('What was reached'),
      '',
      ...listed.flatMap(({ first, rows }) => [
        ...this.#whoReached(first, graph),
        ...rows.slice(0, GROUP_LIMIT).flatMap((row) => this.#row(row, fitted.get(row.path), column, columns)),
        ...(rows.length > GROUP_LIMIT ? [`${DEEP}… and ${rows.length - GROUP_LIMIT} more — add --full to see them`] : []),
        ...this.#cameBackFrom(report, first.agentIndex),
        ...this.#appearedAfter(report, rows, told),
        '',
      ]),
      // An agent that reached nothing itself can still hand back what an agent below it reached (R8).
      ...[...new Set(report.returns.map((entry) => entry.agentIndex))]
        .filter((index) => index !== undefined && !stories.some((story) => story.agentIndex === index))
        .flatMap((index) => [`${INDENT}${titleOf(graph, index)}`, ...this.#cameBackFrom(report, index), '']),
      ...keyFormats,
      ...(keyFormats.length === 0 ? [] : ['']),
    ];
  }

  /** R12: what came back from this agent, in words that need no colour to be read. */
  #cameBackFrom(report: ReportModel, agentIndex: number | undefined): string[] {
    return report.returns
      .filter((entry) => agentIndex !== undefined && entry.agentIndex === agentIndex)
      .flatMap((entry) =>
        wrap(`${cameBack(entry, titleOf(report.graph, entry.parentAgentIndex))}${written(entry)}`, this.#width - DEEP.length - MARK_WIDTH).map(
          (line, index) => `${DEEP}${index === 0 ? '↩ ' : '  '}${line}`,
        ),
      );
  }

  /**
   * where-the-value-went R12: under the files a group reached, where a value from them appeared after - the files it
   * was written into, the commands that carried it, the agents whose words did. Once for each file, in words alone.
   */
  #appearedAfter(report: ReportModel, rows: readonly ReachedRow[], told: Set<string>): string[] {
    const paths = new Set(rows.map((row) => row.path).filter((path) => !told.has(path)));
    for (const path of paths) told.add(path);
    const words = appearedAfter(report.uses.filter((use) => use.files.some((file) => paths.has(`${file}`))), report.graph);

    return words === undefined
      ? []
      : wrap(`then the same value was in: ${words}`, this.#width - DEEP.length - MARK_WIDTH).map(
          (line, index) => `${DEEP}${index === 0 ? '→ ' : '  '}${line}`,
        );
  }

  /** R13: every return, where it came back to, and the record that says so. */
  #returns(report: ReportModel): string[] {
    if (report.returns.length === 0) return [];
    const { graph } = report;

    return [
      heading('What the agents answered'),
      '',
      ...report.returns.flatMap((entry) => [
        `${INDENT}${titleOf(graph, entry.agentIndex)}, answering ${titleOf(graph, entry.parentAgentIndex)}`,
        ...wrap(`${returnInFull(entry)}${written(entry)}`, this.#width - DEEP.length).map((line) => `${DEEP}${line}`),
        `${DEEP}[${entry.evidence}]`,
        '',
      ]),
    ];
  }

  /** where-the-value-went R12: every use, grouped by where it landed, with its agent, what it came after and its record. */
  #uses(report: ReportModel): string[] {
    if (report.uses.length === 0) return [];
    const { graph } = report;

    return [
      heading('Where the same value was afterwards'),
      '',
      ...LANDINGS.flatMap((landed) => {
        const uses = report.uses.filter((use) => use.landed === landed);
        return uses.length === 0
          ? []
          : [
              `${INDENT}${LANDING_WORDS[landed]}`,
              ...uses.flatMap((use) => [
                ...wrap(useInFull(use, graph), this.#width - DEEP.length).map((line) => `${DEEP}${line}`),
                `${DEEP}[${use.evidence}]`,
              ]),
              '',
            ];
      }),
    ];
  }

  /** Who reached the files below, named as the graph names them, and what they had been asked to do. */
  #whoReached(story: FindingStory, graph: ReportModel['graph']): string[] {
    const node = [graph.main, ...graph.agents].find((agent) => agent.index === story.agentIndex);
    const name = node === undefined ? `${story.who}` : agentTitle(node);
    const heading = story.askedTo === undefined ? name : `${name} — asked to ${story.askedTo}`;

    return wrap(heading, this.#width - DEEP.length).map((line, index) => `${index === 0 ? INDENT : DEEP}${line}`);
  }

  /** One file, one line. A path no cut can keep apart from the others is given a line of its own instead (R11). */
  #row(row: ReachedRow, fitted: string | undefined, column: number, columns: SaidColumns): string[] {
    const mark = OUTCOME_MARK[row.outcome];
    if (fitted === undefined) {
      return [
        ...wrap(row.path, this.#width - DEEP.length - MARK_WIDTH).map(
          (line, index) => `${DEEP}${index === 0 ? `${mark} ` : '  '}${line}`,
        ),
        `${DEEP}  ${GAP}${said(row, columns)}`,
      ];
    }
    return [`${DEEP}${mark} ${fitted.padEnd(column)}${GAP}${said(row, columns)}`];
  }

  /** A line of a list, wrapped under itself rather than back at the margin. */
  #item(text: string): string[] {
    return wrap(text, this.#width - DEEP.length).map((line, index) => `${index === 0 ? INDENT : DEEP}${line}`);
  }

  /** Everything that is not a finding, as counts. An inventory of 740 actions is not a report. */
  #detail(report: ReportModel): string[] {
    const tools = Object.entries(report.summary.tools).sort(([, a], [, b]) => b - a);
    if (tools.length === 0) return [];

    return [
      heading('Everything the session did'),
      `${INDENT}${tools.map(([tool, count]) => `${tool} ${count}`).join(' · ')}`,
      `${INDENT}${report.delegations.length} delegations, listed above only where they reached something.`,
      '',
    ];
  }

  #scope(report: ReportModel): string[] {
    const { scope } = report;
    const { redaction } = scope;

    // Every field is wrapped: a policy file can sit at a long path, and a header that runs off the page is the
    // first thing a reader stops trusting.
    return [
      // X28: which AI the conversation was with, as the page and the list say it.
      ...this.#field('session', `${scope.sessionId} · ${PROVIDER_NAMES[scope.provider]}`),
      ...this.#field(
        'policy',
        `${scope.policy.level} · ${scope.policy.patterns} patterns · ${scope.policy.exceptions} exceptions`,
      ),
      ...this.#field('source', scope.policy.origin),
      ...this.#field('paths', describeView(scope.paths.shared)),
      ...this.#field('project root', describeRoot(scope.paths)),
      ...this.#field(
        'redaction',
        `ruleset v${redaction.rulesetVersion} · ${redaction.redactions} replacements of ` +
          `${redaction.distinctValues} distinct values · ${redaction.protectedContents} protected contents`,
      ),
      ...(redaction.missingClasses.length === 0
        ? []
        : this.#field('not implemented', redaction.missingClasses.join(', '))),
    ];
  }

  /** `label: value`, with continuation lines under the value rather than under the label. */
  #field(label: string, value: string): string[] {
    const prefix = `${label}: `;
    const lines = wrap(value, Math.max(this.#width - prefix.length, 20));

    return lines.map((line, index) => (index === 0 ? `${prefix}${line}` : `${' '.repeat(prefix.length)}${line}`));
  }

  #summary(report: ReportModel): string[] {
    const { summary, scope } = report;
    const { byOutcome } = summary;

    return [
      heading('The session in numbers'),
      `${INDENT}${summary.agents} agents ran, ${summary.delegations} of them asked for by a recorded delegation`,
      `${INDENT}${summary.actions} actions: ${byOutcome.succeeded} worked, ${byOutcome.blocked} were refused, ` +
        `${byOutcome.unknown} could not be established`,
      `${INDENT}evidence: ${scope.completeness}`,
      ...(summary.unattributedAgents === 0
        ? []
        : [`${INDENT}${summary.unattributedAgents} agents ran that nothing in the transcript asked for — see below`]),
      ...(summary.secretShapes === 0
        ? []
        : [`${INDENT}${summary.secretShapes} results carried something shaped like a key — replaced, never shown`]),
    ];
  }

  #mainAgent(report: ReportModel): string[] {
    if (report.mainAgent.length === 0) return [];
    return ['The session itself', '', ...report.mainAgent.map((action) => actionLine(action)), ''];
  }

  #sequence(report: ReportModel): string[] {
    if (report.delegations.length === 0) return ['Delegations', `${INDENT}none`, ''];
    return ['Delegations', '', ...report.delegations.flatMap((delegation, index) => this.#delegation(delegation, index))];
  }

  #delegation(delegation: ReportDelegation, index: number): string[] {
    const heading = `${String(index + 1).padStart(2, '0')} · ${delegation.id}`;
    const type = delegation.agentType === undefined ? 'agent type not recorded' : `${delegation.agentType}`;
    const depth = delegation.depth === undefined ? 'depth not recorded' : `depth ${delegation.depth}`;

    return [
      `${INDENT}${heading}`,
      `${INDENT}${type} · ${depth} · evidence ${delegation.completeness}`,
      '',
      ...(delegation.description === undefined
        ? [`${DEEP}(no description was recorded for this delegation)`]
        : wrap(delegation.description, this.#width - DEEP.length).map((line) => `${DEEP}${line}`)),
      `${DEEP}instruction: ${describeInstruction(delegation.instructionSize)}`,
      '',
      ...(delegation.actions.length === 0
        ? [`${DEEP}no actions recorded for this agent`]
        : delegation.actions.map((action) => actionLine(action))),
      '',
    ];
  }

  /**
   * An agent ran and nothing says who asked for it. Leaving it out would make a session that delegated three
   * times read as one that delegated none - the failure this tool exists to prevent, in its own output.
   */
  #unattributed(report: ReportModel): string[] {
    if (report.unattributedAgents.length === 0) return [];

    return [
      heading('Agents with no recorded delegation'),
      // Corrected 2026-09-14: written as one line, it ran to 106 characters at 100 columns on a real session.
      ...wrap(
        'Started by a route that records no call - a skill, for instance - so what asked for them cannot be read.',
        this.#width - INDENT.length,
      ).map((line) => `${INDENT}${line}`),
      '',
      ...report.unattributedAgents.flatMap((agent) => [
        `${INDENT}${agent.id} · ${agent.type ?? 'type not recorded'} · ` +
          `${agent.depth === undefined ? 'depth not recorded' : `depth ${agent.depth}`}`,
        ...(agent.actions.length === 0
          ? [`${DEEP}no actions recorded for this agent`]
          : agent.actions.map((action) => actionLine(action))),
        '',
      ]),
    ];
  }

  #findings(report: ReportModel): string[] {
    if (report.findings.length === 0) {
      return ['Protected paths', `${INDENT}none reached under this policy`, ''];
    }
    return ['Protected paths', '', ...report.findings.flatMap((finding) => this.#finding(finding)), ''];
  }

  #finding(finding: ReportFinding): string[] {
    // Where it was named is the whole point: `result` means no call parameter mentioned it.
    const named = finding.source === 'input' ? 'named by the call' : 'reached through the result';

    return [
      `${INDENT}${finding.path}`,
      `${DEEP}${finding.tool} — ${finding.outcome} · ${named}`,
      `${DEEP}matched ${finding.pattern} · [${finding.evidence}]`,
    ];
  }

  /** What kind of key came back, never which one. A path was not needed for this to be worth knowing. */
  #secretShapes(report: ReportModel): string[] {
    if (report.secretShapes.length === 0) return [];

    return [
      heading('Recognised key formats in results'),
      '',
      ...report.secretShapes.flatMap((shape) => [
        `${INDENT}${shape.classes.join(', ')}`,
        `${DEEP}${shape.tool} — ${shape.outcome} · [${shape.evidence}]`,
      ]),
      '',
    ];
  }

  #missing(report: ReportModel): string[] {
    if (report.missing.length === 0) return [heading('Missing data'), `${INDENT}nothing: every source was read`, ''];
    return [heading('Missing data'), ...report.missing.map((item) => `${INDENT}${item}`), ''];
  }
}

function actionLine(action: ReportAction): string {
  return (
    `${DEEP}${String(action.sequence).padStart(3)}. ${action.tool} — ${action.outcome}` +
    `${action.target === undefined ? '' : ` → ${action.target}`}  [${action.evidence}]`
  );
}

/** Which view a reader is holding. A short path means one thing under `--share` and another without it. */
function describeView(shared: boolean): string {
  return shared
    ? 'SHARED — relative to the project root, nothing above it appears. This reduces exposure; it does not anonymise'
    : 'full — paths as written';
}

/**
 * Why a path looks the way it does. With no root the two views do opposite things - one shows every path as
 * written, the other can place none of them inside a project and shows every absolute one as a category - so
 * the sentence has to know which view it is in. Saying "shown as written" above a body of categories was the
 * header contradicting the report under it.
 */
function describeRoot(paths: ReportModel['scope']['paths']): string {
  if (paths.root === 'known') return 'established from the session; paths under it are shown relative to it';

  const consequence = paths.shared
    ? 'so nothing can be placed inside the project: every path that says where it starts is shown as a category'
    : 'so paths are shown as written';
  const cause =
    paths.root === 'ambiguous'
      ? `the session recorded ${paths.workingDirectories ?? 0} working directories, so no single root describes it`
      : 'no record carried one';

  return `NOT established — ${cause}, ${consequence}`;
}

/**
 * An agent in one line. What it reached is said only when it reached something: with fifteen agents, repeating
 * "nothing reached" on fourteen of them buries the one row a reader is looking for.
 */
function nodeLine(agent: GraphAgent): string {
  return [
    agentTitle(agent),
    `${agent.actions} ${plural(agent.actions, 'action')}`,
    ...(agent.filesReached === 0 ? [] : [`${agent.filesReached} ${plural(agent.filesReached, 'file')} reached`]),
    ...(agent.refusedAttempts === 0 ? [] : [`${agent.refusedAttempts} refused`]),
    ...(agent.returned === undefined ? [] : [`gave the ${agent.returned} back`]),
    ...(agent.wroteValue === true ? ['wrote the value'] : []),
    ...(agent.wroteOnward === true ? ['wrote the value into files'] : []),
  ].join(' · ');
}

/** What the graph and the summary both call an agent, so that a reader can find one in the other. */
function agentTitle(agent: GraphAgent): string {
  // The session's own agent has a name rather than a number, and naming its kind as well says it twice.
  const named = agent.ordinal === undefined;
  const name = named ? 'the session itself' : `Agent ${agent.ordinal}`;

  return named || agent.type === undefined ? name : `${name} · ${agent.type}`;
}

/**
 * Findings that came out of one call, kept together and in the order they were ranked. A call is named by the
 * record its evidence points at, so two calls that reached the same file stay apart, and one call that reached
 * four files is one block. The source and the outcome are part of the key: a call that named one file and found
 * another in what came back states two different things.
 */
function byCall(stories: readonly FindingStory[]): Map<string, FindingStory[]> {
  const groups = new Map<string, FindingStory[]>();
  for (const story of stories) {
    const key = JSON.stringify([story.agentIndex, `${story.evidence}`, story.source, story.outcome]);
    groups.set(key, [...(groups.get(key) ?? []), story]);
  }
  return groups;
}

/** An agent by index, named as the graph names it. */
function titleOf(graph: ReportModel['graph'], index: number | undefined): string {
  const node = [graph.main, ...graph.agents].find((agent) => agent.index === index);
  return node === undefined ? 'an agent this report does not hold' : agentTitle(node);
}

/**
 * The files a value is said to have come from. `or` where a call printed several protected files at once and the
 * transcript does not say which of them the line came from - naming them all would name a file it never held.
 */
function filesOf(paths: readonly string[], entry: ReturnStatement): string {
  return entry.fileUncertain === true && paths.length > 1 ? paths.join(' or ') : paths.join(', ');
}

/** What an agent's answer carried, in plain words (R12): to whom when the summary says it, the strength first. */
function cameBack(entry: ReturnStatement, parent?: string): string {
  const answer = `its answer${parent === undefined ? '' : ` to ${parent}`}`;
  switch (entry.strength) {
    case 'value':
      return `${answer} carried a value from ${filesOf(entry.paths, entry)}`;
    case 'path':
      // A path in an answer was read out of the answer itself, so it names its file exactly.
      return `${answer} named ${entry.paths.join(', ')}`;
    case 'report':
      return (
        `${answer} carried no traced value (${entry.reportLength === undefined ? 'length unknown' : `${entry.reportLength} characters`}; ` +
        `it reached ${entry.filesReached} protected ${plural(entry.filesReached, 'file')})`
      );
    case 'unknown':
      return entry.awaited === true ? `it ran in the background, and ${answer} never arrived` : `${answer} could not be read`;
  }
}

/** R4b: a value the agent wrote in its own messages, said beside its answer unless the answer carried one anyway. */
function written(entry: ReturnStatement): string {
  return entry.strength === 'value' || entry.writtenFrom.length === 0
    ? ''
    : `; it also wrote a value from ${filesOf(entry.writtenFrom, entry)} in its own messages`;
}

/** What an answer carried, as `--full` says it: what the statement rests on, in plain words. */
function returnInFull(entry: ReturnStatement): string {
  switch (entry.strength) {
    case 'value':
      return `its answer carried a value from a protected file · ${filesOf(entry.paths, entry)}`;
    case 'path':
      return `its answer named a protected file it had reached · ${entry.paths.join(', ')}`;
    case 'report':
    case 'unknown':
      return cameBack(entry);
  }
}

/** The order `--full` lists uses in: what outlives the session first, what stayed in messages last. */
const LANDINGS: readonly UseLanding[] = ['file', 'command', 'delegation', 'said', 'reasoning', 'call'];

const LANDING_WORDS: Readonly<Record<UseLanding, string>> = {
  file: 'In a file it wrote',
  command: 'In a command',
  delegation: 'In instructions to another agent',
  said: 'In its own messages',
  reasoning: 'In its reasoning',
  call: 'In another call',
};

/** What came before a use, in the agent's own record (R8), in plain words. Nothing earlier is never said to be the user. */
const SOURCE_WORDS: Readonly<Record<UseSource, string>> = {
  read: 'after it read that file itself',
  returned: "after another agent's answer carried it",
  unprotected: 'after a file that is not protected showed it',
  delivered: 'after output it was given showed it, from no call the record names',
  none: 'nothing earlier in its record had it',
};

/** Where the same value was afterwards, as the summary says it (R12): files, commands, instructions, messages. */
function appearedAfter(uses: readonly UseStatement[], graph: ReportModel['graph']): string | undefined {
  if (uses.length === 0) return undefined;
  const onward = uses.filter((use) => use.landed === 'file' && use.intoProtected !== true);
  const files = [...new Set(onward.flatMap((use) => (use.targets ?? []).map(String)))];
  const commands = uses.filter((use) => use.landed === 'command');
  const programs = [...new Set(commands.flatMap((use) => (use.programs ?? []).map(String)))];
  const handed = uses.filter((use) => use.landed === 'delegation').length;
  const spoken = uses.filter((use) => use.landed === 'said' || use.landed === 'reasoning');
  const speakers = [...new Set(spoken.map((use) => use.agentIndex))].map((index) => titleOf(graph, index));
  const rest = uses.length - onward.length - commands.length - handed - spoken.length;

  const parts = [
    ...(files.length === 0
      ? []
      : [`${files.length} ${plural(files.length, 'file')} that ${files.length === 1 ? 'is' : 'are'} not protected (${files.join(', ')})`]),
    ...(commands.length === 0
      ? []
      : [`${commands.length} ${plural(commands.length, 'command')}${programs.length === 0 ? '' : ` (${programs.join(', ')})`}`]),
    ...(handed === 0 ? [] : [`instructions to ${handed} ${plural(handed, 'agent')}`]),
    ...(speakers.length === 0
      ? []
      : [`messages of ${speakers.length === 1 ? speakers[0] : `${speakers.slice(0, -1).join(', ')} and ${speakers[speakers.length - 1]}`}`]),
    ...(rest === 0 ? [] : [`${rest} more (add --full)`]),
  ];
  return parts.join(' · ');
}

/** One use, as `--full` says it: whose, from which file, where, and what came before it. */
function useInFull(use: UseStatement, graph: ReportModel['graph']): string {
  const from = use.fileUncertain === true && use.files.length > 1 ? use.files.join(' or ') : use.files.join(', ');
  const programs = (use.programs ?? []).length === 0 ? '' : ` (${(use.programs ?? []).join(', ')})`;
  const where =
    use.landed === 'file'
      ? ` · into ${(use.targets ?? []).join(', ')}${use.intoProtected === true ? ' (a protected file)' : ''}`
      : use.landed === 'command'
        ? ` · in ${use.commits === true ? 'a command that commits' : 'a command'}${programs}`
        : '';
  const named = use.sourceTargets === undefined ? '' : ` (${use.sourceTargets.join(', ')})`;

  return `${titleOf(graph, use.agentIndex)} · value from ${from}${where} · ${SOURCE_WORDS[use.source]}${named}`;
}

/** `Agents 1, 3 and 4`, by the numbers the graph draws them with. */
function agentsNamed(agents: readonly GraphAgent[]): string {
  const ordinals = agents.map((agent) => agent.ordinal ?? 0).sort((first, second) => first - second);
  const last = ordinals.pop();

  return ordinals.length === 0 ? `Agent ${last}` : `Agents ${ordinals.join(', ')} and ${last}`;
}

/** A section's heading, marked so it stands apart from the lines under it. `--ascii` drops the mark. */
function heading(text: string): string {
  return `▍${text}`;
}

/** Words cut to a width, marked where they were cut. */
function fitWords(words: string, width: number, ascii: boolean): string {
  const mark = ascii ? '...' : '…';
  return words.length <= width ? words : `${words.slice(0, Math.max(width - mark.length, 0))}${mark}`;
}

/** An agent's row of the tree, column by column: actions, files reached, refused attempts, what came back. */
function nodeCells(agent: GraphAgent, digits: number): readonly string[] {
  return [
    `${String(agent.actions).padStart(digits)} ${plural(agent.actions, 'action')}`,
    agent.filesReached === 0 ? '' : `${agent.filesReached} ${plural(agent.filesReached, 'file')} reached`,
    agent.refusedAttempts === 0 ? '' : `${agent.refusedAttempts} refused`,
    [
      ...(agent.returned === undefined ? [] : [`gave the ${agent.returned} back`]),
      ...(agent.wroteValue === true ? ['wrote the value'] : []),
      ...(agent.wroteOnward === true ? ['wrote the value into files'] : []),
    ].join(' · '),
  ];
}

/** An agent with nothing to say for itself and no agent below it, which does not need a line of its own. */
function isQuiet(agent: GraphAgent, parent: number, tree: TreeContext): boolean {
  const unresolved = agent.parentIndex === undefined && parent === tree.graph.main.index;
  return (
    agent.filesReached === 0 &&
    agent.refusedAttempts === 0 &&
    agent.returned === undefined &&
    agent.wroteValue !== true &&
    (tree.children.get(agent.index) ?? []).length === 0 &&
    !(unresolved && tree.markUnresolved)
  );
}

/** The widths `said` aligns to, measured over every row the page shows. */
interface SaidColumns {
  readonly how: number;
  readonly outcome: number;
}

/** Both routes to one file, said in one line rather than in two that read as a duplicate. */
const BOTH_WAYS = 'named and in a result';

/** One line of the summary: a file, how it was reached, what came of it, and how often. */
interface ReachedRow {
  readonly path: string;
  readonly how: string;
  readonly outcome: FindingStory['outcome'];
  readonly occurrences: number;
}

function howOf(story: FindingStory): string {
  return story.source === 'result' ? 'in a result' : 'named';
}

/** H10 of `search-hits-are-reads`: a search's hit lines are the file's text, so the count is said beside how. */
function printed(lines: number): string {
  return lines === 0 ? '' : ` · ${lines} ${plural(lines, 'line')} printed`;
}

/**
 * R6: one line per file. The model keeps a story per route - a file named by a call, and the same file seen again in
 * a result, each with its own evidence - which is what `--full` and the page show. In a list to run an eye down the
 * two read as a duplicate, so here they are one line that says both routes. **Outcomes are never merged:** reached
 * and refused for the same file are the two facts a reader came for.
 */
function reachedRows(stories: readonly FindingStory[]): ReachedRow[] {
  const rows = new Map<string, ReachedRow>();
  const lines = new Map<string, number>();

  for (const story of stories) {
    const key = `${story.outcome} ${story.path}`;
    const seen = rows.get(key);
    const how = howOf(story);
    rows.set(
      key,
      seen === undefined
        ? { path: `${story.path}`, how, outcome: story.outcome, occurrences: story.occurrences }
        : { ...seen, how: seen.how === how ? seen.how : BOTH_WAYS, occurrences: seen.occurrences + story.occurrences },
    );
    lines.set(key, (lines.get(key) ?? 0) + (story.lines ?? 0));
  }
  return [...rows].map(([key, row]) => ({ ...row, how: row.how + printed(lines.get(key) ?? 0) }));
}

/** What R6 says of a file after its path, in columns: how it was reached, what came of it, and how often. */
function said(row: ReachedRow, columns: SaidColumns): string {
  const outcome = OUTCOME_WORD[row.outcome];
  if (row.occurrences <= 1) return [row.how.padEnd(columns.how), outcome].join(GAP);
  return [row.how.padEnd(columns.how), outcome.padEnd(columns.outcome), `${row.occurrences}×`].join(GAP);
}

/**
 * Every path on the page fitted to a column (R11), or `undefined` for one that has to take a line of its own. A
 * path keeps its end and loses leading directories at a boundary. It is not cut when what would be left is a name
 * another file on the page shares, when two paths would be cut to the same text, or when not even its name fits:
 * two files that read alike are what a list of files must never show (spec §11).
 */
function fitPaths(paths: readonly string[], width: number, ascii: boolean): Map<string, string | undefined> {
  const distinct = [...new Set(paths)];
  const names = counted(distinct.map(nameOf));
  const cuts = new Map(distinct.map((path) => [path, shorten(path, width, ascii)] as const));
  const readings = counted([...cuts.values()].flatMap((cut) => (cut === undefined ? [] : [cut.text])));

  return new Map<string, string | undefined>(
    distinct.map((path) => {
      const cut = cuts.get(path);
      const alike =
        cut === undefined || (readings.get(cut.text) ?? 0) > 1 || (cut.nameOnly && (names.get(nameOf(path)) ?? 0) > 1);
      return [path, alike ? undefined : cut.text];
    }),
  );
}

/** A path cut from the front at a directory boundary, marked `…`. `undefined` when not even its name fits. */
function shorten(path: string, width: number, ascii: boolean): { text: string; nameOnly: boolean } | undefined {
  if (path.length <= width) return { text: path, nameOnly: false };

  const mark = ascii ? '...' : '…';
  const segments = path.split('/');
  const name = segments.pop() ?? path;
  let tail = name;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const longer = `${segments[index]}/${tail}`;
    if (`${mark}/${longer}`.length > width) break;
    tail = longer;
  }
  const text = `${mark}/${tail}`;

  return text.length > width ? undefined : { text, nameOnly: tail === name };
}

function nameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

function counted(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}



/** Its size, never its text (§7.3). Absence is stated, so it cannot be read as an empty instruction. */
function describeInstruction(size: number | undefined): string {
  return size === undefined ? 'the record carrying it could not be read' : `${size} characters, not quoted here`;
}

/**
 * The tool's own characters, in the plainest form a terminal without UTF-8 can show (§7.5 constraint 2). Only
 * these: what a transcript said is quoted as it was, because transliterating a task description changes it.
 */
const ASCII: Readonly<Record<string, string>> = {
  '✓': '*',
  '·': '-',
  '—': '-',
  '×': 'x',
  '…': '...',
  '→': '>',
  '─': '-',
  '━': '-',
  '│': '|',
  '├': '+',
  '└': '`',
  '●': '*',
  '○': 'o',
  // One column, like the mark it stands for: two would push a row past the width every other line was measured to.
  '↩': '<',
  // A heading's mark is decoration: without it the heading still stands on a line of its own.
  '▍': '',
};

/**
 * **Corrected 2026-09-14 after a review.** `--ascii` degraded the tree and left the check mark, the middle dot, the
 * dash and the multiplication sign in the output - and its test passed, because it looked for box-drawing
 * characters only. That was the wrong edge of the requirement: a terminal without UTF-8 garbles every one of them.
 */
function toAscii(text: string): string {
  return text.replace(/[✓·—×…→─━│├└●○↩▍]/g, (character) => ASCII[character] ?? character);
}

/** The headings both views print, without their mark. Colour picks them out wherever they stand. */
const HEADINGS = new Set([
  'Who ran, and what they reached',
  'What could not be established',
  'What was reached',
  'The session in numbers',
  'Recognised key formats in results',
  'Agents with no recorded delegation',
  'Missing data',
  'Everything the session did',
  'What the agents answered',
  'Where the same value was afterwards',
]);

/** Reaching a protected file is what a reader came to find; a refusal is the policy holding. */
const OUTCOME_HUE: Readonly<Record<string, Hue>> = { reached: 'red', refused: 'green', 'outcome unknown': 'yellow' };

/** The same, for the mark a row starts with. */
const MARK_HUE: Readonly<Record<string, Hue>> = { '●': 'red', '○': 'green', '?': 'yellow' };

/** The end of a summary row, exactly as `said` writes it. */
const ROW_END = /((?:named and in a result|named|in a result)(?: · \d+ lines? printed)?)( +)(reached|refused|outcome unknown)((?: +\d+×)?)$/;

/**
 * Colour laid over lines that are already laid out (R14), so it cannot move anything: every width was measured on
 * the plain text, and removing the escapes gives that text back byte for byte. Only the tool's own words are
 * coloured, in the positions it writes them - a task description that happens to say "refused" stays plain - and
 * each coloured word or mark stands beside a word first, so a report read without colour says the same.
 */
function colourise(lines: readonly string[]): string[] {
  let section = '';

  return lines.map((line, index) => {
    const title = line.startsWith('▍') ? line.slice(1) : undefined;
    if (title !== undefined && HEADINGS.has(title)) {
      section = title;
      return `${paint('▍', 'indigo')}${paint(title, 'bold')}`;
    }
    if (index === 1 && /^ [!✓] {2}/.test(line)) {
      return `${line.charAt(0)}${paint(line.charAt(1), line.charAt(1) === '!' ? 'red' : 'green')}${line.slice(2)}`;
    }
    if (line.startsWith('Every detail: ')) return paint(line, 'dim');

    switch (section) {
      case 'Who ran, and what they reached':
        return line
          .replace(/\d+ files? reached/, (reached) => paint(reached, 'red'))
          .replace(/\d+ refused(?= |$)/, (refused) => paint(refused, 'green'))
          .replace(/gave the value back/, (returned) => paint(returned, 'red'))
          .replace(/gave the path back/, (returned) => paint(returned, 'yellow'))
          .replace(/wrote the value into files/, (written) => paint(written, 'red'))
          .replace(/\d+ agents? reached nothing: .+$/, (quiet) => paint(quiet, 'dim'))
          .replace(/nothing recorded what asked for .+$/, (unrecorded) => paint(unrecorded, 'yellow'));
      case 'What could not be established':
      case 'Missing data':
        return line.replace(
          /^( +)(.+)$/,
          (_, margin: string, text: string) => `${margin}${paint(text, text.startsWith('nothing: ') ? 'green' : 'yellow')}`,
        );
      case 'What was reached':
        if (/^ {4}↩ /.test(line)) {
          return line.replace(/carried a value|named|could not be read|never arrived/, (what: string) =>
            paint(what, what === 'carried a value' ? 'red' : 'yellow'),
          );
        }
        if (/^ {4}→ then the same value was in: /.test(line)) {
          return line.replace(/\d+ files? that (?:is|are) not protected/, (what: string) => paint(what, 'red'));
        }
        if (!/^ {4}/.test(line)) return line;
        return line
          .replace(
            ROW_END,
            (_, how: string, space: string, outcome: string, times: string) =>
              `${how.includes('in a result') ? paint(how, 'bold') : how}${space}${paint(outcome, OUTCOME_HUE[outcome] ?? 'bold')}${times}`,
          )
          .replace(/^( {4})([●○?]) /, (_, margin: string, mark: string) => `${margin}${paint(mark, MARK_HUE[mark] ?? 'bold')} `);
      default:
        return line;
    }
  });
}
