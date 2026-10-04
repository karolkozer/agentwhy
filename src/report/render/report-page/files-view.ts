// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator, type Translate } from '../report-copy.ts';
import { closeButton, pill, textButton } from '../ui/button.ts';
import { dataTable, type TableGroup } from '../ui/data-table.ts';
import { guideCard } from '../ui/guide-card.ts';
import { hero } from '../ui/hero.ts';
import { labelledSelect } from '../ui/labelled-select.ts';
import { CLOSES, opener, popup, popupFoot } from '../ui/popup.ts';
import { glyphIcon, statusIcon } from '../ui/status-icon.ts';
import { MODE_SVG } from '../ui/mode-icon.ts';
import { LOOKS, type Look, type Tone } from '../ui/status-look.ts';
import { tag } from '../ui/tag.ts';
import type { ReportModel } from '../../report-model.ts';
import { holdsKeys } from '../../check/session-actions.ts';
import { fileStory, type FileStory } from './file-story.ts';
import { onlyNamed, type FileAccess, type FileProtection, type FileRow } from './files.ts';
import { storyPopup } from './story-window.ts';
import type { Clock } from './times.ts';
import { titleOf, type FileNames } from './item-names.ts';
import type { ToDoItem } from './to-do.ts';
import { fixId, storyId } from './to-do-view.ts';

/**
 * "Files" (the report page spec P31-P37; design file *agentwhy App*): everything the AI reached, what it did to each,
 * whether a rule of the project protects it, and what to do - filtered by a script, all on the page without one.
 * `protectKeys` names the files **Protect it** is offered for - private, not protected yet, and inside the project - and
 * the everyday ones inside it, offered **Make it private**.
 */
export function filesView(rows: readonly FileRow[], items: readonly ToDoItem[], protectKeys: ReadonlyMap<string, number>, names: FileNames): string {
  const entries = rows.map((row, key) => ({ row, key }));
  const opened = entries.filter(({ row }) => !onlyNamed(row));
  // One list, in the order a person deals with it (the maintainer, 2026-09-24): what the AI read, in coral; then the
  // private files it only saw the name of, in blue; then everything else. A name only seen is still never counted as
  // a file opened - it may not be in the project at all (P32, P49) - but it is not hidden under a fold either.
  const listed = [...entries].sort((a, b) => tierOf(a.row) - tierOf(b.row));
  if (opened.length === 0) {
    return '<div class="fl"><div class="rp-alone">' + guideCard({ tone: 'mint', title: inLanguages((t) => t('fl.noneListed')), body: inLanguages((t) => t('fl.commands')) }) +
      '</div>' + (listed.length === 0 ? '' : table(listed, items, protectKeys, false, names)) + '</div>';
  }
  const privates = opened.filter(({ row }) => row.private).length;
  const action = privates === 0 ? inLanguages((t) => t('fl.noneRead'))
    : privates === opened.length ? inLanguages((t) => t('fl.all', { n: opened.length }))
      : inLanguages((t) => t('fl.some', { n: privates }));
  const lead = privates === 0 ? 'fl.leadNone' : privates === opened.length ? 'fl.leadAll' : 'fl.lead';

  return '<div class="fl' + (privates === 0 ? ' fl-clean' : '') + '">' +
    hero({ eyebrow: inLanguages((t) => t('fl.eyebrow')), fact: inLanguages((t) => t('fl.fact', { n: opened.length })), action, lead: inLanguages((t) => t(lead)) }) +
    filters(listed.map(({ row }) => row)) + table(listed, items, protectKeys, true, names) +
    '<p class="fl-note">' + inLanguages((t) => t('fl.shown', { shown: '<span data-files-shown>' + listed.length + '</span>', n: listed.length })) + ' ' +
    inLanguages((t) => t('fl.commands')) + '</p></div>';
}

/** The table's three parts, in the order a person deals with them: read (coral), only its name seen (blue), the rest. */
const TIERS = [{ key: 'fl.tier.read', tone: 'coral' }, { key: 'fl.tier.name', tone: 'blue' }, { key: 'fl.tier.rest', tone: 'grey' }] as const;

