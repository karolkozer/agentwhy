// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, type Translate } from '../../render/report-copy.ts';
import { initial } from '../../render/ui/app-sidebar.ts';
import { pill } from '../../render/ui/button.ts';
import { projectList } from '../../render/ui/project-list.ts';
import { tag } from '../../render/ui/tag.ts';
import type { IndexProjects } from '../session-index.ts';
import type { OnboardingProject, OnboardingView } from './onboarding-view.ts';

/** The radio group the step's list chooses in (`.ai/specs/2026-09-27-which-project.md` V11). */
export const PICK_GROUP = 'ob-project';

/** The kinds V4 names, in the order the step says them; an unknown kind is counted last and not named. */
const NAMED: readonly EntryPoint[] = ['editor', 'terminal', 'desktop', 'script'];

/** A small folder, drawn: the guidelines have no emoji, not even in a button (§9.3). */
const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';

/**
 * The onboarding's first step (`which-project.md` V19-V21), as the maintainer's design *agentwhy - Wybór projektu* draws
 * it: a card for where the run started - the project found, the project a folder lies inside, a folder with no AI chats
 * - with **No, pick another project** beside the way on; the person's projects as a list to pick from; and, while another
 * project's run starts, "Switching to blog…". In the home directory the list is all there is (V7). Choosing this run's
 * own project goes on to *Who* in the page; choosing another shows it in this tab, at its own *Who* (V14-V16). With no
 * script the card and the list are drawn and nothing switches (V13).
 */
export function projectStep(view: OnboardingView, clock: { readonly now: number; readonly timeZone: string }): string {
  const project = view.project;
  // Only a run that can show another project offers its list: a choice it could not act on would be a promise.
  const projects = view.projects?.switchable === true ? view.projects : undefined;
  const picking = project.kind === 'none';
  return '<section class="ob-screen ob-step ob-step-project' + (picking ? ' ob-picking' : '') + '" data-ob-screen="project" data-ob-project="' + project.kind + '"' +
    ' aria-labelledby="' + (picking ? 'ob-pick-title' : 'ob-project-title') + '">' +
    (project.kind === 'none' ? '' : card(project, projects !== undefined)) +
    pickView(project, projects, clock) +
    (projects === undefined ? '' : switching()) +
    '</section>';
}

/** "Step 1 of 3", a heading and its sentence. */
function top(id: string, title: string, text: string): string {
  return '<p class="ob-step-no">' + inLanguages((t) => t('ob.step', { n: 1 })) + '</p>' +
    '<h2 class="ob-h2" id="' + id + '">' + title + '</h2>' +
    '<p class="ob-step-text">' + text + '</p>';
}

/** **No, pick another project**: the list, beside the way on - where there is a list to pick from. */
function pickAnother(listed: boolean): string {
  return listed
    ? pill({ label: FOLDER_SVG + inLanguages((t) => t('ob.project.pick')), tone: 'secondary', size: 'lg', button: true, attributes: ' data-ob-pick' })
    : '';
}

