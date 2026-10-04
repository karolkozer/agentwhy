// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { inLanguages } from '../../render/report-copy.ts';
import { askPanel, askTrigger } from '../../render/ui/ask-panel.ts';
import type { Guide } from '../../render/ui/guide-card.ts';
import type { RulesRead } from '../../../adapter/claude-code/settings/hook-entries.ts';
import type { AppLinks } from '../app-nav.ts';
import { settingsView } from '../settings/settings-view.ts';
import type { SessionIndex } from '../session-index.ts';
import type { EmptyPeriod } from './period-section.ts';
import type { Week } from './weeks.ts';

/** The written answers "✦ Nothing showing up?" opens: one box on the page, since only this week can be empty. */
const ASK = 'conv-ask';

/** What the project does with its private files, where every part of it can be read. */
type Protection =
  | { readonly blocked: true; readonly chosen: boolean; readonly alert: boolean }
  | { readonly blocked: false; readonly gaps: number };

/**
 * This week, with no conversation in it yet (the maintainer's design, 2026-09-29): that it is normal, since when, and
 * what keeps the private files meanwhile; then, under the days, what happens next and where to look when nothing shows
 * up. Only the current week can be empty - a week nothing happened in is not offered (`weeks.ts`) - so every line may
 * say "yet". Nothing is said that the model does not hold: the protection card only where the rules and `refuse` could
 * both be read, and "Connected" only while the server answers the page's asks (`live-script.ts`).
 */
export function emptyWeek(weeks: readonly Week[], at: number, index: SessionIndex, links: AppLinks): EmptyPeriod {
  const week = weeks[at] as Week;
  const older = weeks[at + 1];
  const protection = protectionOf(index);
  const safe = protection?.blocked === true && !protection.chosen;
  // On a Monday, "since Monday" is today.
  const since = week.days[0]?.today === true ? 'conv.empty.lead.today' : 'conv.empty.lead';

  return {
    lead: inLanguages((t) => t(since) + (safe ? ' ' + t('conv.empty.safe') : '')),
    ...(protection === undefined ? {} : { guide: guideOf(protection, older, at, links) }),
    after: nextSteps() + foot(),
  };
}

/**
 * Where the files are blocked whole (`block-means-blocked` K1, K2 - the rules and `refuse`, for every row the person
 * chose to block), the mint lock, with the one way on: the week before. Where Settings would say "{n} private files
 * aren't fully blocked", the coral card that leads there. Anything between is not claimed either way.
 */
function guideOf(protection: Protection, older: Week | undefined, at: number, links: AppLinks): Guide {
  if (!protection.blocked) {
    return {
      tone: 'coral',
      title: inLanguages((t) => t('conv.empty.gap', { n: protection.gaps })),
      body: inLanguages((t) => t('conv.empty.gap.body')),
      action: { label: inLanguages((t) => t('conv.empty.settings')), href: links.settings },
    };
  }
  return {
    tone: 'mint',
    mark: 'lock',
    title: inLanguages((t) => t('conv.empty.on')),
    body: inLanguages((t) => t(protection.chosen ? 'conv.empty.on.chosen' : 'conv.empty.on.body') + (protection.alert ? ' ' + t('conv.empty.on.alert') : '')),
    ...(older === undefined ? {} : {
      action: {
        label: inLanguages((t) => t(older.ago === 1 ? 'conv.empty.last' : 'conv.empty.earlier')),
        href: '#week-' + older.ago,
        attributes: ' data-period-go="' + (at + 1) + '"',
        light: true as const,
      },
    }),
  };
}

/**
 * The project's protection, from the facts Settings shows (`settings-view.ts`), or undefined where any of them cannot be
 * read - a shared page, a folder that is no project, a hook that reads a policy the page cannot see into.
 */