function tierOf(row: FileRow): number {
  return row.private && (row.access === 'read' || row.access === 'changed') ? 0 : onlyNamed(row) ? 1 : 2;
}

/**
 * The window of every row not on the to-do list, written beside the page's other windows, outside the views. A private
 * file opens the same "What happened" window a file on the list does - its story, the diagram and the record (the
 * maintainer, 2026-09-25) - with what was done said first and what to do under it, and no Fix it. An everyday file, of
 * which the model holds no steps, and a private one the flows name nowhere keep the simple window (P37).
 */
export function fileWindows(rows: readonly FileRow[], protectKeys: ReadonlyMap<string, number>, report: ReportModel, clock: Clock, names: FileNames): string {
  return rows.map((row, key) => {
    if (row.item !== undefined) return '';
    const story = row.private ? fileStory(report, row.path) : undefined;
    return story === undefined || story.entries.length === 0 ? fileWindow(row, key, protectKeys, names) : rowStoryWindow(row, key, story, report, protectKeys, clock, names);
  }).join('');
}

/** A private file with nothing to fix, in the story window: its row's words for what happened and what to do. */
function rowStoryWindow(row: FileRow, key: number, story: FileStory, report: ReportModel, protectKeys: ReadonlyMap<string, number>, clock: Clock, names: FileNames): string {
  const label = (k: string): string => inLanguages((t) => t(k));
  const read = report.privateFiles.find((file) => file.path === row.path);
  const pattern = report.findings.find((finding) => finding.path === row.path)?.pattern;
  const reach = LOOKS[LOOK[row.access === 'changed' ? 'read' : row.access]];
  const exposed = row.access === 'read' || row.access === 'changed';
  const protectKey = protectKeys.get(row.path);
  return storyPopup(story, {
    path: row.path,
    keys: read !== undefined && holdsKeys(read),
    title: label(row.kind),
    ...(pattern === undefined ? {} : { pattern }),
    exposed,
    summary: label('fl.w.did.' + row.access),
    ...(exposed ? {} : { look: { glyph: reach.glyph, tone: reach.tone } }),
  }, 'file-' + key, report.scope.sessionId, clock, { context: label(nextOf(row)), names },
  protectKey === undefined ? '' : '<span data-protect-open="' + protectKey + '">' +
    pill({ label: label(protectLabel(row)), tone: 'light', size: 'md', href: '#protect-' + protectKey, attributes: opener('protect-' + protectKey) }) + '</span>');
}

/** What to do about a file with nothing on the to-do list: the last answer of its window. */
function nextOf(row: FileRow): string {
  return !row.private ? 'fl.w.next.none' : row.protection === 'yes' ? 'fl.w.next.safe' : row.protection === 'told' ? 'fl.w.next.told' : 'fl.w.next.maybe';
}

/** The look of a private file in its row, said of that one file (P35). */
const LOOK: Readonly<Record<Exclude<FileAccess, 'changed'>, Look>> = { read: 'read', name: 'name', unknown: 'unchecked', stopped: 'stopped' };

/**
 * The glyph beside "Protected?": mint where a rule protects it, coral where a private file has none, grey otherwise. A
 * file kept from the AI and one the person chose to track carry Settings' padlock and eye (`mode-icon.ts`), so the
 * mode reads the same on both pages; Track is in its own sand, as Settings draws it - nothing is wrong with it.
 */
const PROTECTED: Readonly<Record<FileProtection, readonly [string, Tone]>> = {
  yes: [MODE_SVG.block, 'mint'], no: ['!', 'coral'], unknown: ['?', 'grey'], na: ['○', 'grey'], told: [MODE_SVG.tell, 'sand'],
};


/** What the filter "What the AI did" knows a row as; an outcome not recorded and a change are neither of its three. */
function didOf(row: FileRow): string {
  return row.access === 'read' || row.access === 'name' || row.access === 'stopped' ? row.access : 'other';
}

