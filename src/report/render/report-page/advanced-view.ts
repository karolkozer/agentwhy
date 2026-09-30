import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, type Translate } from '../report-copy.ts';
import type { ReportModel } from '../../report-model.ts';
import { avatarGroup } from '../ui/avatar.ts';
import { hero } from '../ui/hero.ts';
import { pillTabs } from '../ui/pill-tabs.ts';
import { opens } from '../ui/popup.ts';
import { stats } from '../ui/stats.ts';
import { fileStory, type FileStory } from './file-story.ts';
import { helperViews, type HelperStatus, type HelperView } from './helpers.ts';
import { titleOf, type FileNames } from './item-names.ts';
import type { Clock } from './times.ts';
import { agentRuns, recordTab } from './record-view.ts';
import type { ToDoItem } from './to-do.ts';
import { storyId } from './to-do-view.ts';

/**
 * "Advanced" (the report page spec P39-P41; design file *agentwhy App*): the full record, for a developer - every private
 * file on the list, grouped by what still needs doing, and every AI with its identity, its job as asked, and what it
 * touched. Nothing here is new: every number comes from `fileStory` and `helperViews`, which the other views read too.
 *
 * "First → last" names the first and last record, not their times: times are M4, their own slice.
 */
export function advancedView(report: ReportModel, items: readonly ToDoItem[], done: ReadonlySet<string>, clock: Clock, names: FileNames): string {
  const stories = items.map((item) => fileStory(report, item.path));
  const views = helperViews(report);
  const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const fixed = items.filter((item) => done.has(item.path)).length;

  const files = stats([
    { label: label('adv.stat.files'), value: String(items.length), tone: 'coral' },
    { label: label('adv.stat.ais'), value: String(views.filter((view) => view.status === 'read').length) },
    { label: label('adv.stat.events'), value: String(stories.reduce((sum, story) => sum + story.entries.length, 0)) },
    { label: label('adv.stat.fixed'), value: fixed + ' / ' + items.length, ...(items.length > 0 && fixed === items.length ? { tone: 'mint' as const } : {}) },
  ], 'page') + fileTable(items, stories, done, clock);

  return '<div class="adv">' +
    hero({ eyebrow: label('adv.eyebrow'), fact: label('adv.title'), action: '', lead: label('adv.lead') }) +
    pillTabs([
      { label: label('adv.tab.files'), panel: files },
      { label: label('adv.tab.helpers'), panel: helperTable(report, views, names) + agentRuns(report) },
      { label: label('adv.tab.record'), panel: recordTab(report) },
    ], 'inset') + '</div>';
}

const FILE_COLUMNS = 'minmax(240px,1.6fr) 96px 140px minmax(150px,1fr) 64px minmax(170px,1fr) 16px';

