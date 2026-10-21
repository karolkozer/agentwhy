// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ReportModel, RunStep, WroteBefore } from '../../report-model.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, type Translate } from '../report-copy.ts';
import { avatar } from '../ui/avatar.ts';
import { pill } from '../ui/button.ts';
import { opener } from '../ui/popup.ts';
import { LOOKS, type Look } from '../ui/status-look.ts';
import { kindOfName, type FileProtection } from './files.ts';
import { aiLookOf } from './files-view.ts';
import { nameOf } from './item-names.ts';
import { fileTone, stepSentence, wroteHtml, type StepsContext } from './step-by-step-view.ts';

/** The most visits a file's panel lists; the rest are counted. */
const VISITS_SHOWN = 8;

interface Visit {
  readonly agentIndex: number;
  readonly step: RunStep;
  readonly wrote: WroteBefore;
  readonly runSteps: number;
}

interface FileEntry {
  readonly path: string;
  readonly segments: readonly string[];
  readonly private: boolean;
  /** SB25 as amended 2026-10-11: what its row in Files draws - the AI column's look and the mode column's state. */
  look: Look;
  mode?: FileProtection;
  /** Every step reached it by name alone - a listing printed it, a command named it. */
  namedOnly: boolean;
  readonly visits: Visit[];
}

interface Folder {
  name: string;
  readonly folders: Map<string, Folder>;
  readonly files: FileEntry[];
  /** SB25: names only seen here, folded into one line that opens on them. */
  readonly named: string[];
}

/**
 * "By folder" (`2026-10-11-step-by-step.md` SB24-SB27): every file a step reached, in its folders, the way a code editor
 * shows a project - icons in the page's greys, the colour on the name and its dot - and for each, who went there and what
 * they wrote first. With a script the panel stands beside the tree; with none, under each file (P45).
 */