/** P34: the search, the three groups with their counts, and the two questions - a script's, so only with one. */
function filters(rows: readonly FileRow[]): string {
  const count = (test: (row: FileRow) => boolean): number => rows.filter(test).length;
  const groups = ([['all', rows.length], ['fix', count((row) => row.group === 'fix')], ['fixed', count((row) => row.group === 'fixed')]] as const)
    .map(([group, n]) => '<button type="button" class="fl-pill' + (group === 'all' ? ' fl-on' : '') + '" data-files-group="' + group + '" data-live-keep aria-pressed="' + String(group === 'all') + '">' +
      inLanguages((t) => t('fl.group.' + group)) + '<span class="fl-count" data-files-count="' + group + '">' + n + '</span></button>').join('');
  const did = (t: Translate): string => labelledSelect(e(t('fl.did.q')), [
    { value: 'any', label: e(t('fl.did.any')) },
    ...(['read', 'name', 'stopped'] as const).map((value) => ({ value, label: e(t('fl.did.' + value)) + ' (' + count((row) => row.access === value) + ')' })),
  ], ' data-files-did data-live-keep');
  const prot = (t: Translate): string => labelledSelect(e(t('fl.prot.q')), [
    { value: 'any', label: e(t('fl.prot.any')) },
    ...(['no', 'yes', 'told', 'na'] as const).map((value) => ({ value, label: e(t('fl.prot.' + value)) + ' (' + count((row) => row.protection === value) + ')' })),
  ], ' data-files-prot data-live-keep');
  return '<div class="fl-filters js-only"><div class="fl-row">' +
    '<input class="fl-search" type="search" data-files-search data-live-keep placeholder="' + e(translator('en')('fl.search')) + '"' +
    LANGS.map((lang) => ' data-placeholder-' + lang + '="' + e(translator(lang)('fl.search')) + '"').join('') + labelAttributes((t) => e(t('fl.search'))) + '>' +
    '<div class="fl-pills">' + groups + '</div></div>' +
    '<div class="fl-row">' + inLanguages(did) + inLanguages(prot) + textButton(inLanguages((t) => t('fl.clear')), ' data-files-clear hidden', 'fl-clear') + '</div></div>';
}

/**
 * P35: `File · AI · Private file · When your AI reaches it · Action` (the mode its own column since 2026-09-25; X28 names
 * the AI it holds for since 2026-09-29), a row opening its story window or its simple one (P37).
 */
function table(entries: readonly { readonly row: FileRow; readonly key: number }[], items: readonly ToDoItem[], protectKeys: ReadonlyMap<string, number>, filtered: boolean, names: FileNames): string {
  const label = (key: string): string => inLanguages((t) => t(key));
  return dataTable({
    head: [label('fl.col.file'), label('fl.col.ai'), label('fl.col.prot'), label('fl.col.mode'), label('fl.col.action')],
    // The file is what a row is about, so its column takes the room: the others hold one tag or one answer each.
    columns: 'minmax(240px,2fr) 120px 140px minmax(250px,1.2fr) 110px',
    minWidth: 980,
    empty: label('fl.noMatch'),
    // Only the table of opened files is the one the filters work on; the names under it are a list, not a filter's rows.
    ...(filtered ? { attributes: ' data-files-table' } : {}),
    rows: entries.flatMap(({ row, key }, at) => {
      const tier = tierOf(row);
      // A heading over each part, where the table has more than one: its first row is where the part begins.
      const parts = new Set(entries.map((entry) => tierOf(entry.row))).size;
      const heading: TableGroup[] = parts > 1 && (at === 0 || tierOf((entries[at - 1] as { row: FileRow }).row) !== tier)
        ? [{
          group: label(TIERS[tier]!.key), tone: TIERS[tier]!.tone, count: entries.filter((entry) => tierOf(entry.row) === tier).length,
          attributes: ' data-files-tier="' + tier + '"',
        }]
        : [];
      const item = row.item === undefined ? undefined : items[row.item];
      const target = row.item === undefined ? 'file-' + key : storyId(row.item);
      const kind = item === undefined ? label(row.kind) : inLanguages((t, lang) => titleOf(item, t, lang));
      return [...heading, {
        cells: [
          '<span class="fl-kind">' + kind + '</span><span class="fl-chip" title="' + e(row.path) + '">' + e(names(row.path)) + '</span>',
          row.private ? statusIcon(LOOK[row.access === 'changed' ? 'read' : row.access], label('fl.acc.' + row.access)) : '<span class="fl-plain">' + label('fl.acc.' + row.access) + '</span>',
          privateCell(row, protectKeys.get(row.path)),
          modeCell(row, protectKeys.get(row.path)),
          actionCell(row),
        ],
        href: '#' + target,
        linkAttributes: opener(target),
        label: e(row.path),
        // The status bar: protected now, read before, and not fixed - the one row whose rule came too late (guidelines §4).
        bar: row.private && row.protection === 'yes' && row.access === 'read' && row.group === 'fix',
        attributes: ' data-live-key="' + e(row.path) + '" data-file-key="' + key + '" data-tier="' + tier + '" data-group="' + row.group + '" data-did="' + didOf(row) + '" data-prot="' + row.protection + '"' +
          ' data-search="' + e(row.path.toLowerCase()) + '"' + (row.item === undefined ? '' : ' data-file-item="' + row.item + '"'),
      }];
    }),
  });
}