/** P40: "Needs action" then "Fixed", no status column; a row opens the file's story on its record tab. */
function fileTable(items: readonly ToDoItem[], stories: readonly FileStory[], done: ReadonlySet<string>, clock: Clock): string {
  const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const row = (item: ToDoItem, at: number): string => {
    const story = stories[at] as FileStory;
    const readers = story.holders.filter((holder) => holder.read).map((holder) => ({
      initials: holder.agent.ordinal === undefined ? 'AI' : 'H' + holder.agent.ordinal,
      tone: holder.agent.ordinal === undefined ? 'coral' as const : 'grey' as const,
    }));
    const tools = new Map<string, number>();
    for (const entry of story.entries) if (entry.did !== undefined) tools.set(entry.did, (tools.get(entry.did) ?? 0) + entry.count);
    // M4: the first and last record's time beside its reference, where the record has one; never used to order them.
    const stamp = (ref: string | undefined, time: number | undefined): string | undefined =>
      ref === undefined ? undefined : (time === undefined ? '' : clock.time(time) + ' · ') + ref;
    const first = stamp(story.entries[0]?.evidence[0], story.entries[0]?.at);
    const last = stamp(story.entries.at(-1)?.evidence.at(-1), story.entries.length > 1 ? story.entries.at(-1)?.at : undefined);
    return '<a class="adv-row' + (done.has(item.path) ? '' : ' adv-open') + '"' + opens(storyId(at)) + ' data-story-tab="2" style="grid-template-columns:' + FILE_COLUMNS + '">' +
      (done.has(item.path) ? '' : '<span class="adv-bar" aria-hidden="true"></span>') +
      '<span class="adv-file"><span class="adv-path">' + e(item.path) + '</span><span class="adv-sub">' + inLanguages((t, lang) => titleOf(item, t, lang)) + '</span></span>' +
      '<span>' + (readers.length === 0 ? '<span class="adv-dim">—</span>' : avatarGroup(readers)) + '</span>' +
      '<span class="adv-access adv-s-read"><span class="adv-dot"></span>' + label('fl.acc.read') + '</span>' +
      '<span class="adv-chips">' + [...tools].map(([tool, n]) => '<span class="adv-chip">' + e(tool) + (n > 1 ? ' ×' + n : '') + '</span>').join('') + '</span>' +
      '<span class="adv-num">' + story.entries.length + '</span>' +
      '<span class="adv-refs">' + (first === undefined ? '—' : e(first)) + (last === undefined || last === first ? '' : '<br><span class="adv-dim">→ ' + e(last) + '</span>') + '</span>' +
      '<span class="adv-more" aria-hidden="true">›</span></a>';
  };
  const open = items.map((item, at) => ({ item, at })).filter(({ item }) => !done.has(item.path));
  const closed = items.map((item, at) => ({ item, at })).filter(({ item }) => done.has(item.path));
  const head = ['adv.col.file', 'adv.col.readBy', 'adv.col.access', 'adv.col.tools', 'adv.col.events', 'adv.col.firstLast', ''];
  return '<div class="adv-table"><div class="adv-inner" style="min-width:1100px">' +
    '<div class="adv-head" style="grid-template-columns:' + FILE_COLUMNS + '">' + head.map((key) => '<span>' + (key === '' ? '' : label(key)) + '</span>').join('') + '</div>' +
    (open.length === 0 ? '' : '<div class="adv-group adv-group-open">' + label('adv.needs', { n: open.length }) + '</div>' + open.map(({ item, at }) => row(item, at)).join('')) +
    (closed.length === 0 ? '' : '<div class="adv-group adv-group-fixed">' + label('adv.fixed', { n: closed.length }) + '</div>' + closed.map(({ item, at }) => row(item, at)).join('')) +
    (items.length === 0 ? '<div class="adv-empty">' + label('adv.noFiles') + '</div>' : '') +
    '</div></div><p class="adv-note">' + label('adv.hint') + '</p>';
}

const HELPER_COLUMNS = 'minmax(190px,1fr) minmax(280px,2fr) 150px minmax(150px,1fr) minmax(180px,1.2fr) 70px 16px';

/** P41: one row per AI - its name and identity, its job as asked, what it did, its tools, its files, its actions. */
function helperTable(report: ReportModel, views: readonly HelperView[], names: FileNames): string {
  const label = (key: string): string => inLanguages((t) => t(key));
  const agents = new Map([report.graph.main, ...report.graph.agents].map((agent) => [agent.index, agent]));
  const toolsOf = (index: number): readonly string[] => {
    const flow = report.flows.find((each) => each.agentIndex === index);
    return [...new Set((flow?.steps ?? []).flatMap((step) => (step.kind === 'reached' || step.kind === 'carried' ? [step.did as string] : [])))];
  };
  const row = (view: HelperView, at: number): string => {
    const helper = view.agent.ordinal !== undefined;
    const identity = helper ? agents.get(view.agent.index)?.label : undefined;
    return '<a class="adv-row adv-agent adv-edge-' + view.status + '"' + opens('helper-' + at) + ' style="grid-template-columns:' + HELPER_COLUMNS + '">' +
      '<span class="adv-who' + (helper ? ' adv-indent' : '') + '">' + (helper ? '<span class="adv-tree" aria-hidden="true">└</span>' : '') +
      '<span><span class="adv-name">' + inLanguages((t) => nameOf(view, t)) + '</span>' +
      (identity === undefined ? '' : '<span class="adv-id">' + e(identity) + '</span>') + '</span></span>' +
      '<span class="adv-asked">' + (helper ? (view.agent.askedTo === undefined ? '<span class="adv-dim">' + label('st.sub.notAsked') + '</span>' : '“' + e(view.agent.askedTo) + '”') : label('hp.mainJob')) + '</span>' +
      '<span class="adv-access adv-s-' + view.status + '"><span class="adv-dot"></span>' + label('adv.status.' + view.status) + '</span>' +
      '<span class="adv-chips">' + toolsOf(view.agent.index).map((tool) => '<span class="adv-chip">' + e(tool) + '</span>').join('') + '</span>' +
      '<span class="adv-chips">' + view.files.map((file) => '<span class="adv-chip" title="' + e(file.path) + '">' + e(names(file.path)) + '</span>').join('') + '</span>' +
      '<span class="adv-num">' + view.agent.actions + '</span>' +
      '<span class="adv-more" aria-hidden="true">›</span></a>';
  };
  const head = ['adv.col.helper', 'adv.col.asked', 'adv.col.access', 'adv.col.tools', 'adv.col.touched', 'adv.col.actions', ''];
  return '<div class="adv-table"><div class="adv-inner" style="min-width:1180px">' +
    '<div class="adv-head" style="grid-template-columns:' + HELPER_COLUMNS + '">' + head.map((key) => '<span>' + (key === '' ? '' : label(key)) + '</span>').join('') + '</div>' +
    views.map(row).join('') + '</div></div>';
}

