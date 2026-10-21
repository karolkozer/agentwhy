// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { toolKey, type ReportModel, type ToolNote } from '../../report-model.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes } from '../report-copy.ts';
import { closeButton, pill } from '../ui/button.ts';
import { CLOSES, opens, popup, popupFoot } from '../ui/popup.ts';
import { stats } from '../ui/stats.ts';

/**
 * `2026-10-21-the-plan-and-the-recap.md` PN8, PND8: what a tool the adapter does not know is for, in one window per tool -
 * a tool is called hundreds of times, and its description runs to thousands of characters - opened from each of its
 * steps in Step by step and each of its rows in Advanced. Its words are its author's, said as such: what the AI was told
 * (`recorded`), or what its server says now (`current`), and never what a call did.
 */
export function toolWindowsOf(report: ReportModel): (tool: string, mcp?: McpNames) => string | undefined {
  const ids = new Map((report.tools ?? []).map((note, at) => [toolKey(note.tool, note.mcp), 'tool-' + at]));
  return (tool, mcp) => ids.get(toolKey(tool, mcp));
}

type McpNames = { readonly server: string; readonly tool: string };

/**
 * PN8 as the maintainer asked (2026-10-21: "dodaj jakąś ikonę, że to MCP, żeby była widoczna"): an MCP tool is marked by a
 * plug, drawn in the page's greys (guidelines §8, §9.3: no emoji; a simple glyph in a circle) - in its step's circle and
 * beside its name in its window.
 */
export const MCP_ICON = '<svg class="tw-plug" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v5M15 3v5"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v5"/></svg>';

/** PN8: the plug and its words, in a step above its sentence and in a tool's window beside its name. */
export function mcpBadge(where: 'step' | 'window'): string {
  return '<span class="tw-badge tw-badge-' + where + '">' + MCP_ICON + inLanguages((t) => t('tl.badge')) + '</span>';
}

/** Every tool's window, written beside the page's other windows, outside the views (a hidden view hides what is in it). */
export function toolWindows(report: ReportModel): string {
  return (report.tools ?? []).map((note, at) => toolWindow(note, 'tool-' + at)).join('');
}

/** The ⓘ that opens a tool's window: a pill with its words in Step by step, the glyph alone beside a name in a table. */
export function toolLink(id: string, compact = false): string {
  const words = inLanguages((t) => t('tl.open'));
  return compact
    ? '<a class="tw-i"' + opens(id) + labelAttributes((t) => t('tl.open')) + '><span aria-hidden="true">ⓘ</span></a>'
    : '<a class="tw-pill"' + opens(id) + '><span class="tw-pill-i" aria-hidden="true">ⓘ</span>' + words + '</a>';
}

/**
 * PN8 as the maintainer asked it to read ("ładnie i zrozumiale, żeby każdy rozumiał"; "większy, szerszy, i ten full
 * description musi być pokazany ładnie, bo to główny punkt"; "jeszcze bardziej proste dla usera, zobacz guidelines"),
 * built on the "What happened to this file" window (guidelines §4): the tool's name in a chip and where it comes from,
 * in plain words; what it is for as the window's heading, said as its maker's words (§1.2: a human description first,
 * then the name); two numbers before any text (§9.3) - how often the AI used it here, and that the files it opened are
 * not visible; the whole description, laid out as written (`descriptionHtml`); a grey note left of Close in the foot.
 */
const LONG_TITLE = 110;

function toolWindow(note: ToolNote, id: string): string {
  const label = (key: string, vars?: Record<string, string | number>): string => inLanguages((t) => t(key, vars));
  const name = note.mcp?.tool ?? note.tool;
  const whole = String(note.about).trim() !== String(note.summary).trim();
  const head = '<div class="tw-top"><span class="tw-id">' +
    (note.mcp === undefined ? '' : mcpBadge('window')) +
    '<span class="tw-chip">' + e(name) + '</span>' +
    '<span class="tw-from">' + (note.mcp === undefined ? label('tl.from.app') : label('tl.from.mcp', { server: '<b>' + e(note.mcp.server) + '</b>' })) + '</span></span>' +
    closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
    // A first sentence of more than two lines at the heading's size is set smaller: it is a sentence, not a name.
    '<h2 class="tw-title' + (String(note.summary).length > LONG_TITLE ? ' tw-title-long' : '') + '" id="' + id + '-title">' + e(note.summary) + '</h2>' +
    '<p class="tw-said">' + label(note.as === 'recorded' ? 'tl.said.recorded' : 'tl.said.current') + '</p>';
  const numbers = stats([
    { label: label('tl.stat.used'), value: String(note.calls) },
    // Amber is what is not known, the page over (guidelines §2).
    { label: label('tl.stat.files'), value: label('tl.stat.files.value'), tone: 'amber' },
  ], 'record');
  return popup({
    id,
    // The "What happened to this file" window's size and warmth (guidelines §4), which this window is drawn after.
    size: 'wide',
    labelledBy: id + '-title',
    body: '<div class="tw">' + head + numbers +
      '<p class="tw-why">' + label(note.mcp === undefined ? 'tl.files.app' : 'tl.files.mcp') + '</p>' +
      // The section heading of guidelines §4: a coral rule and a short coral label, then its one sentence.
      (whole ? '<section class="tw-main"><h3 class="tw-h"><span class="tw-rule" aria-hidden="true"></span>' + label('tl.full') + '</h3><p class="tw-hint">' + label('tl.full.hint') + '</p>' +
        '<div class="tw-desc">' + descriptionHtml(note.about) + '</div></section>' : '') + '</div>' +
      popupFoot(label('tl.note'), pill({ label: label('app.close'), tone: 'outline', size: 'md', button: true, attributes: CLOSES })),
  });
}

