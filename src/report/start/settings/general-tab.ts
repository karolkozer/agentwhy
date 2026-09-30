import { inLanguages } from '../../render/report-copy.ts';
import { avatar } from '../../render/ui/avatar.ts';
import { BRAND_MARK } from '../../render/ui/brand-mark.ts';
import { pill, TRASH_SVG } from '../../render/ui/button.ts';
import { callout } from '../../render/ui/callout.ts';
import { opener } from '../../render/ui/popup.ts';
import { tag } from '../../render/ui/tag.ts';
import type { SettingsFile } from '../session-index.ts';
import type { SettingsView } from './settings-view.ts';
import { scopeWindowId, UNINSTALL_WINDOW } from './settings-windows.ts';

/**
 * General (`for-people-who-build-with-ai.md` F56, asked for 2026-09-24; redrawn 2026-09-25): who what agentwhy saved in
 * the project is for, asked once here rather than in every window that writes. Two cards, each with a ring, the one in
 * force filled and tagged; the other card is itself the way to it, through a confirmation that moves everything
 * agentwhy wrote (F40). Where the project holds some of each, the page says so first, and either card makes it one.
 * Under them, which AI agentwhy sees (`which-project.md` V5), and **Uninstall** (F59), where there is anything of
 * agentwhy's to take out.
 */
export function generalTab(view: SettingsView, welcome?: string): string {
  const cards = (['local', 'shared'] as const).map((file) => scopeCard(view, file)).join('');
  return '<section class="set-box set-who"><div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.general.title')) + '</h2>' +
    '<p class="set-lead">' + inLanguages((t) => t('set.general.lead')) + '</p></div>' +
    (view.scope === 'mixed' ? callout({ tone: 'coral', body: inLanguages((t) => t('set.general.mixed')) }) : '') +
    '<div class="set-scopes">' + cards + '</div>' +
    (view.known && view.scope === undefined ? '<p class="set-quiet set-general-note">' + inLanguages((t) => t('set.general.none')) + '</p>' : '') +
    '<p class="set-quiet set-general-note"><span class="set-info" aria-hidden="true">i</span><span>' + inLanguages((t) => t('set.general.note')) + '</span></p>' +
    // which-project V5: which AI agentwhy sees, in the words the project step and the list of projects say it.
    '<p class="set-quiet set-general-note"><span class="set-info" aria-hidden="true">i</span><span>' + inLanguages((t) => t('proj.which')) + '</span></p>' +
    '</section>' +
    setupCard(welcome) +
    uninstallCard(view);
}

/**
 * W25a: the onboarding again, where this run serves it - drawn as Uninstall is (a mark, one sentence, the button), and
 * above it: going through the setup again comes before taking it all out. Nothing is written until its Finish (W10).
 */
function setupCard(welcome: string | undefined): string {
  if (welcome === undefined) return '';
  return '<section class="set-box set-again"><span class="set-again-icon" aria-hidden="true">' + BRAND_MARK + '</span>' +
    '<div class="set-card-body"><h2 class="set-h3">' + inLanguages((t) => t('ob.again.title')) + '</h2>' +
    '<p class="set-uninstall-text">' + inLanguages((t) => t('ob.again.text')) + '</p></div>' +
    pill({ label: inLanguages((t) => t('ob.again.go')), tone: 'outline', size: 'lg', href: welcome }) +
    '</section>';
}

function scopeCard(view: SettingsView, file: SettingsFile): string {
  // Nothing saved yet is "just me" in force: it is where the next thing turned on goes.
  const current = view.known && (view.scope === file || (view.scope === undefined && file === 'local'));
  const move = view.moves[file];
  const canSwitch = view.canWrite && !current && (move.patterns.length > 0 || move.hooks.length > 0);
  const body = '<span class="set-scope-top">' + who(file) + '<span class="set-scope-ring" aria-hidden="true"></span></span>' +
    '<span class="set-card-name"><span class="set-scope-name">' + inLanguages((t) => t('set.general.' + file)) + '</span>' +
    (current ? tag(inLanguages((t) => t('set.general.current')), 'mint', 'badge') : '') + '</span>' +
    '<span class="set-scope-sub">' + inLanguages((t) => t('set.general.' + file + '.sub')) + '</span>';
  if (canSwitch) return '<a class="set-scope" href="#' + scopeWindowId(file) + '"' + opener(scopeWindowId(file)) + '>' + body + '</a>';
  return '<div class="set-scope' + (current ? ' set-scope-on' : '') + '"' + (current ? ' aria-current="true"' : '') + '>' + body + '</div>';
}

/** Who a card is for, drawn: you alone, or you and two others - initials of nobody, only a picture of "everyone". */
function who(file: SettingsFile): string {
  const you = '<span class="av av-grey av-40" aria-hidden="true">' + inLanguages((t) => t('set.general.you')) + '</span>';
  return '<span class="set-scope-who">' + you + (file === 'shared' ? avatar('A', 'coral', 40) + avatar('M', 'mint', 40) : '') + '</span>';
}

/** F59: what agentwhy put into the project, taken out behind one coral confirmation. Nothing to take out, no card. */
function uninstallCard(view: SettingsView): string {
  if (!view.canWrite || Object.keys(view.uninstall).length === 0) return '';
  return '<section class="set-box set-uninstall"><span class="set-uninstall-icon" aria-hidden="true">' + TRASH_SVG + '</span>' +
    '<div class="set-card-body"><h2 class="set-h3">' + inLanguages((t) => t('set.uninstall.title')) + '</h2>' +
    '<p class="set-uninstall-text">' + inLanguages((t) => t('set.uninstall.text')) + '</p></div>' +
    pill({ label: inLanguages((t) => t('set.uninstall.go')), tone: 'outline-coral', size: 'lg', href: '#' + UNINSTALL_WINDOW, attributes: opener(UNINSTALL_WINDOW) }) +
    '</section>';
}