/**
 * The Private file column: whether the file is private, and nothing else - what stops the AI, and the buttons that
 * change it, are the next column's. Its colour is the row's story, coral where nothing keeps a private file from the AI,
 * mint where the person's settings hold it - blocked, or Track, which they chose (the maintainer, 2026-09-25) - and grey
 * where that cannot be told.
 */
function privateCell(row: FileRow, key: number | undefined): string {
  const label = (id: string): string => inLanguages((t) => t(id));
  const tone = !row.private ? 'grey' : row.protection === 'no' ? 'coral' : row.protection === 'yes' || row.protection === 'told' ? 'mint' : 'grey';
  const now = tag(label(row.private ? 'fl.tag.private' : 'fl.tag.na'), tone);
  if (key === undefined) return now;
  return '<span data-protect-open="' + key + '">' + now + '</span>' +
    '<span data-protected="' + key + '" hidden>' + tag(label('fl.tag.private'), 'mint') + '</span>';
}

/**
 * The mode column (the maintainer, 2026-09-25: a mode inside the private tag went unseen): what happens when the AI
 * reaches the file, in Settings' words and glyphs (`mode-icon.ts`) - **Blocked** with its padlock, **Track** with its
 * eye, and coral **Not blocked** with **Protect it** beside it where nothing keeps a private file from the AI. An
 * everyday file needs nothing, and offers **Make it private** where it can be, the same rule Settings writes when a file
 * is added there. A file protected from this page becomes Blocked here, and Private in the column before.
 */
function modeCell(row: FileRow, key: number | undefined): string {
  const label = (id: string): string => inLanguages((t) => t(id));
  const blocked = glyphIcon(MODE_SVG.block, 'mint', label('fl.mode.yes'));
  const made = key === undefined ? '' : '<span data-protected="' + key + '" hidden>' + blocked + '</span>';
  if (row.protection === 'yes') return blocked;
  // F57: the person chose this. Nothing is wrong with it, so it is in Track's sand, and nothing offers to protect it.
  if (row.protection === 'told') return glyphIcon(MODE_SVG.tell, 'sand', label('fl.mode.told'));
  if (row.protection === 'unknown') return glyphIcon('?', 'grey', label('fl.mode.unknown'));
  if (row.protection === 'na') {
    if (key === undefined) return '<span class="fl-plain">' + label('fl.mode.na') + '</span>';
    // Quieter than Protect it (button.ts: light for "Protect it", an outline for the rest): nothing is wrong with the file.
    return '<span class="fl-prot" data-protect-open="' + key + '">' +
      pill({ label: label(protectLabel(row)), tone: 'outline', size: 'sm', href: '#protect-' + key, attributes: opener('protect-' + key) + ' data-row-control' }) + '</span>' + made;
  }
  const now = glyphIcon('!', 'coral', label('fl.mode.no'));
  if (key === undefined) return now;
  return '<span class="fl-prot" data-protect-open="' + key + '">' + now +
    pill({ label: label(protectLabel(row)), tone: 'light', size: 'sm', href: '#protect-' + key, attributes: opener('protect-' + key) + ' data-row-control' }) + '</span>' + made;
}