export function byFolderPanel(report: ReportModel, context: StepsContext): string {
  const entries = entriesOf(report, context);
  if (entries.length === 0) return '<p class="stp-empty">' + inLanguages((t) => t('bf.empty')) + '</p>';
  const root = treeOf(entries);
  const ordinals = new Map(report.graph.agents.map((agent) => [agent.index, agent.ordinal]));
  const main = report.graph.main.index;
  const who = (index: number, t: Translate): string => {
    if (index === main) return t('st.main');
    const ordinal = ordinals.get(index);
    return ordinal === undefined ? t('sb.someHelper') : t('st.helper', { ordinal });
  };
  const initials = (index: number): string => index === main ? 'AI' : 'H' + (ordinals.get(index) ?? '');
  const shown = entries.filter((entry) => !entry.namedOnly || entry.private);
  const first = shown.find((entry) => LOOK_RANK[entry.look] > 0) ?? shown[0];

  const panel = (entry: FileEntry): string => {
    const name = entry.segments[entry.segments.length - 1] ?? entry.path;
    const title = inLanguages((t, lang) => context.titleOf(entry.path, t, lang) ?? t(entry.private ? 'rp.item.private' : kindOfName(name)));
    const visits = entry.visits.slice(0, VISITS_SHOWN).map((visit) =>
      '<div class="bf-visit' + (visit.step.files.some((file) => file.path === entry.path && file.private === true && fileTone(file) === 'coral') ? ' bf-visit-risk' : '') + '">' +
      avatar(initials(visit.agentIndex), 'grey', 30) + '<div class="bf-visit-text">' +
      wroteHtml(visit.wrote, visit.runSteps, visit.agentIndex === main, (t) => who(visit.agentIndex, t), context.names) +
      '<div class="stp-did">' + inLanguages((t) => stepSentence(visit.step, t, context.names, entry.path)) + '</div></div></div>').join('');
    const more = entry.visits.length - VISITS_SHOWN;
    const window = context.windowOf(entry.path);
    return '<div class="bf-crumb" title="' + e(entry.path) + '">' + e(entry.path) + '</div>' +
      '<div class="bf-title">' + iconOf(entry, name, 40) + '<div><div class="bf-ttl">' + title + '</div><div class="bf-name">' + e(name) + '</div></div></div>' +
      '<div class="bf-tag">' + lookPill(entry) + modeBadge(entry) + '</div>' +
      '<div class="bf-sec">' + inLanguages((t) => t('bf.who')) + '</div><div class="bf-visits">' + visits + '</div>' +
      (more > 0 ? '<p class="bf-more">' + inLanguages((t) => t('bf.moreVisits', { n: more })) + '</p>' : '') +
      (window === undefined ? '' : '<div class="bf-act">' + pill({ label: inLanguages((t) => t('sb.whatHappened')), tone: 'outline', size: 'md', href: '#' + window, attributes: opener(window) }) + '</div>');
  };

  const fileRow = (entry: FileEntry, depth: number): string => {
    const name = entry.segments[entry.segments.length - 1] ?? entry.path;
    const agents = [...new Set(entry.visits.map((visit) => visit.agentIndex))];
    const tone = toneOfLook(entry.look);
    return '<li class="bf-file" data-private="' + (entry.private ? '1' : '0') + '"><details class="bf-f"' + (entry === first ? ' data-bf-first' : '') + '>' +
      '<summary class="bf-row' + (entry === first ? ' bf-sel' : '') + '" style="--d:' + depth + '" data-bf-file>' +
      '<span class="bf-tw bf-tw-none" aria-hidden="true"></span>' + iconOf(entry, name, 20) +
      '<span class="bf-nm bf-nm-' + tone + '">' + e(name) + '</span>' +
      '<span class="bf-deco">' + modeBadge(entry) + '<span class="bf-avs">' + agents.slice(0, 4).map((index) => avatar(initials(index), 'grey', 30)).join('') + '</span>' +
      (tone === 'grey' ? '' : '<span class="bf-bub bf-bub-' + tone + '" aria-hidden="true"></span>') + '</span></summary>' +
      '<div class="bf-panel">' + panel(entry) + '</div></details></li>';
  };

  const folderRow = (folder: Folder, depth: number): string => {
    const tone = toneOfLook(lookOfFolder(folder));
    const children = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((child) => folderRow(child, depth + 1)).join('') +
      folder.files.filter((entry) => !entry.namedOnly || entry.private).sort((a, b) => a.path.localeCompare(b.path)).map((entry) => fileRow(entry, depth + 1)).join('') +
      (folder.named.length === 0 ? '' : '<li class="bf-names" data-private="0" style="--d:' + (depth + 1) + '"><details><summary>' +
        inLanguages((t) => t('bf.names', { n: folder.named.length })) + '</summary><div class="bf-names-list">' +
        [...folder.named].sort((a, b) => a.localeCompare(b)).map((name) => '<span>' + e(name) + '</span>').join('') + '</div></details></li>');
    return '<li class="bf-dir" data-private="' + (holdsPrivate(folder) ? '1' : '0') + '"><details class="bf-d" open>' +
      '<summary class="bf-row bf-row-dir" style="--d:' + depth + '"><span class="bf-tw" aria-hidden="true"></span>' + FOLDER_ICON +
      '<span class="bf-nm">' + (folder.name === '' ? inLanguages((t) => t('bf.project')) : e(folder.name)) + '</span><span class="bf-deco">' +
      (tone === 'grey' ? '' : '<span class="bf-bub bf-bub-' + tone + '" aria-hidden="true"></span>') + '</span></summary>' +
      '<ul class="bf-t">' + children + '</ul></details></li>';
  };

  return '<div class="bf" data-folders>' +
    '<div class="bf-bar"><div class="stp-bar js-only" role="group">' +
    '<button type="button" class="stp-seg stp-on" data-folders-show="all" aria-pressed="true">' + inLanguages((t) => t('bf.show.all')) + '</button>' +
    '<button type="button" class="stp-seg" data-folders-show="private" aria-pressed="false">' + inLanguages((t) => t('sb.show.private')) + '</button></div>' +
    // The legend says each colour in the words the file's own pill uses (`lookPill`), so one look reads one way.
    '<div class="bf-legend">' + (['read', 'opened', 'stopped', 'name'] as const).map((look) =>
      '<span><span class="bf-bub bf-bub-' + toneOfLook(look) + '" aria-hidden="true"></span>' + inLanguages((t) => t(LOOKS[look].label)) + '</span>').join('') + '</div></div>' +
    '<div class="bf-ex"><div class="bf-tree"><div class="bf-head">' + inLanguages((t) => t('bf.head', { n: shown.length })) + '</div>' +
    '<ul class="bf-t bf-root">' + folderRow(root, 0) + '</ul></div>' +
    '<div class="bf-pane js-only" data-folders-pane aria-live="polite">' + (first === undefined ? '' : panel(first)) + '</div></div>' +
    '<p class="stp-foot">' + inLanguages((t) => t('bf.foot')) + '</p></div>';
}