/** V20, the first three states: where the run started, what is known of it, and the way on. Hidden once the list is open. */
function card(project: Exclude<OnboardingProject, { kind: 'none' }>, listed: boolean): string {
  const name = e(project.name);
  const hint = (key: string, vars: Record<string, string> = {}): string =>
    '<div class="ob-hint"><span class="ob-hint-mark" aria-hidden="true">✦</span><span>' + inLanguages((t) => t(key, vars)) + '</span></div>';
  const go = (primary: string): string => '<div class="ob-proj-go js-only' + (listed ? '' : ' ob-proj-go-one') + '">' + pickAnother(listed) + primary + '</div>';

  if (project.kind === 'found') {
    const read = project.read;
    return '<div class="ob-proj-view ob-proj-card-view" data-ob-card>' +
      top('ob-project-title', inLanguages((t) => t('ob.project.found.title')), inLanguages((t) => t('ob.project.found.text'))) +
      box('found', project.name, project.place, tag(inLanguages((t) => t('ob.project.found.tag')), 'mint', 'badge'),
        fact('yes', inLanguages((t) => worked(t, project.conversations, project.entryPoints))) +
        (read === 0 ? '' : fact('look', inLanguages((t) => t('ob.done.found', { n: read }))))) +
      // White, as the maintainer asked on 2026-09-28: the way on here is a choice made, not a setup started.
      go(pill({ label: inLanguages((t) => t('ob.project.use', { name })), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-go="who"' })) +
      // No hint here: "Most people just click Yes" misled people (the maintainer, 2026-09-28).
      '</div>';
  }

  if (project.kind === 'inside') {
    const above = project.above;
    const within = project.within.split(/[\\/]/).join('/');
    const depth = within.split('/').length;
    const here = e(above.name + '/' + within);
    // Where the run cannot show another project, the only way on is the folder it is in.
    const onward = listed
      ? pill({
        label: inLanguages((t) => t('ob.project.useIt', { name: e(above.name) })),
        tone: 'light',
        size: 'lg',
        button: true,
        attributes: ' data-ob-switch="' + e(above.id) + '" data-ob-name="' + e(above.name) + '"',
      })
      : pill({ label: inLanguages((t) => t('proj.useAnyway', { name })), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-go="who"' });
    return '<div class="ob-proj-view ob-proj-card-view" data-ob-card>' +
      top('ob-project-title', inLanguages((t) => t('ob.project.inside.title')),
        inLanguages((t) => t('ob.project.inside.text', { place: e(project.place ?? project.name), up: t('ob.project.up', { n: depth }) }))) +
      box('inside', above.name, above.place, tag(inLanguages((t) => t('ob.project.upTag', { n: depth })), 'grey', 'badge'),
        fact('yes', inLanguages((t) => t('ob.project.worked', { n: above.conversations }))) +
        fact('yes', inLanguages((t) => t('ob.project.includes', { name: e(within) }))),
        '<p class="ob-proj-note">' + inLanguages((t) => t('ob.project.whole', { here: '<strong>' + here + '</strong>', name: '<strong>' + e(above.name) + '</strong>' })) + '</p>') +
      go(onward) +
      hint('ob.project.inside.hint', { name: e(within) }) +
      '</div>';
  }

  // V21, VD4: a folder with no AI chats is the person's to choose.
  return '<div class="ob-proj-view ob-proj-card-view" data-ob-card>' +
    top('ob-project-title', inLanguages((t) => t('ob.project.empty.title')), inLanguages((t) => t('ob.project.empty.text'))) +
    box('empty', project.name, project.place, tag(inLanguages((t) => t('ob.project.empty.tag')), 'amber', 'badge'),
      fact('yes', inLanguages((t) => t('ob.project.isProject'))) + fact('none', inLanguages((t) => t('ob.project.none')))) +
    go(pill({ label: inLanguages((t) => t('ob.project.anyway')), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-go="who"' })) +
    hint('ob.project.empty.hint') +
    '</div>';
}

/** The project card: its initial, its name, where it is, a tag, and what is known of it. */
function box(tone: 'found' | 'inside' | 'empty', name: string, place: string | undefined, label: string, facts: string, note = ''): string {
  return '<div class="ob-proj-card ob-proj-card-' + tone + '">' +
    '<div class="ob-proj-head"><span class="pjl-mark" aria-hidden="true">' + e(initial(name)) + '</span>' +
    '<span class="ob-proj-text"><span class="ob-proj-name">' + e(name) + '</span>' +
    (place === undefined ? '' : '<span class="ob-proj-place">' + e(place) + '</span>') + '</span>' + label + '</div>' +
    '<ul class="ob-proj-facts">' + facts + '</ul>' + note + '</div>';
}

/** One thing known of the project: a mint tick for a fact, an amber mark for one to look at, a ring for nothing yet. */
function fact(kind: 'yes' | 'look' | 'none', words: string): string {
  const mark = kind === 'yes' ? '✓' : kind === 'look' ? '!' : '';
  return '<li><span class="ob-fact ob-fact-' + kind + '" aria-hidden="true">' + mark + '</span><span>' + words + '</span></li>';
}

/** "Your AI has worked here: 12 chats", and where they were held (V4): "9 in your code editor, 3 in the terminal". */
function worked(t: Translate, conversations: number, from: Readonly<Partial<Record<EntryPoint, number>>>): string {
  const chats = t('ob.project.worked', { n: conversations });
  const named = NAMED.filter((kind) => (from[kind] ?? 0) > 0).map((kind) => t('ob.project.in.' + kind, { n: from[kind] ?? 0 }));
  if (named.length === 0) return chats;
  const unknown = from.unknown ?? 0;
  return chats + '<span class="ob-fact-more"> · ' + named.join(', ') + (unknown > 0 ? ' ' + t('ob.project.in.unknown', { n: unknown }) : '') + '</span>';
}

/**
 * The person's projects to pick from (V20's last two states): this run's own chosen where it is one of them, nothing
 * chosen where it is not, **Choose a folder…** under them where the computer has a folder window. What the folder window
 * came to is said in the box over the list, and a folder inside a project is offered as that project, with the folder
 * itself a button under it - the design's "Your AI chats are in my-app" (V12).
 */
function pickView(project: OnboardingProject, projects: IndexProjects | undefined, clock: { readonly now: number; readonly timeZone: string }): string {
  const lead = project.kind === 'none' ? 'ob.project.' + project.not : 'ob.project.text';
  // The maintainer, 2026-10-07: a project already set up has nothing here to set up - counted under the list, not listed.
  // The run's own stays, where it is one: the step may be the setup again (W25).
  // A folder that is gone is the list's own to count, as one that no longer exists.
  const toSetUp = (projects?.rows ?? []).filter((row) => row.setUp !== true || row.current || row.folder === 'gone');
  return '<div class="ob-proj-view ob-proj-pick-view" data-ob-pick-view>' +
    top('ob-pick-title', inLanguages((t) => t('ob.project.title')), inLanguages((t) => t(lead))) +
    (projects === undefined
      ? '<p class="ob-proj-how">' + inLanguages((t) => t('proj.missing.text')) + ' ' + inLanguages((t) => t('proj.missing.how')) + '</p>'
      : '<div class="ob-notice" data-ob-notice hidden><span class="ob-notice-mark" data-ob-notice-mark aria-hidden="true"></span>' +
        '<span><span class="ob-notice-title" data-ob-notice-title></span><span class="ob-notice-text" data-ob-notice-text></span></span></div>' +
        '<div class="ob-proj-list" data-ob-list>' +
        projectList({ rows: toSetUp, unreadable: projects.unreadable, ...(projects.temporary === undefined ? {} : { temporary: projects.temporary }), setUp: projects.rows.length - toSetUp.length, now: clock.now, timeZone: clock.timeZone, pick: PICK_GROUP }) +
        '</div>' +
        '<div class="ob-proj-chosen" data-ob-chosen hidden><p class="pjl-label" data-ob-chosen-label></p>' +
        '<div class="pjl pjl-picking"><div class="pjl-chosen-rows" data-ob-chosen-rows></div></div>' +
        '<p class="ob-proj-anyway"><button type="button" class="pill pill-outline pill-md" data-ob-anyway></button>' +
        '<span>' + inLanguages((t) => t('ob.project.nothingYet')) + '</span></p></div>' +
        '<p class="ob-proj-noscript">' + inLanguages((t) => t('proj.noScript')) + '</p>' +
        (projects.choosable
          ? '<div class="ob-proj-choose js-only">' + pill({ label: inLanguages((t) => t('proj.choose')), tone: 'outline', size: 'md', button: true, attributes: ' data-ob-choose' }) + '</div>'
          : '<p class="ob-proj-how">' + inLanguages((t) => t('proj.missing.text')) + ' ' + inLanguages((t) => t('proj.missing.how')) + '</p>')) +
    '<p class="ob-proj-which"><span class="ob-proj-i" aria-hidden="true">i</span><span>' + inLanguages((t) => t('proj.which')) + '</span></p>' +
    '<div class="ob-hint"><span class="ob-hint-mark" aria-hidden="true">✦</span><span>' + inLanguages((t) => t('ob.project.hint')) + '</span></div>' +
    '<div class="ob-foot js-only">' +
    pill({ label: inLanguages((t) => t('ob.back')), tone: 'outline', size: 'lg', button: true, attributes: ' data-ob-unpick' }) +
    (projects === undefined ? '' :
      '<span class="ob-foot-end">' +
      // White, as the maintainer asked on 2026-09-29: coral reads as something to fear here, and nothing is started yet.
      pill({ label: inLanguages((t) => t('ob.continue')), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-continue' + (project.kind === 'found' ? '' : ' disabled') }) +
      '</span>') +
    '</div></div>';
}

/** V15: the one real wait - another project's run starting - said where the step was. */
function switching(): string {
  return '<div class="ob-switching" data-ob-switching role="status" hidden><span class="ob-spinner" aria-hidden="true"></span>' +
    '<p class="ob-switching-title" data-ob-switching-title></p>' +
    '<p class="ob-switching-text">' + inLanguages((t) => t('ob.project.moment')) + '</p></div>';
}

/** The step's own look, on the onboarding's frame and the list's kit piece. Colours come from the tokens only. */
export const PROJECT_STEP_STYLE = String.raw`
.ob-step-project{max-width:680px}
.ob-proj-view[hidden],.ob-switching[hidden],.ob-notice[hidden],.ob-proj-chosen[hidden]{display:none!important}
.js .ob-picking [data-ob-card]{display:none}
.js .ob-step-project:not(.ob-picking) [data-ob-pick-view]{display:none}
.js .ob-switching-now>.ob-proj-view{display:none!important}
.ob-proj-card{padding:18px 20px;border-radius:16px;background:var(--card);border:1.5px solid var(--white-10)}
.ob-proj-card-found{border-color:var(--mint-50);background:var(--mint-05)}
.ob-proj-card-empty{border-color:var(--amber-35)}
.ob-proj-head{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:center}
.ob-proj-text{min-width:0;display:flex;flex-direction:column;gap:2px}
.ob-proj-name{font-size:18px;font-weight:650;line-height:1.3;overflow-wrap:anywhere}
.ob-proj-place{font-family:var(--mono);font-size:12.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ob-proj-facts{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}
.ob-proj-facts li{display:flex;align-items:flex-start;gap:10px;font-size:14.5px;line-height:1.45;color:var(--text-soft)}
.ob-fact{flex:none;width:18px;height:18px;margin-top:1px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700}
.ob-fact-yes{background:var(--mint-14);color:var(--mint)}
.ob-fact-look{background:var(--amber-12);color:var(--amber)}
.ob-fact-none{border:1.5px solid var(--amber);width:16px;height:16px;margin:2px 1px 0}
.ob-fact-more{color:var(--text-3)}
.ob-proj-note{margin:14px 0 0;padding:12px 14px;border-radius:10px;background:var(--white-04);border:1px solid var(--white-08);font-size:14px;line-height:1.5;color:var(--text-soft)}
.ob-proj-note strong{color:var(--text);font-weight:600}
.ob-proj-go{display:none;margin-top:14px;gap:12px}
.js .ob-proj-go{display:grid;grid-template-columns:1fr 1fr}
.js .ob-proj-go-one{grid-template-columns:1fr}
.ob-proj-go .pill{justify-content:center;gap:9px}
.ob-proj-pick-view .pjl{margin-top:4px}
.ob-proj-list.ob-waiting{opacity:.4;pointer-events:none}
.ob-notice{display:flex;align-items:flex-start;gap:12px;margin:0 0 10px;padding:14px 16px;border-radius:14px;background:var(--card);border:1px solid var(--white-10)}
.ob-notice-mark{flex:none;width:26px;height:26px;border-radius:50%;background:var(--white-08);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.ob-notice-warn{background:var(--coral-06);border-color:var(--coral-30)}
.ob-notice-warn .ob-notice-mark{background:var(--coral);color:var(--on-coral)}
.ob-notice-title{display:block;font-size:15px;font-weight:600}
.ob-notice-text{display:block;margin-top:2px;font-size:13.5px;line-height:1.5;color:var(--text-2)}
.ob-notice-text:empty{display:none}
.pjl-chosen-rows{display:grid;gap:8px}
.ob-proj-anyway{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin:12px 4px 0;font-size:13px;color:var(--text-3)}
.ob-proj-choose{margin-top:14px}
.ob-proj-how{margin:12px 4px 0;font-size:13.5px;line-height:1.5;color:var(--text-2)}
.ob-proj-noscript{margin:12px 4px 0;font-size:13px;color:var(--text-3)}
.js .ob-proj-noscript{display:none}
.ob-proj-which{display:flex;align-items:flex-start;gap:10px;margin:18px 4px 0;font-size:13px;line-height:1.5;color:var(--text-3)}
.ob-proj-i{flex:none;width:16px;height:16px;margin-top:1px;border-radius:50%;border:1px solid var(--white-25);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.ob-proj-pick-view .ob-foot .pill[disabled]{opacity:.45;cursor:not-allowed}
.ob-switching{display:flex;flex-direction:column;align-items:center;text-align:center;padding:16vh 0 8vh}
.ob-spinner{width:44px;height:44px;border-radius:50%;background:var(--white-06);position:relative;margin-bottom:18px}
.ob-spinner::after{content:"";position:absolute;inset:12px;border-radius:50%;border:2px solid var(--coral);border-right-color:transparent;animation:obSpin .9s linear infinite}
@keyframes obSpin{to{transform:rotate(360deg)}}
.ob-switching-title{margin:0;font-size:30px;font-weight:650;letter-spacing:-.02em}
.ob-switching-text{margin:8px 0 0;font-size:15px;color:var(--text-2)}
@media (max-width:640px){.ob-proj-card{padding:16px}.js .ob-proj-go{grid-template-columns:1fr}.ob-proj-go .pill{width:100%}
.ob-switching-title{font-size:24px}}
`;
