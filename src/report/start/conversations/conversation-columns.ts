// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { pill, WORKING_JS } from '../../render/ui/button.ts';
import type { TableRow } from '../../render/ui/data-table.ts';
import { dayName } from '../../render/ui/local-date.ts';
import { LOOKS, type Look } from '../../render/ui/status-look.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import { glyphIcon, statusIcon } from '../../render/ui/status-icon.ts';
import { inLanguages, LANGS, translator } from '../../render/report-copy.ts';
import { tag } from '../../render/ui/tag.ts';
import { idInKey } from '../../../core/session-catalogue.ts';
import { PROVIDER_NAMES } from '../../../core/session-format.ts';
import { projectTag, projectTagStyle } from '../project-tag.ts';
import type { Conversation } from './weeks.ts';
import type { GapReasons } from '../../gap-reasons.ts';

/**
 * `When · What you asked · What happened · Your setting · Action` (`for-people-who-build-with-ai.md` F14; the
 * maintainer's design of 2026-09-25, the fourth column named Your setting the same day), wherever conversations are listed: Conversations, and a day's window on This month. What the
 * AI did and how many files it reached are one column - the look, counted where it read something, and under it "See
 * all {n} files →", which opens F58's window. Whether it was fixed is the next one, so a read stays a read.
 */
export const CONVERSATION_TABLE = {
  head: ['conv.col.when', 'conv.col.ask', 'conv.col.happened', 'conv.col.setting', 'conv.col.action'].map((key) => inLanguages((t) => t(key))),
  columns: '110px minmax(220px,1.5fr) minmax(240px,1fr) 140px 150px',
  minWidth: 1000,
  attributes: ' data-conversations',
} as const;

/** The day a conversation happened on: Today, Yesterday, or its date. */
function whenName(item: Conversation): string {
  return inLanguages((t, lang) => (item.relative === undefined ? dayName(item.day, lang) : t('conv.day.' + item.relative)));
}

/**
 * One conversation as a row. What it says it did is its look; its Action button leads to its report, and a
 * conversation with no report leads nowhere and says so rather than drawing a link that fails (P2). The row itself is
 * not a link (the maintainer, 2026-09-25): a click beside the button, or on "See all {n} files", goes nowhere else.
 */