/** The order the Files tab puts its parts in (`files-view.ts` TIERS): read, not recorded, opened, stopped, a name only seen. */
const LOOK_RANK: Readonly<Record<Look, number>> = { read: 5, fixed: 5, allowed: 5, unchecked: 4, opened: 3, stopped: 2, name: 1, none: 0, failed: 0, outside: 0, checking: 0 };
const MODE_TONE: Readonly<Record<FileProtection, string>> = { yes: 'mint', told: 'sand', no: 'coral', unknown: 'grey', na: '' };

function toneOfLook(look: Look): string {
  return look === 'none' ? 'grey' : LOOKS[look].tone;
}

/** What happened to the file, in the words and colour of its row's AI column. */
function lookPill(entry: FileEntry): string {
  const tone = toneOfLook(entry.look);
  return '<span class="stp-pill stp-pill-' + tone + '"><span class="stp-pill-dot" aria-hidden="true"></span>' + inLanguages((t) => t(LOOKS[entry.look].label)) + '</span>';
}

/** How the file is held, in the words and colour of its row's mode column; nothing for a file that is not private. */
function modeBadge(entry: FileEntry): string {
  const tone = entry.mode === undefined ? '' : MODE_TONE[entry.mode];
  return tone === '' || entry.mode === undefined ? '' : '<span class="bf-mode bf-mode-' + tone + '">' + inLanguages((t) => t('fl.mode.' + entry.mode)) + '</span>';
}

/**
 * Every file a step reached, with each visit. Its look and mode are its row's in Files (SB25 as amended 2026-10-11, by the
 * maintainer: the colours did not say what Files said); a file with no row is drawn as one nothing private happened to.
 */
function entriesOf(report: ReportModel, context: StepsContext): FileEntry[] {
  const entries = new Map<string, FileEntry>();
  for (const agent of report.runs ?? []) {
    for (const run of agent.runs) {
      for (const step of run.steps) {
        for (const file of step.files) {
          const path = file.path as string;
          const known = entries.get(path) ?? {
            path, segments: path.split('/').filter((part, at) => part !== '' || at === 0), private: file.private === true,
            look: 'none' as Look, namedOnly: true, visits: [] as Visit[],
          };
          if (file.how !== 'named') known.namedOnly = false;
          if (known.visits[known.visits.length - 1]?.step !== step) known.visits.push({ agentIndex: agent.agentIndex, step, wrote: run.wrote, runSteps: run.steps.length });
          entries.set(path, known);
        }
      }
    }
  }
  for (const entry of entries.values()) {
    const row = context.rowOf?.(entry.path);
    if (row?.private !== true) continue;
    entry.look = aiLookOf(row);
    entry.mode = row.protection;
  }
  return [...entries.values()];
}

/** The files in their folders: the folder every path shares is the root, and a folder holding one folder alone is one row. */
function treeOf(entries: readonly FileEntry[]): Folder {
  const folders = entries.map((entry) => entry.segments.slice(0, -1));
  const shared: string[] = [];
  for (let at = 0; folders.every((each) => each.length > at && each[at] === folders[0]?.[at]); at += 1) shared.push(folders[0]?.[at] as string);
  const root: Folder = { name: shared.filter((part) => part !== '').pop() ?? '', folders: new Map(), files: [], named: [] };
  for (const entry of entries) {
    let folder = root;
    for (const part of entry.segments.slice(shared.length, -1)) {
      const next = folder.folders.get(part) ?? { name: part, folders: new Map(), files: [], named: [] };
      folder.folders.set(part, next);
      folder = next;
    }
    folder.files.push(entry);
    if (entry.namedOnly && !entry.private) folder.named.push(entry.segments[entry.segments.length - 1] ?? entry.path);
  }
  compact(root);
  return root;
}

function compact(folder: Folder): void {
  for (const [key, child] of [...folder.folders]) {
    compact(child);
    const only = child.folders.size === 1 && child.files.length === 0 ? [...child.folders.values()][0] : undefined;
    if (only !== undefined) {
      folder.folders.delete(key);
      only.name = child.name + '/' + only.name;
      folder.folders.set(only.name, only);
    }
  }
}