function nameOf(view: HelperView, t: Translate): string {
  return view.agent.ordinal === undefined ? t('st.main') : t('st.helper', { ordinal: view.agent.ordinal });
}

/**
 * P40: a row of the file table opens the story window on the tab it names - the full record. P60: "See what's missing"
 * goes to Advanced and its Record tab.
 */
export const ADVANCED_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const record = event.target.closest('[data-record-link]');
  if (record) {
    const tab = document.querySelector('#advanced .tabs-bar [data-tab="2"]');
    if (tab) setTimeout(() => tab.click(), 0);
    return;
  }
  const row = event.target.closest('[data-story-tab]');
  if (!row) return;
  const dialog = document.getElementById(row.getAttribute('data-popup-open'));
  const tab = dialog && dialog.querySelector('[data-tab="' + row.getAttribute('data-story-tab') + '"]');
  if (tab) tab.click();
});
`;

/** The status each AI's row is drawn in: the colour of its left edge and of its dot. */
const TONES: Readonly<Record<HelperStatus, string>> = {
  read: 'var(--coral)', unknown: 'var(--amber)', named: 'var(--blue)', sample: 'var(--amber)', stopped: 'var(--mint)', none: 'var(--text-4)', empty: 'var(--amber)',
};

export const ADVANCED_VIEW_STYLE = String.raw`
.shell-main:has(#advanced.rv-on){max-width:1400px}
.adv{max-width:1320px;margin:0 auto}
.adv .hero{margin-bottom:24px}
.adv .hero-fact{font-size:34px;line-height:1.15}
.adv .hero-action{display:none}
.adv .hero-lead{font-size:16px;max-width:620px}
.adv-table{border-radius:16px;background:var(--card);border:1px solid var(--white-09);overflow:auto}
.adv-head,.adv-row{display:grid;gap:18px;align-items:center}
.adv-head{padding:13px 20px;background:var(--panel);border-bottom:1px solid var(--white-08);font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-3)}
.adv-row{position:relative;padding:14px 20px;border-bottom:1px solid var(--white-06);color:inherit;text-decoration:none}
.adv-row:hover{background:var(--white-025);color:inherit}
.adv-bar{position:absolute;left:0;top:15%;height:70%;width:2px;border-radius:0 2px 2px 0;background:var(--coral)}
.adv-group{padding:10px 20px;border-bottom:1px solid var(--white-06);font-size:13px;font-weight:600}
.adv-group-open{background:var(--coral-05);color:var(--coral-text)}.adv-group-fixed{background:var(--mint-05);color:var(--mint)}
.adv-file{min-width:0}
.adv-path{display:block;font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adv-sub{display:block;font-size:13px;color:var(--text-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adv-access{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;white-space:nowrap}
.adv-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
.adv-s-read{color:var(--coral-text)}.adv-s-unknown,.adv-s-sample{color:var(--amber)}.adv-s-named{color:var(--blue)}.adv-s-stopped{color:var(--mint)}.adv-s-none{color:var(--text-3)}.adv-s-empty{color:var(--amber)}
.adv-chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.adv-chip{font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:2px 7px;white-space:nowrap}
.adv-num{font-family:var(--mono);font-size:15px;font-weight:600}
.adv-refs{font-family:var(--mono);font-size:12.5px;color:var(--text-soft);line-height:1.5;overflow-wrap:anywhere}
.adv-dim{color:var(--text-3)}
.adv-more{color:var(--text-3)}
.adv-note{margin:12px 4px 0;font-size:13px;color:var(--text-3)}
.adv-empty{padding:28px;text-align:center;font-size:14px;color:var(--text-3)}
.adv-agent{padding-left:17px;border-left:3px solid var(--text-4)}
` + (Object.entries(TONES).map(([status, tone]) => '.adv-edge-' + status + '{border-left-color:' + tone + '}').join('\n')) + String.raw`
.adv-who{display:flex;align-items:center;gap:10px;min-width:0}.adv-indent{padding-left:18px}
.adv-tree{color:var(--text-4);font-family:var(--mono);font-size:13px}
.adv-name{display:block;font-size:15px;font-weight:600}
.adv-id{display:block;font-family:var(--mono);font-size:12px;color:var(--text-3);margin-top:2px;overflow-wrap:anywhere}
.adv-asked{font-size:14px;line-height:1.45;color:var(--text-soft)}
`;