/** "Protect it →" for a private file, "Make it private →" for an everyday one. */
function protectLabel(row: FileRow): string {
  return row.protection === 'na' ? 'fl.makePrivate' : 'fl.protect';
}

function actionCell(row: FileRow): string {
  const label = (id: string): string => inLanguages((t) => t(id));
  if (row.item === undefined) return '<span class="fl-act fl-act-none">' + label('fl.act.none') + '</span>';
  const fixed = row.group === 'fixed';
  return '<a class="fl-act fl-act-fix" href="#' + fixId(row.item) + '"' + opener(fixId(row.item)) + ' data-row-control data-files-fix="' + row.item + '"' + (fixed ? ' hidden' : '') + '>' + label('fl.act.fix') + '</a>' +
    '<span class="fl-act fl-act-fixed" data-files-fixed="' + row.item + '"' + (fixed ? '' : ' hidden') + '>' + label('fl.act.fixed') + '</span>';
}

/** P37: a file with nothing on the to-do list - what the AI did, whether it is protected, and what to do. */
function fileWindow(row: FileRow, key: number, protectKeys: ReadonlyMap<string, number>, names: FileNames): string {
  const id = 'file-' + key;
  const label = (k: string): string => inLanguages((t) => t(k));
  const did = row.private
    ? 'fl.w.did.' + row.access
    : row.access === 'changed' ? 'fl.w.did.changed' : row.access === 'stopped' ? 'fl.w.did.everydayStopped' : 'fl.w.did.everydayRead';
  const next = nextOf(row);
  const protectKey = protectKeys.get(row.path);
  // Each answer carries its colour's glyph, so the state is seen before it is read (guidelines §9.3): what the AI did
  // in the row's own look, only a private file in colour; nothing on this window is ever a thing to do.
  const reach = LOOKS[LOOK[row.access === 'changed' ? 'read' : row.access]];
  const glyphs: readonly (readonly [string, Tone])[] = [
    [reach.glyph, row.private ? reach.tone : 'grey'],
    PROTECTED[row.protection],
    [LOOKS.none.glyph, 'grey'],
  ];
  const fact = (at: number, question: string, answer: string): string => {
    const [glyph, tone] = glyphs[at] as readonly [string, Tone];
    return '<div class="fw-row"><span class="fw-glyph fw-' + tone + '" aria-hidden="true">' + glyph + '</span>' +
      '<div><div class="fw-q">' + label(question) + '</div><div class="fw-a">' + label(answer) + '</div></div></div>';
  };
  return popup({
    id,
    size: 'small',
    labelledBy: id + '-title',
    body: '<div class="fw"><div class="fw-top"><div class="fw-id"><h2 class="fw-title" id="' + id + '-title">' + label(row.kind) + '</h2>' +
      '<span class="fl-chip" title="' + e(row.path) + '">' + e(names(row.path)) + '</span></div>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
      '<div class="fw-facts">' + fact(0, 'fl.w.did', did) + fact(1, 'fl.w.prot', 'fl.w.prot.' + row.protection) + fact(2, 'fl.w.next', next) + '</div></div>' +
      popupFoot('', pill({ label: label('app.close'), tone: 'outline', size: 'md', button: true, attributes: CLOSES }) +
        (protectKey === undefined ? '' : '<span data-protect-open="' + protectKey + '">' +
          pill({ label: label(protectLabel(row)), tone: row.protection === 'na' ? 'outline' : 'light', size: 'md', href: '#protect-' + protectKey, attributes: opener('protect-' + protectKey) }) + '</span>'), true),
  });
}