/** A folder's dot: the weightiest look of what it holds, by the Files tab's order. */
function lookOfFolder(folder: Folder): Look {
  return [...folder.files.map((entry) => entry.look), ...[...folder.folders.values()].map(lookOfFolder)]
    .reduce<Look>((best, look) => LOOK_RANK[look] > LOOK_RANK[best] ? look : best, 'none');
}

function holdsPrivate(folder: Folder): boolean {
  return folder.files.some((entry) => entry.private) || [...folder.folders.values()].some(holdsPrivate);
}

/** SB25, SBD4: the kind of a file, drawn in the page's greys - a shape, never a colour. */
function iconOf(entry: FileEntry, name: string, size: number): string {
  const kind = entry.private ? 'keys' : kindOfName(nameOf(name)).replace('fl.kind.', '');
  const shape = ICONS[kind] ?? ICONS['file'];
  return '<svg class="bf-ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + shape + '</svg>';
}

const PAGE = '<path d="M6 3.5h8l4 4v13H6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 3.5v4h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
const ICONS: Readonly<Record<string, string>> = {
  file: PAGE,
  code: PAGE + '<path d="M10.5 12l-2 2 2 2M13.5 12l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  settings: PAGE + '<path d="M10 11.5c-1 0-1 1-1 1.5s0 1.5-1 1.5c1 0 1 1 1 1.5s0 1.5 1 1.5M14 11.5c1 0 1 1 1 1.5s0 1.5 1 1.5c-1 0-1 1-1 1.5s0 1.5-1 1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  notes: PAGE + '<path d="M9 12h6M9 14.5h6M9 17h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  aiNotes: PAGE + '<path d="M12 11.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/>',
  keys: '<circle cx="8.5" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12.1 12h8M17.5 12v2.6M20.1 12v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
};
const FOLDER_ICON = '<svg class="bf-ico bf-ico-dir" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor"/></svg>';