export function conversationRow(item: Conversation, widen: string, include = false): TableRow {
  const { entry } = item;
  const report = entry.report.kind === 'generated' ? entry.report.file : undefined;
  const title = entry.title === undefined ? undefined : e(entry.title as string);
  const ask = title ?? inLanguages((t) => t('conv.untitled'));
  const look = LOOKS[item.look];
  const utc = new Date(entry.modifiedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  // Cut from the id, not the key: every Codex key starts `codex-`, which told no row from another.
  const bare = idInKey(entry.name);
  const id = bare.length > 8 ? bare.slice(0, 8) + '…' : bare;
  const tech = '<span class="cw-tech"><span title="' + e(entry.name) + '">' + e(id) + '</span> · ' + utc + ' · ' +
    inLanguages((t) => t('conv.tech.helpers', { n: entry.delegations })) +
    (item.look === 'outside' ? ' · ' + inLanguages((t) => t('conv.tech.widen', { command: '<code>' + e(widen) + '</code>' })) : '') + '</span>';
  const action = look.needsFix && report !== undefined
    ? pill({ label: inLanguages((t) => t('conv.act.fix')), tone: 'primary', size: 'task', href: e(report) })
    : report !== undefined
      ? pill({ label: inLanguages((t) => t('conv.act.see')), tone: 'outline', size: 'task', href: e(report) })
      // F55: a conversation older than the run is checked on request, where the page can ask (not a shared one).
      : item.look === 'outside' && include
        ? '<span class="cw-include-cell">' + pill({
          label: inLanguages((t) => t('conv.act.include')),
          tone: 'outline',
          size: 'task',
          button: true,
          attributes: ' data-include="' + e(entry.name) + '" data-command="' + e(widen) + '" data-include-words="' + e(JSON.stringify(includeWords())) + '"',
        }) + '<span class="cw-include-say" data-include-say hidden></span></span>'
        : pill({ label: inLanguages((t) => t('conv.act.none')), tone: 'quiet', size: 'task' });
  // everything-on-this-computer step 2: on the computer's page a row names the project it was held in - its folder's
  // name, and where that folder is on hover, as the projects window says it.
  const project = entry.project === undefined ? '' : ' ' + projectTag(entry.project, 'cw-project');

  return {
    cells: [
      '<span class="cw-when">' + whenName(item) + '</span><span class="cw-time">' + item.time + '</span>',
      // X28: every row names the AI the conversation was with, in the badge that says where something came from (§9.2).
      '<span class="cw-ask">' + ask + '</span><span class="cw-ai">' + tag(e(PROVIDER_NAMES[entry.provider]), 'grey', 'badge') + project + '</span>' + tech,
      whatHappened(item, report),
      fixedCell(item.look, item.partial),
      '<span class="cw-action">' + action + '</span>',
    ],
    // A read of files the person let it read is put before them too, with its bar, and leads to its report (F57a).
    bar: look.attention,
    ...(look.tone === 'sand' ? { barTone: 'sand' as const } : {}),
    // live-pages L7: a conversation the page did not have before is lit when it arrives.
    attributes: ' data-live-key="' + e(entry.name) + '" data-day="' + item.day.number + '" data-look="' + item.look + '" data-search="' + e(((entry.title as string | undefined) ?? '').toLowerCase() + ' ' + item.files.join(' ').toLowerCase() + (entry.project === undefined ? '' : ' ' + entry.project.name.toLowerCase())) + '"',
  };
}

/**
 * What happened: the look, counted where the AI read something ("Read 5 private files" - a count, never the names,
 * guidelines §9.1), and under it the way to every file the conversation reached. The way is a link to the report's
 * Files tab, which the page's script turns into F58's window. A conversation with no report, or none counted, has only
 * its look: the look says why. A read every file of which was marked done is still drawn as the read it was, in coral
 * (the maintainer, 2026-09-25: "…, now fixed" in mint read as if nothing had happened); the next column says it is fixed.
 * A read of only files the person let it read is its own look, in Track's sand: it read them, and nothing was left to fix (F57a).
 */
function whatHappened(item: Conversation, report: string | undefined): string {
  const look = item.look === 'fixed' ? 'read' : item.look;
  const label = look === 'read' && item.read > 0 ? inLanguages((t) => t('conv.did.read', { n: item.read })) : undefined;
  // A gap does not erase what the record established. Keep the uncertain look, and name its positive observation
  // separately; the title only says what the person asked, while this count comes from confirmed file evidence.
  const knownNames = item.look === 'unchecked' && item.entry.report.kind === 'generated'
    ? (item.entry.report.files ?? []).filter((file) => file.kind === 'named' || file.kind === 'result' || file.kind === 'told').length : 0;
  const known = knownNames === 0 ? '' : '<span class="cw-known">' + inLanguages((t) => t('conv.did.partial.name', { n: knownNames })) + '</span>';
  const n = item.reached ?? 0;
  // The maintainer, 2026-10-07: "Couldn't check fully" alone left the reader asking why - the record's own reasons, the
  // two that matter most, under it; where its only gaps are its AI's own, that its AI writes down not every step.
  const why = item.look !== 'unchecked' || item.entry.report.kind !== 'generated' || item.entry.report.gaps === undefined
    ? '' : '<span class="cw-why">' + gapWhy(item.entry.report.gaps, PROVIDER_NAMES[item.entry.provider]) + '</span>';
  const all = report === undefined || n === 0 ? '' :
    '<a class="cw-see" href="' + e(report) + '#files" data-all-files="' + e(report) + '">' + inLanguages((t) => t('conv.seeAll', { n })) + '</a>';
  return '<span class="cw-did">' + statusIcon(look, label) + known + why + all + '</span>';
}

/** The two reasons that matter most, in words: what the AI may have opened unseen first, then what is not known to be whole, or lost. */
function gapWhy(gaps: GapReasons, ai: string): string {
  const said = (['unread', 'unsure', 'noResult', 'damaged', 'unlinked'] as const)
    .filter((reason) => (gaps[reason] ?? 0) > 0).slice(0, 2)
    .map((reason) => inLanguages((t) => t('conv.gap.' + reason, { n: gaps[reason] ?? 0 })));
  return said.length > 0 ? said.join('<span aria-hidden="true"> · </span>') : inLanguages((t) => t('conv.gap.format', { ai: e(ai) }));
}

/**
 * Your setting: ✓ in mint once every file the AI read was marked done, ✕ in coral while one is not, and grey words where there
 * was nothing to fix or where the run cannot tell (F16, F17): never an empty cell (guidelines §8). A read of only files
 * the person chose Track for was never something to fix, and is not "nothing" either (the maintainer, 2026-09-25): it
 * says the mode, with Settings' eye and words, in the sand of its look (F57a).
 */
function fixedCell(look: Look, partial: boolean): string {
  const say = (key: string): string => inLanguages((t) => t(key));
  if (look === 'fixed') return glyphIcon('✓', 'mint', say('conv.fixed.yes'));
  if (look === 'read') return glyphIcon('✕', 'coral', say('conv.fixed.no'));
  if (look === 'allowed') return glyphIcon(MODE_SVG.tell, 'sand', say('set.mode.tell'));
  // F17 is about this cell: a record with gaps is never told there is nothing to fix, whatever its badge says. The
  // badge now names the file such a record did reach, and only this cell knows that the rest of it is missing.
  return '<span class="cw-fixed-plain">' + say(LOOKS[look].known && !partial ? 'conv.fixed.na' : 'conv.fixed.unknown') + '</span>';
}

/** What the Check it button says as it works, in every language: one attribute cannot hold three. */
function includeWords(): Record<string, Record<string, string>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, { saving: t('conv.include.saving'), refused: t('conv.include.refused'), asFile: t('conv.include.asFile'), unreachable: t('conv.include.unreachable') }];
  }));
}