/**
 * P34: the filters, applied to the rows as the person changes them; the counts follow a file marked done or protected.
 * Each Files view works within its own box, so a page may hold more than one: the report holds its own, and the
 * Conversations page shows a report's in a window (`for-people-who-build-with-ai.md` F58) and starts it through
 * `window.agentwhyFiles(box)` once it is in place. A view already started is left alone.
 */
export const FILES_SCRIPT = String.raw`
(() => {
  const started = new WeakSet();
  const start = (table) => {
    if (started.has(table)) return;
    started.add(table);
    const box = table.closest('.fl') || document;
    const rows = [...table.querySelectorAll('[data-file-key]')];
    const search = box.querySelector('[data-files-search]');
    const state = { group: 'all', did: 'any', prot: 'any', text: '' };
    const apply = () => {
      let shown = 0;
      rows.forEach((row) => {
        const on = (state.group === 'all' || row.dataset.group === state.group) && (state.did === 'any' || row.dataset.did === state.did) &&
          (state.prot === 'any' || row.dataset.prot === state.prot) && (state.text === '' || row.dataset.search.includes(state.text));
        row.hidden = !on;
        if (on) shown += 1;
      });
      table.querySelectorAll('[data-files-tier]').forEach((heading) => {
        heading.hidden = !rows.some((row) => !row.hidden && row.dataset.tier === heading.dataset.filesTier);
      });
      box.querySelectorAll('[data-files-shown]').forEach((element) => { element.textContent = String(shown); });
      const empty = table.querySelector('.dt-empty');
      if (empty) empty.hidden = shown !== 0;
      box.querySelectorAll('[data-files-group]').forEach((button) => {
        const on = button.dataset.filesGroup === state.group;
        button.classList.toggle('fl-on', on);
        button.setAttribute('aria-pressed', String(on));
      });
      ['fix', 'fixed'].forEach((group) => box.querySelectorAll('[data-files-count="' + group + '"]').forEach((element) => {
        element.textContent = String(rows.filter((row) => row.dataset.group === group).length);
      }));
      box.querySelectorAll('[data-files-did]').forEach((select) => { select.value = state.did; });
      box.querySelectorAll('[data-files-prot]').forEach((select) => { select.value = state.prot; });
      const clear = box.querySelector('[data-files-clear]');
      if (clear) clear.hidden = state.group === 'all' && state.did === 'any' && state.prot === 'any' && state.text === '';
    };
    if (search) search.addEventListener('input', () => { state.text = search.value.trim().toLowerCase(); apply(); });
    box.addEventListener('click', (event) => {
      const group = event.target.closest('[data-files-group]');
      if (group) { state.group = group.dataset.filesGroup; apply(); return; }
      if (event.target.closest('[data-files-clear]')) {
        Object.assign(state, { group: 'all', did: 'any', prot: 'any', text: '' });
        if (search) search.value = '';
        apply();
      }
    });
    box.addEventListener('change', (event) => {
      if (event.target.matches('[data-files-did]')) { state.did = event.target.value; apply(); }
      if (event.target.matches('[data-files-prot]')) { state.prot = event.target.value; apply(); }
    });
    document.addEventListener('files-changed', apply);
    apply();
  };
  window.agentwhyFiles = (scope) => scope.querySelectorAll('[data-files-table]').forEach(start);
  window.agentwhyFiles(document);
})();
`;

/*
 * The heading of each part - read, only its name seen, the rest - reads as a title and stays at the top of the window
 * while its rows scroll under it (the maintainer, 2026-09-28), on the report and in the Conversations window alike. A
 * table that can scroll sideways is a scroll box of its own, which nothing inside can stick to the window through; so
 * only where the table fits its width does it clip instead of scroll, and in a narrow window it keeps scrolling
 * sideways, its headings in place (guidelines §4 "File table").
 */