/** One part of a description as its author laid it out: a heading, a paragraph, or a list of items. */
type Part =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string; readonly block: number }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly string[]; readonly block: number };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;
/** A list item that opens with a short name and a colon - `recap: what is now true…` - says that name as its title. */
const LABELLED = /^([^:`{}]{1,40}):\s+(\S[\s\S]*)$/;

/**
 * PN8: a tool's description in parts, each its own card, as Step by step draws its stretches (the maintainer, 2026-10-21:
 * "podzielić w oddzielne boxy, jak mamy na step by step"): a paragraph is a card; a paragraph a list follows is that
 * card's head, the list's items its rows, each with its mark in a circle and, where it opens `name:`, the name as its
 * title; a `#` line heads the cards after it. `code` and a `{…}` fragment are code. Escaped first, and only these tags
 * added: the text is its author's, never markup.
 */
export function descriptionHtml(text: string): string {
  const parts = partsOf(text);
  let html = '';
  for (let at = 0; at < parts.length; at += 1) {
    const part = parts[at] as Part;
    const next = parts[at + 1];
    if (part.kind === 'heading') {
      html += '<h4 class="tw-part-h">' + inline(part.text) + '</h4>';
    } else if (part.kind === 'paragraph' && next?.kind === 'list' && (next.block === part.block || part.text.endsWith(':'))) {
      html += '<section class="tw-card"><div class="tw-card-head">' + inline(part.text) + '</div>' + rows(next) + '</section>';
      at += 1;
    } else if (part.kind === 'paragraph') {
      html += '<section class="tw-card"><p class="tw-card-text">' + inline(part.text) + '</p></section>';
    } else {
      html += '<section class="tw-card">' + rows(part) + '</section>';
    }
  }
  return html;
}

function partsOf(text: string): Part[] {
  const parts: Part[] = [];
  text.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).forEach((chunk, block) => {
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | undefined;
    const flushParagraph = (): void => {
      if (paragraph.length > 0) parts.push({ kind: 'paragraph', text: paragraph.join(' '), block });
      paragraph = [];
    };
    const flushList = (): void => {
      if (list !== undefined) parts.push({ kind: 'list', ordered: list.ordered, items: list.items, block });
      list = undefined;
    };
    for (const line of chunk.split('\n').filter((each) => each.trim() !== '')) {
      const ordered = NUMBERED.test(line) ? true : BULLET.test(line) ? false : undefined;
      if (ordered !== undefined) {
        flushParagraph();
        if (list?.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
        list.items.push(line.replace(ordered ? NUMBERED : BULLET, '').trim());
      } else if (HEADING.test(line)) {
        flushParagraph(); flushList();
        parts.push({ kind: 'heading', text: line.replace(HEADING, '').trim() });
      } else if (list !== undefined && /^\s+\S/.test(line)) {
        // A wrapped line of the item above it.
        list.items[list.items.length - 1] += ' ' + line.trim();
      } else {
        flushList();
        paragraph.push(line.trim());
      }
    }
    flushParagraph(); flushList();
  });
  return parts;
}

function rows(list: Extract<Part, { kind: 'list' }>): string {
  return '<ol class="tw-rows">' + list.items.map((item, at) => {
    const labelled = LABELLED.exec(item);
    return '<li class="tw-row"><span class="tw-mark' + (list.ordered ? '' : ' tw-mark-dot') + '" aria-hidden="true">' + (list.ordered ? String(at + 1) : '•') + '</span><div class="tw-row-body">' +
      (labelled === null ? '<span class="tw-row-text">' + inline(item) + '</span>'
        : '<span class="tw-row-label">' + inline(labelled[1] as string) + '</span><span class="tw-row-text">' + inline(labelled[2] as string) + '</span>') +
      '</div></li>';
  }).join('') + '</ol>';
}

/** A line's own words, escaped, its `code` and `{…}` fragments as code - a fragment measured once escaped, a quote six characters then. */
function inline(line: string): string {
  return e(line)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])(\{[^{}]{1,240}\})(?=$|[\s),.;:])/g, '$1<code>$2</code>');
}

/** PN8: under a tool's step, what it is for in one quoted sentence, and the way to its window. */
export function toolAbout(note: ToolNote | undefined, id: string): string {
  return (note === undefined ? '' : '<p class="tw-step"><q>' + e(note.summary) + '</q></p>') + '<div class="stp-act">' + toolLink(id) + '</div>';
}

