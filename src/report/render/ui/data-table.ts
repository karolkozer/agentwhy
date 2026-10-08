// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A table drawn as a grid (guidelines §4, §9.3): a grey header row, rows that are links as a whole, the coral status
 * bar on a row that needs action, and sideways scrolling instead of cut columns in a narrow window.
 *
 * A row is a link through one anchor stretched over it, not an anchor wrapped round it: a button inside a row - "+N
 * more" - stays a button of its own, which an anchor wrapped round it would not allow.
 */
export interface TableRow {
  /** One piece of HTML per column, in order. */
  readonly cells: readonly string[];
  /** Where the row leads. A row with nowhere to go is not a link and does not look like one. */
  readonly href?: string;
  /** What the link is called for a screen reader: the row's own words say it to everyone else. */
  readonly label?: string;
  /** Extra attributes for the row's link, already escaped: the id of the window it opens (`opener`). */
  readonly linkAttributes?: string;
  readonly bar?: boolean;
  /** The bar in Track's sand, not coral: a row put before the person that asks for nothing (a read they allowed, F57a). */
  readonly barTone?: 'sand';
  /** Extra attributes for the row, already escaped: what a page's script filters it by. */
  readonly attributes?: string;
}

/**
 * A heading across the table between groups of rows (Files: what the AI read, what it only saw the name of, the rest),
 * so a long table reads as its parts. Not a row of data: it names the rows under it, up to the next one.
 */
export interface TableGroup {
  /** Already written in every language and escaped. */
  readonly group: string;
  /** The dot before it, in the colour its rows are spoken of in. */
  readonly tone?: 'coral' | 'amber' | 'mint' | 'sand' | 'blue' | 'grey';
  readonly count?: number;
  /** Extra attributes, already escaped: what a page's script hides it by. */
  readonly attributes?: string;
}

/**
 * A line across the table under a group's rows, for what belongs to the group and is not a row of it: "Show all 40"
 * under the five a long group shows (Conversations, F14).
 */
export interface TableNote {
  /** Already written in every language and escaped. */
  readonly note: string;
  /** Extra attributes, already escaped: what a page's script shows or hides it by. */
  readonly attributes?: string;
}

export interface Table {
  /** The header's words, one per column, already written in every language. */
  readonly head: readonly string[];
  /** The grid's column template, shared by the header and every row so they always line up. */
  readonly columns: string;
  readonly minWidth: number;
  readonly rows: readonly (TableRow | TableGroup | TableNote)[];
  /** Shown inside the table, under the header, where a script has hidden every row. */
  readonly empty?: string;
  readonly attributes?: string;
}

export function dataTable(table: Table): string {
  const grid = ' style="grid-template-columns:' + table.columns + ';min-width:' + table.minWidth + 'px"';
  return '<div class="dt" role="table"' + (table.attributes ?? '') + '>' +
    '<div class="dt-head" role="row"' + grid + '>' + table.head.map((cell) => '<span role="columnheader">' + cell + '</span>').join('') + '</div>' +
    table.rows.map((row) => 'group' in row ? group(row, table.minWidth) : 'note' in row ? note(row, table.minWidth) :
      '<div class="dt-row' + (row.href === undefined ? '' : ' dt-linked') + '" role="row"' + grid + (row.attributes ?? '') + '>' +
      (row.bar === true ? '<span class="dt-bar' + (row.barTone === undefined ? '' : ' dt-bar-' + row.barTone) + '" aria-hidden="true"></span>' : '') +
      // The link sits in the first cell, since a row holds cells and nothing else; the cell is not positioned, so the
      // link still stretches over the whole row.
      row.cells.map((cell, at) => '<span class="dt-cell" role="cell">' + (at === 0 ? link(row) : '') + cell + '</span>').join('') +
      '</div>').join('') +
    (table.empty === undefined ? '' : '<div class="dt-empty" role="row" hidden><span role="cell">' + table.empty + '</span></div>') +
    '</div>';
}

function group(row: TableGroup, minWidth: number): string {
  return '<div class="dt-group" role="row" style="min-width:' + minWidth + 'px"' + (row.attributes ?? '') + '><span class="dt-group-cell" role="cell">' +
    '<span class="dt-group-dot dt-group-' + (row.tone ?? 'grey') + '" aria-hidden="true"></span>' + row.group +
    (row.count === undefined ? '' : '<span class="dt-group-count">' + row.count + '</span>') + '</span></div>';
}

function note(row: TableNote, minWidth: number): string {
  return '<div class="dt-note" role="row" style="min-width:' + minWidth + 'px"' + (row.attributes ?? '') + '><span class="dt-note-cell" role="cell">' + row.note + '</span></div>';
}

function link(row: TableRow): string {
  return row.href === undefined ? '' :
    '<a class="dt-link" href="' + row.href + '"' + (row.label === undefined ? '' : ' aria-label="' + row.label + '"') + (row.linkAttributes ?? '') + '></a>';
}

export const DATA_TABLE_STYLE = String.raw`
.dt{border-radius:14px;background:var(--card);border:1px solid var(--white-09);overflow-x:auto;overflow-y:hidden}
.dt-head,.dt-row{display:grid;column-gap:18px}
.dt-head{padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--white-08);font-size:12.5px;font-weight:600;color:var(--text-3)}
.dt-row{align-items:center;position:relative;padding:16px 20px;border-bottom:1px solid var(--white-06);color:var(--text)}
.dt-row[hidden]{display:none}
.dt-linked:hover{background:var(--white-02)}
.dt-link{position:absolute;inset:0;z-index:1;border-radius:0}
.dt-link:focus-visible{outline-offset:-2px}
.dt-cell{min-width:0}
/* A column here has a width, and a look's words are one line everywhere else (status-icon.ts), so in a cell they
   wrap rather than run over the column beside them - which German's "Nicht protokolliert" already did (found by the
   maintainer 2026-10-08 on the new "Opened only"). */
.dt-cell .look-label{white-space:normal;overflow-wrap:anywhere}
.dt-bar{position:absolute;left:0;top:15%;height:70%;width:2px;border-radius:0 2px 2px 0;background:var(--coral)}
.dt-bar-sand{background:var(--sand)}
.dt-group{padding:10px 20px;background:var(--panel);border-bottom:1px solid var(--white-08);font-size:12.5px;font-weight:600;letter-spacing:0.02em;color:var(--text-2)}
.dt-group[hidden]{display:none}
.dt-group-cell{display:flex;align-items:center;gap:8px}
.dt-group-dot{width:7px;height:7px;border-radius:50%;flex:none}
.dt-group-coral{background:var(--coral)}.dt-group-amber{background:var(--amber)}.dt-group-mint{background:var(--mint)}.dt-group-sand{background:var(--sand)}.dt-group-blue{background:var(--blue)}.dt-group-grey{background:var(--white-25)}
.dt-group-count{font-weight:500;color:var(--text-3)}
.dt-note{padding:10px 20px;border-bottom:1px solid var(--white-06)}
.dt-note[hidden]{display:none}
.dt-note-cell{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--text-3)}
.dt-empty{padding:28px;text-align:center;font-size:14px;color:var(--text-3)}
`;