function protectionOf(index: SessionIndex): Protection | undefined {
  const settings = index.settings;
  if (settings === undefined || index.shared || index.notAProject !== undefined || settings.hooks === undefined || settings.held === undefined) return undefined;
  const view = settingsView(settings);
  if (!view.known || !seen(view.reads) || !seen(settings.hooks.reads.refuse)) return undefined;
  if (view.unfinished.rows > 0) return { blocked: false, gaps: view.unfinished.rows };
  const block = view.rows.filter((row) => row.mode === 'block');
  if (block.length === 0 || !view.stop.on || block.some((row) => !row.watched)) return undefined;
  return {
    blocked: true,
    // Files the person chose Tell me for are read, and told: "your private files stay blocked" would not be true of them (F57).
    chosen: block.length < view.rows.length,
    // A try at a blocked file is told only where `watch` runs and tells about the tries it stopped (F29, F30).
    alert: view.alerts.on && view.stopped.on,
  };
}

/** The rules a hook reads are ones this page can list: the built-in list, or one of the project's two files. */
function seen(reads: RulesRead): boolean {
  return reads === 'default' || reads === 'local' || reads === 'shared';
}

/**
 * "What happens next": three numbered cards. agentwhy reads Claude Code's and Codex's conversations and no other AI's
 * (`proj.which`, which the answers below repeat), so the first names those two.
 */
function nextSteps(): string {
  return '<section class="cw-next"><h2 class="cw-h2">' + inLanguages((t) => t('conv.next')) + '</h2><ol class="cw-next-list">' +
    [1, 2, 3].map((n) => '<li class="cw-next-item"><span class="cw-next-n" aria-hidden="true">' + n + '</span>' +
      '<span class="cw-next-title">' + inLanguages((t) => t('conv.next.' + n + '.title')) + '</span>' +
      '<span class="cw-next-body">' + inLanguages((t) => t('conv.next.' + n + '.body')) + '</span></li>').join('') +
    '</ol></section>';
}

/**
 * "● Connected", drawn only while the server answers (`:root[data-live="on"]`); and "✦ Nothing showing up?", which
 * opens written answers (F43: no model until O1 is decided, so no "Ask AI"). With no script the answers stand open.
 */
function foot(): string {
  return '<div class="cw-empty-foot"><span class="cw-live"><span class="cw-live-dot" aria-hidden="true"></span>' +
    inLanguages((t) => t('conv.live')) + '</span>' +
    askTrigger(inLanguages((t) => t('conv.ask')), ASK) + '</div>' +
    askPanel([
      { question: inLanguages((t) => t('conv.ask.which')), answer: inLanguages((t) => t('proj.which')) },
      { question: inLanguages((t) => t('conv.ask.where')), answer: inLanguages((t) => t('conv.ask.where.a')) },
    ], ASK);
}

export const EMPTY_WEEK_STYLE = String.raw`
.cw-next{margin:4px 0 20px}
.cw-next .cw-h2{margin-bottom:14px}
.cw-next-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.cw-next-item{display:flex;flex-direction:column;align-items:flex-start;padding:22px 22px 24px;border-radius:14px;background:var(--card);border:1px solid var(--white-09)}
.cw-next-n{display:flex;align-items:center;justify-content:center;width:28px;height:28px;margin-bottom:16px;border-radius:50%;background:var(--coral-14);color:var(--coral-text);font-size:14px;font-weight:650}
.cw-next-title{font-size:17px;font-weight:600;margin-bottom:6px}
.cw-next-body{font-size:15px;line-height:1.5;color:var(--text-2)}
.cw-empty-foot{display:flex;align-items:center;gap:8px 24px;flex-wrap:wrap}
.cw-live{display:none;align-items:center;gap:8px;font-size:14px;color:var(--text-2)}
:root[data-live="on"] .cw-live{display:inline-flex}
.cw-live-dot{width:7px;height:7px;border-radius:50%;background:var(--mint)}
.cw-empty-foot .ak-trigger{font-weight:600}
`;