/** PN8: each note by its tool's identity (`toolKey`), as a step's `did` and `mcp` give it. */
export function toolNotesOf(report: ReportModel): (tool: string, mcp?: McpNames) => ToolNote | undefined {
  const notes = new Map((report.tools ?? []).map((note) => [toolKey(note.tool, note.mcp), note]));
  return (tool, mcp) => notes.get(toolKey(tool, mcp));
}

export const TOOL_WINDOW_STYLE = String.raw`
.tw{padding:26px 32px 30px}
.tw-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
.tw-id{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.tw-badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--amber);background:var(--amber-12);border:1px solid var(--amber-35);border-radius:999px;padding:3px 11px 3px 8px;white-space:nowrap}
.tw-badge .tw-plug{width:16px;height:16px}
.tw-when{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:4px}
/* The maintainer's drawing, 2026-10-21: the step's badge in the row's right column, at its top, over the step's pill and
   the pill's size; on a narrow screen, where the pill drops under the step, beside its First or Then. */
.tw-badge-step{position:absolute;top:16px;right:22px;padding:4px 12px 4px 9px}
@media (max-width:640px){.tw-badge-step{position:static;padding:2px 10px 2px 7px;font-size:12.5px}.tw-badge-step .tw-plug{width:15px;height:15px}}
.stp-ic .tw-plug{color:var(--amber)}
.tw-chip{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:3px 8px}
.tw-from{font-size:14px;line-height:1.45;color:var(--text-2)}
.tw-from b{font-family:var(--mono);font-size:13.5px;font-weight:500;color:var(--text-soft)}
.tw-title{margin:0 0 8px;font-size:28px;line-height:1.2;letter-spacing:-0.015em;font-weight:650;color:var(--text);text-wrap:balance;overflow-wrap:anywhere}
.tw-title-long{font-size:22px;line-height:1.3;letter-spacing:-0.01em}
.tw-said{margin:0 0 24px;font-size:15px;line-height:1.5;color:var(--text-3)}
.tw .sx-record{margin-bottom:10px}
.tw-why{margin:0 0 30px;font-size:14px;line-height:1.5;color:var(--text-3)}
.tw-h{display:flex;align-items:center;gap:10px;margin:0;font-size:15px;font-weight:650;color:var(--coral-text)}
.tw-rule{width:36px;height:1.5px;background:var(--coral);flex:none}
.tw-hint{margin:4px 0 12px;font-size:14px;line-height:1.5;color:var(--text-3)}
.tw-desc{display:flex;flex-direction:column;gap:12px}
.tw-card{background:var(--card);border:1px solid var(--white-10);border-radius:18px;overflow:hidden}
.tw-card-text{margin:0;padding:18px 22px;font-size:16px;line-height:1.65;color:var(--text-soft);text-wrap:pretty;overflow-wrap:anywhere}
.tw-card-head{padding:16px 22px;background:var(--raised-2);border-bottom:1px solid var(--white-10);font-size:15.5px;font-weight:550;line-height:1.6;color:var(--text);overflow-wrap:anywhere}
.tw-rows{list-style:none;margin:0;padding:0}
.tw-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:14px;padding:16px 22px;border-top:1px solid var(--white-07)}
.tw-row:first-child{border-top:none}
.tw-mark{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;background:var(--coral-08);color:var(--coral-text);border:1px solid var(--coral-25)}
.tw-mark-dot{font-size:18px;line-height:1}
.tw-row-body{min-width:0;padding-top:3px}
.tw-row-label{display:block;margin-bottom:3px;font-size:15px;font-weight:650;color:var(--text);overflow-wrap:anywhere}
.tw-row-text{display:block;font-size:15.5px;line-height:1.6;color:var(--text-soft);text-wrap:pretty;overflow-wrap:anywhere}
.tw-part-h{margin:10px 0 0;font-size:15px;font-weight:650;color:var(--text)}
.tw-desc code{font-family:var(--mono);font-size:13.5px;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 6px;white-space:pre-wrap}
.tw-step{margin:6px 0 0;font-size:14.5px;line-height:1.5;color:var(--text-2);max-width:640px}
.tw-step q{quotes:"\201C" "\201D"}
.tw-pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--text-soft);padding:4px 12px;border-radius:999px;border:1px solid var(--white-14);text-decoration:none}
.tw-pill:hover{border-color:var(--white-32);color:var(--text)}
.tw-pill-i{font-size:14px;line-height:1}
.tw-i{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;width:20px;height:20px;border-radius:999px;font-size:14px;line-height:1;color:var(--text-soft);text-decoration:none;vertical-align:middle}
.tw-i:hover{color:var(--text);background:var(--white-07)}
@media (max-width:640px){.tw{padding:22px 20px 24px}.tw-title{font-size:23px}.tw-title-long{font-size:18px}.tw-card-text,.tw-card-head{padding:14px 16px;font-size:15px}.tw-row{padding:14px 16px;gap:12px}.tw-row-text{font-size:15px}}
`;