export const CONVERSATION_COLUMNS_STYLE = String.raw`
.cw-when{display:block;font-size:15.5px;font-weight:600;white-space:nowrap}
.cw-time{display:block;font-size:14px;color:var(--text-3);margin-top:4px}
.cw-ask{display:block;font-size:16px;font-weight:500;line-height:1.4;overflow-wrap:anywhere}
.cw-ai{display:block;margin-top:6px}
.cw-why{display:block;margin-top:4px;font-size:13px;line-height:1.45;color:var(--text-3)}
${projectTagStyle('cw-project')}
.cw-tech{display:none;font-family:var(--mono);font-size:12.5px;color:var(--text-3);margin-top:7px;overflow-wrap:anywhere}
.cw-tech code{font-family:inherit;color:var(--text-2)}
.shell-main:has(#conv-tech:checked) .cw-tech{display:block}
.dt[data-conversations]{border-radius:18px}
.dt[data-conversations] .dt-head{padding:16px 24px;font-size:13.5px;column-gap:22px}
.dt[data-conversations] .dt-row{padding:20px 24px;column-gap:22px}
/* A group's heading reads as one (the maintainer, 2026-09-25): at the size of a row's words, not a label's. */
.dt[data-conversations] .dt-group{padding:14px 24px;font-size:15.5px;font-weight:650;letter-spacing:0;color:var(--text)}
.dt[data-conversations] .dt-group-cell{gap:10px}
.dt[data-conversations] .dt-group-dot{width:9px;height:9px}
.dt[data-conversations] .dt-group-count{font-size:15px;font-weight:600;color:var(--text-3)}
.cw-did{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
.cw-did .look{gap:12px}
.cw-did .look-glyph{width:30px;height:30px;font-size:14px}
.cw-did .look-label{font-size:15.5px}
.cw-known{margin-left:42px;font-size:14px;line-height:1.35;color:var(--text-2)}
.cw-see{margin-left:42px;font-size:14px;font-weight:500;color:var(--text-2);text-decoration:underline;text-decoration-color:var(--white-28);text-underline-offset:5px;white-space:nowrap}
.cw-see:hover{color:var(--text);text-decoration-color:var(--text-2)}
.cw-fixed-plain{font-size:14px;color:var(--text-3);white-space:nowrap}
.cw-action{display:flex}
.cw-include-cell{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.cw-include-say{font-size:12.5px;line-height:1.45;color:var(--coral-text);max-width:220px}
.cw-include-say[hidden]{display:none}
.cw-include-say code{display:block;margin-top:4px;font-family:var(--mono);font-size:12px;color:var(--text);word-break:break-all;user-select:all}
`;

/**
 * F55: **Check it** asks the page's server to write the report of a conversation older than the run, and reads the page
 * again once it has, so the row shows what the report found. Opened as a file, it shows the command that includes it.
 * The server's refusal is said in its own words (R59).
 */
export const CONVERSATION_ROW_SCRIPT = String.raw`
(() => {
${WORKING_JS}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-include]');
  if (!button) return;
  const cell = button.closest('.cw-include-cell');
  const line = cell && cell.querySelector('[data-include-say]');
  const words = JSON.parse(button.dataset.includeWords || '{}');
  const word = (key) => (words[document.documentElement.dataset.lang] || words.en || {})[key] || '';
  const say = (text, command) => {
    if (!line) return;
    line.textContent = text;
    if (command) {
      const code = document.createElement('code');
      code.textContent = command;
      line.append(code);
    }
    line.hidden = false;
  };
  if (location.protocol !== 'http:' && location.protocol !== 'https:') { say(word('asFile'), button.dataset.command); return; }
  if (line) line.hidden = true;
  working(button, true, word('saving'));
  fetch('api/include', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: button.dataset.include }) })
    .then((response) => response.text().then((text) => {
      let answer = {};
      try { answer = JSON.parse(text); } catch { answer = { message: text.trim() }; }
      return { ok: response.ok && answer.ok === true, message: answer.message || String(response.status) };
    }), () => ({ ok: false, message: word('unreachable') }))
    .then((answer) => {
      if (answer.ok) { location.replace(location.pathname + '?at=' + Date.now() + location.hash); return; }
      working(button, false);
      say(word('refused') + ' ' + answer.message);
    });
});
})();
`;