/** SB26, SB27: a picked file's panel beside the tree, and *Only private*. With no script, each panel opens under its file. */
export const BY_FOLDER_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const show = event.target.closest('[data-folders-show]');
  if (show) {
    const view = show.closest('[data-folders]');
    view.classList.toggle('bf-only', show.getAttribute('data-folders-show') === 'private');
    view.querySelectorAll('[data-folders-show]').forEach((each) => {
      const on = each === show;
      each.classList.toggle('stp-on', on);
      each.setAttribute('aria-pressed', String(on));
    });
    return;
  }
  const row = event.target.closest('[data-bf-file]');
  if (!row) return;
  event.preventDefault();
  const view = row.closest('[data-folders]');
  view.querySelectorAll('.bf-sel').forEach((each) => each.classList.remove('bf-sel'));
  row.classList.add('bf-sel');
  view.querySelector('[data-folders-pane]').innerHTML = row.parentElement.querySelector('.bf-panel').innerHTML;
});
`;

export const BY_FOLDER_STYLE = String.raw`
.bf-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:4px 0 16px}
.bf-bar .stp-bar{margin:0}
.bf-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13.5px;color:var(--text-2)}
.bf-legend>span{display:inline-flex;align-items:center;gap:7px}
.bf-only [data-private="0"]{display:none}
/* clip, not hidden: hidden makes the frame a scroller of its own, and the panel could not stick to the window. */
.bf-ex{display:grid;grid-template-columns:1fr;border:1px solid var(--white-09);border-radius:16px;overflow:clip;background:var(--panel)}
.js .bf-ex{grid-template-columns:minmax(400px,13fr) 11fr}
.bf-tree{background:var(--card);padding:8px 0 14px;min-width:0;overflow-x:auto}
.js .bf-tree{border-right:1px solid var(--white-08)}
.bf-head{padding:6px 16px 10px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3)}
.bf-t{list-style:none;margin:0;padding:0}
.bf-row{list-style:none;display:flex;align-items:center;gap:8px;min-height:34px;padding:0 14px 0 calc(10px + var(--d,0) * 18px);cursor:pointer;border:1px solid transparent;user-select:none}
.bf-row::-webkit-details-marker{display:none}
.bf-row:hover{background:var(--white-04)}
.js .bf-row.bf-sel{background:var(--coral-08);border-color:var(--coral-40)}
.bf-tw{flex:none;width:8px;height:8px;margin:0 3px;border-right:1.5px solid var(--text-3);border-bottom:1.5px solid var(--text-3);transform:rotate(-45deg);transition:transform .12s}
details[open] > .bf-row-dir .bf-tw{transform:rotate(45deg)}
.bf-tw-none{visibility:hidden}
.bf-ico{flex:none;color:var(--text-3)}.bf-ico-dir{color:var(--column-label)}
/* A long name wraps rather than end in an ellipsis (the maintainer, 2026-10-11): the name is what the person is looking for. */
.bf-nm{flex:1;min-width:0;font-family:var(--mono);font-size:14px;color:var(--text-soft);overflow-wrap:anywhere;line-height:1.35;padding:6px 0}
.bf-row-dir .bf-nm{color:var(--text);font-weight:600}
.bf-nm-coral{color:var(--coral-text);font-weight:600}.bf-nm-sand{color:var(--sand);font-weight:600}.bf-nm-mint{color:var(--mint);font-weight:600}
.bf-nm-blue{color:var(--blue)}.bf-nm-amber{color:var(--amber)}
.bf-mode{flex:none;font-family:var(--sans);font-size:11.5px;font-weight:650;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.bf-mode-mint{color:var(--mint);background:var(--mint-10)}.bf-mode-sand{color:var(--sand);background:var(--sand-16)}
.bf-mode-coral{color:var(--coral-text);border-color:var(--coral-40)}.bf-mode-grey{color:var(--text-3);background:var(--white-04)}
.bf-tag{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bf-deco{flex:none;display:flex;align-items:center;gap:6px}
.bf-avs{display:flex}.bf-avs .av{width:22px;height:22px;font-size:8.5px;margin-left:-5px;border:2px solid var(--card)}.bf-avs .av:first-child{margin-left:0}
.bf-bub{flex:none;width:8px;height:8px;border-radius:50%}
.bf-bub-coral{background:var(--coral)}.bf-bub-sand{background:var(--sand)}.bf-bub-amber{background:var(--amber)}.bf-bub-blue{background:var(--blue)}.bf-bub-mint{background:var(--mint)}
.bf-names{padding:6px 14px 6px calc(40px + var(--d,0) * 18px);font-size:13.5px;color:var(--text-3)}
.bf-names summary{list-style:none;cursor:pointer;width:fit-content;font-weight:600;color:var(--text-2)}
.bf-names summary::-webkit-details-marker{display:none}
.bf-names summary:hover{color:var(--text)}
.bf-names-list{display:flex;flex-direction:column;gap:2px;margin-top:6px;font-family:var(--mono);font-size:13.5px;color:var(--blue)}
.bf-panel{padding:14px 16px 18px 24px;border-top:1px solid var(--white-06);background:var(--panel)}
.js .bf-panel{display:none}
/* The panel stays in view while the tree scrolls past it (the maintainer, 2026-10-11): a file low in the tree opens beside it. */
.bf-pane{display:none;padding:24px 26px 26px;min-width:0;position:sticky;top:16px;align-self:start;max-height:calc(100vh - 32px);overflow-y:auto}
.js .bf-pane.js-only{display:block}
.bf-crumb{font-family:var(--mono);font-size:13px;color:var(--text-3);overflow-wrap:anywhere}
.bf-title{display:flex;align-items:center;gap:14px;margin-top:12px}
.bf-ttl{font-size:21px;font-weight:650;line-height:1.2}
.bf-name{font-family:var(--mono);font-size:14px;color:var(--text-2);margin-top:2px}
.bf-tag{margin-top:12px}
.bf-sec{margin-top:22px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3)}
.bf-visits{display:grid;gap:10px;margin-top:10px}
.bf-visit{display:flex;gap:12px;padding:14px 16px;border-radius:12px;background:var(--card);border:1px solid var(--white-10)}
.bf-visit-risk{border-color:var(--coral-40)}
.bf-visit-text{min-width:0;flex:1}
.bf-visit .stp-words{margin:0;padding:0 0 6px}
.bf-visit .stp-q{font-size:16px}
.bf-more{margin:10px 0 0;font-size:14px;color:var(--text-3)}
.bf-act{margin-top:18px}
@media (max-width:820px){.bf-pane{position:static;max-height:none}.js .bf-ex{grid-template-columns:1fr}.js .bf-tree{border-right:none;border-bottom:1px solid var(--white-08)}.bf-pane{padding:20px 16px}}
@media (prefers-reduced-motion:reduce){.bf-tw{transition:none}}
`;