export const FILES_VIEW_STYLE = String.raw`
.fl{max-width:1100px;margin:0 auto;container:files/inline-size}
.fl .dt-group{position:sticky;top:0;z-index:3;padding:13px 20px;font-size:16px;font-weight:650;letter-spacing:0;color:var(--text)}
.fl .dt-group-cell{gap:10px}
.fl .dt-group-dot{width:9px;height:9px}
.fl .dt-group-count{font-size:14.5px}
.fl .dt-row a,.fl .dt-row button{scroll-margin-top:64px}
@container files (min-width:982px){.fl .dt{overflow:clip}}
.fl .hero{margin-bottom:28px}
.fl .hero-fact,.fl .hero-action{font-size:34px;line-height:1.15}
.fl .hero-lead{font-size:16px;max-width:560px}
.fl-clean .hero-action{color:var(--mint)}
.fl-filters{flex-direction:column;gap:12px;margin-bottom:18px}
.js .fl-filters.js-only{display:flex}
.fl-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.fl-row>.i18n{max-width:100%}.fl-row .ls{max-width:100%}.fl-row .ls-select{min-width:0}
.fl-search{flex:1 1 220px;min-width:0;background:var(--card);border:1px solid var(--white-10);border-radius:999px;padding:9px 16px;color:var(--text);font:inherit;font-size:14px;outline:none}
.fl-search:focus-visible{border-color:var(--coral-50)}
.fl-pills{display:flex;gap:8px;flex-wrap:wrap}
.fl-pill{display:flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--white-12);background:transparent;color:var(--text-soft)}
.fl-pill.fl-on{background:var(--text);color:var(--bg);border-color:var(--text)}
.fl-count{opacity:.7}
.fl-clear{font-size:14px;font-weight:600;padding:8px}.fl-clear[hidden]{display:none}
.fl-kind{display:block;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl-chip{display:inline-flex;margin-top:6px;font-family:var(--mono);font-size:13.5px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:2px 7px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.fl-plain{font-size:13.5px;font-weight:600;color:var(--text-2)}
.fl-prot{display:flex;align-items:center;gap:10px;flex-wrap:nowrap}
.fl-prot[hidden],[data-protected][hidden]{display:none}
.fw-glyph svg{width:13px;height:13px}
[data-row-control]{position:relative;z-index:2}
.fl-act{font-size:13.5px;font-weight:600;white-space:nowrap}.fl-act[hidden]{display:none}
.fl-act-fix{color:var(--coral-text)}.fl-act-fixed{color:var(--mint)}.fl-act-none{color:var(--text-3)}
.fl-note{margin:12px 4px 0;font-size:13px;color:var(--text-3)}
.fl-names{margin-top:24px}.fl-names .fold-body>.dt{margin-top:0}
.fw{padding:24px 28px 26px}
.fw-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
.fw-id{min-width:0}
.fw-title{margin:0;font-size:24px;line-height:1.2;letter-spacing:-0.015em;font-weight:650;color:var(--text)}
.fw .fl-chip{margin-top:10px}
.fw-facts{border-radius:14px;border:1px solid var(--white-09);background:var(--raised)}
.fw-row{display:grid;grid-template-columns:26px minmax(0,1fr);gap:14px;padding:16px 18px;border-top:1px solid var(--white-06)}
.fw-row:first-child{border-top:none}
.fw-glyph{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.fw-coral{background:var(--coral-16);color:var(--coral-text)}.fw-amber{background:var(--amber-16);color:var(--amber)}
.fw-mint{background:var(--mint-14);color:var(--mint)}.fw-sand{background:var(--sand-16);color:var(--sand)}.fw-blue{background:var(--blue-16);color:var(--blue)}.fw-grey{background:var(--white-06);color:var(--text-2)}
.fw-q{font-size:13px;font-weight:600;color:var(--text-3);line-height:1.3;margin:4px 0 4px}
.fw-a{font-size:15px;line-height:1.5;color:var(--text);text-wrap:pretty}
@media (max-width:640px){.fw{padding:20px 18px 22px}.fw-title{font-size:21px}.fw-row{padding:14px}}
`;
