// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, type Translate } from '../../render/report-copy.ts';
import { BRAND_MARK } from '../../render/ui/brand-mark.ts';
import { pill } from '../../render/ui/button.ts';
import type { AppLinks } from '../app-nav.ts';
import type { FixFile } from '../to-fix/to-fix-view.ts';
import type { OnboardingDone } from './onboarding-view.ts';

/**
 * Done (`.ai/specs/2026-09-24-onboarding.md` W17-W20, W1a): what the run found, and one action. Which of its three
 * versions is drawn is the model's to say - files to fix, nothing to fix, or no chats yet. What depends on Finish -
 * whether alerts are on, what failed, the summary line - is left for the page's script to fill (`data-ob-if`, `data-ob-*`),
 * since only the server's answer knows it. It is never shown without a script (W27).
 */
export function doneScreen(done: OnboardingDone, links: AppLinks): string {
  const fix = done.conversations > 0 && done.total > 0;
  const version = done.conversations === 0 ? empty(links) : fix ? toFix(done, links) : nothing(done, links);
  return '<section class="ob-screen ob-done" data-ob-screen="done" hidden aria-labelledby="ob-done-title">' +
    (fix ? knotMark() : tickMark()) +
    version +
    '<ul class="ob-failed" data-ob-failed hidden>' +
    (['watch', 'protect', 'search', 'mode', 'notices'] as const).map((change) =>
      '<li data-ob-fail="' + change + '" hidden><span class="ob-fail-mark" aria-hidden="true">!</span><span>' +
      inLanguages((t) => t('ob.failed.' + change)) + ' <span class="ob-fail-said" data-ob-fail-said></span> ' +
      '<a class="ob-link" href="' + links.settings + '">' + inLanguages((t) => t('ob.failed.go')) + '</a></span></li>').join('') + '</ul>' +
    // W20a: Codex, where the project uses it and Claude Code's block runs - filled by the script from Finish's answer.
    '<p class="ob-codex" data-ob-codex="on" hidden>' + inLanguages((t) => t('ob.done.codex.on')) + '</p>' +
    '<p class="ob-codex" data-ob-codex="off" hidden>' + inLanguages((t) => t('ob.done.codex.off')) + ' <a class="ob-link" href="' + links.settings + '">' +
    inLanguages((t) => t('ob.done.codex.go')) + '</a></p>' +
    '<p class="ob-summary"><span class="ob-summary-tick" data-ob-summary-tick aria-hidden="true">✓</span> ' +
    inLanguages(() => '<span data-ob-summary></span>') + ' · <a class="ob-link" href="' + links.settings + '">' +
    inLanguages((t) => t('ob.summary.change')) + '</a></p>' +
    '<p class="ob-unrecorded" data-ob-unrecorded hidden>' + inLanguages((t) => t('ob.unrecorded')) + '</p>' +
    '</section>';
}

/** W17: the mint ✓, its glow, its ripples and the confetti - for a Done with nothing left to do. */
function tickMark(): string {
  return '<div class="ob-done-mark" aria-hidden="true">' + confetti() +
    '<span class="ob-done-glow"></span><span class="ob-ripple"></span><span class="ob-ripple ob-ripple-2"></span>' +
    '<span class="ob-done-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>';
}

/**
 * W17a: with files to fix, the brand's knot in coral instead. Mint says safe or done (guidelines §2), and this screen
 * says there is something left to do: no ✓, no mint glow, no confetti.
 */
function knotMark(): string {
  return '<div class="ob-done-mark ob-done-mark-fix" aria-hidden="true"><span class="ob-fix-halo"></span>' +
    '<span class="ob-fix-knot">' + BRAND_MARK + '</span></div>';
}

/** W18: files to fix. */
function toFix(done: OnboardingDone, links: AppLinks): string {
  return '<h2 class="ob-h2 ob-done-title" id="ob-done-title">' + inLanguages((t) => t('ob.done.files.title')) + '</h2>' +
    '<p class="ob-done-text">' + told() + ' ' + inLanguages((t) => t('ob.done.already', { n: done.total, when: when(t, done.asked) })) + '</p>' +
    '<div class="ob-found">' +
    '<div class="ob-found-head"><span class="ob-found-mark" aria-hidden="true">!</span><span>' +
    '<span class="ob-found-title">' + inLanguages((t) => t('ob.done.found', { n: done.total })) + '</span>' +
    '<span class="ob-found-sub">' + inLanguages((t) => t(done.state === 'keys' ? 'ob.done.keys' : 'fix.hero.look')) + '</span></span></div>' +
    '<ul class="ob-found-rows">' + done.files.map(foundRow).join('') + '</ul>' +
    (done.more > 0 ? '<p class="ob-found-more">' + inLanguages((t) => t('ob.done.more', { n: done.more })) + '</p>' : '') +
    '<div class="ob-found-foot"><a class="ob-link ob-later" href="' + links.conversations + '">' + inLanguages((t) => t('ob.done.later')) + '</a>' +
    pill({ label: inLanguages((t) => t('ob.done.fix')), tone: 'primary', size: 'lg', href: e(firstReport(done) ?? links.toFix) }) + '</div></div>';
}

/**
 * W18a: where Fix them now leads - the report of the newest conversation that read the first file to fix, To fix's
 * first (T8), so the fixing starts where it happened. To fix where no report of it was written.
 */
function firstReport(done: OnboardingDone): string | undefined {
  return done.files[0]?.conversations.find((conversation) => conversation.report !== undefined)?.report;
}

/** T6: the rule's name, else "A private file"; the group's colour on its bar (T4); the path as To fix's chip writes it. */
function foundRow(file: FixFile): string {
  return '<li class="ob-found-row"><span class="ob-found-bar ob-found-bar-' + (file.label === 'rotate' ? 'keys' : 'look') + '" aria-hidden="true"></span>' +
    '<span class="ob-found-name">' + inLanguages((t) => t(file.name === undefined ? 'fix.private' : 'set.rule.' + file.name)) + '</span>' +
    '<span class="chip" title="' + e(file.path) + '">' + e(file.path) + '</span></li>';
}

/** W19: nothing to fix - or, where a chat could not be read in full, no claim that there is nothing (W34). */
function nothing(done: OnboardingDone, links: AppLinks): string {
  return '<h2 class="ob-h2 ob-done-title" id="ob-done-title"><span data-ob-if="on">' + inLanguages((t) => t('ob.done.protected')) + '</span>' +
    '<span data-ob-if="off" hidden>' + inLanguages((t) => t('ob.done.set')) + '</span></h2>' +
    '<p class="ob-done-text"><span data-ob-if="on">' + inLanguages((t) => t('ob.done.knowing')) + '</span>' +
    '<span data-ob-if="off" hidden>' + inLanguages((t) => t('ob.done.notTold')) + '</span></p>' +
    (done.gaps
      ? '<div class="ob-good ob-good-grey"><span class="ob-good-mark ob-good-mark-grey" aria-hidden="true">?</span><span>' +
        '<span class="ob-good-title">' + inLanguages((t) => t('ob.done.gaps')) + '</span>' +
        '<a class="ob-link" href="' + links.conversations + '">' + inLanguages((t) => t('ob.done.gaps.go')) + '</a></span></div>'
      : '<div class="ob-good"><span class="ob-good-mark" aria-hidden="true">✓</span><span>' +
        '<span class="ob-good-title">' + inLanguages((t) => t('ob.done.good')) + '</span>' +
        '<span class="ob-good-text">' + inLanguages((t) => t('ob.done.good.text', { when: when(t, done.asked) })) + '</span></span></div>') +
    openAgentwhy(links);
}

/** W1a: no AI chats yet - set up before there is anything to show, and then Conversations, where they will be listed. */
function empty(links: AppLinks): string {
  return '<h2 class="ob-h2 ob-done-title" id="ob-done-title"><span data-ob-if="on">' + inLanguages((t) => t('ob.done.protected')) + '</span>' +
    '<span data-ob-if="off" hidden>' + inLanguages((t) => t('ob.done.empty.title')) + '</span></h2>' +
    '<p class="ob-done-text">' + inLanguages((t) => t('ob.done.empty.text')) + '</p>' +
    openAgentwhy(links);
}

/** W19, W1a: Done's own way on, to Conversations, whether or not there are chats in it yet. */
function openAgentwhy(links: AppLinks): string {
  return '<div class="ob-done-go">' + pill({ label: inLanguages((t) => t('ob.done.open')), tone: 'mint', size: 'lg', href: links.conversations }) + '</div>';
}

/** "From now on, you'll be told right away." - or, where alerts end up off, how to turn them on (W18). */
function told(): string {
  return '<span data-ob-if="on">' + inLanguages((t) => t('ob.done.told')) + '</span>' +
    '<span data-ob-if="off" hidden>' + inLanguages((t) => t('ob.done.notTold')) + '</span>';
}

/** The run's range in words: "in the last 7 days", or "since 2026-09-01" where a date was asked (To fix D3). */
function when(t: Translate, asked: string): string {
  const span = /^(\d+)([hdw])$/.exec(asked);
  return span === null ? t('ob.when.since', { date: e(asked) }) : t('ob.when.' + span[2], { n: Number(span[1]) });
}

/** The design's confetti, from its own seed: 34 pieces in the brand's colours. */
function confetti(): string {
  let seed = 3;
  const next = (): number => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const tones = ['coral', 'coral-soft', 'mint', 'white', 'amber'];
  return Array.from({ length: 34 }, (_unused, at) => {
    const angle = next() * Math.PI * 2;
    const distance = 90 + next() * 160;
    const turn = next() * 540;
    const width = 5 + next() * 5;
    const delay = next() * 0.25;
    return '<span class="ob-conf ob-conf-' + tones[at % tones.length] + '" style="--dx:' + (Math.cos(angle) * distance).toFixed(1) + 'px;--dy:' +
      (Math.sin(angle) * distance - 40).toFixed(1) + 'px;--r:' + turn.toFixed(0) + 'deg;--w:' + width.toFixed(1) + 'px;--d:' + delay.toFixed(2) + 's"></span>';
  }).join('');
}

/** Done's own look. Colours come from the tokens only. */
export const DONE_STYLE = String.raw`
.ob-done{max-width:640px;margin:0 auto;display:flex;flex-direction:column;align-items:center;text-align:center}
.ob-done-mark{position:relative;width:96px;height:96px;margin-bottom:14px;display:flex;align-items:center;justify-content:center}
.ob-done-glow{position:absolute;inset:-50px;border-radius:50%;background:radial-gradient(circle,var(--mint-35),transparent 62%);animation:obGlow 3.5s ease-in-out infinite}
.ob-ripple{position:absolute;inset:10px;border-radius:50%;border:2px solid var(--mint-50);opacity:0;animation:obRipple 2.8s ease-out .4s infinite}
.ob-ripple-2{animation-delay:1.8s}
.ob-conf{position:absolute;left:50%;top:50%;width:var(--w);height:calc(var(--w) * .45);border-radius:2px;animation:obConfetti 1.4s cubic-bezier(.2,.7,.3,1) var(--d) both}
.ob-conf-coral{background:var(--coral)}.ob-conf-coral-soft{background:var(--coral-link-hover)}.ob-conf-mint{background:var(--mint)}
.ob-conf-white{background:var(--text)}.ob-conf-amber{background:var(--amber)}
.ob-done-tick{position:relative;width:88px;height:88px;border-radius:50%;background:radial-gradient(circle at 35% 30%,var(--mint-hover),var(--mint));color:var(--on-mint);display:flex;align-items:center;justify-content:center;box-shadow:0 0 60px var(--mint-50);animation:obPop .7s cubic-bezier(.2,.9,.3,1.3) both}
.ob-done-tick svg{width:42px;height:42px}
.ob-done-mark-fix{margin-bottom:22px}
.ob-fix-halo{position:absolute;inset:-22px;border-radius:50%;border:1px solid var(--coral-12);background:radial-gradient(circle,var(--coral-12),transparent 70%)}
.ob-fix-knot{position:relative;width:88px;height:88px;border-radius:50%;background:var(--card);border:1px solid var(--coral-45);color:var(--coral);display:flex;align-items:center;justify-content:center;box-shadow:0 0 40px var(--coral-18);animation:obPop .7s cubic-bezier(.2,.9,.3,1.3) both}
.ob-fix-knot .brand-mark{width:44px;height:44px}
.ob-done-title{font-size:40px;line-height:1.08;letter-spacing:-.03em;margin-bottom:8px}
.ob-done-text{margin:0 0 20px;max-width:460px;font-size:16px;line-height:1.5;color:var(--text-2)}
.ob-found{width:100%;text-align:left;border-radius:18px;background:var(--card);border:1px solid var(--coral-45);box-shadow:0 20px 60px var(--shadow);overflow:hidden}
.ob-found-head{display:flex;align-items:center;gap:12px;padding:18px 20px;background:var(--coral-07);border-bottom:1px solid var(--coral-18)}
.ob-found-mark,.ob-fail-mark{flex:none;width:30px;height:30px;border-radius:50%;background:var(--coral);color:var(--on-coral);font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ob-found-title{display:block;font-size:17px;font-weight:650}
.ob-found-sub{display:block;font-size:14px;color:var(--text-2);margin-top:2px}
.ob-found-rows{list-style:none;margin:0;padding:0}
.ob-found-row{display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid var(--white-06)}
.ob-found-bar{flex:none;width:2px;height:26px;border-radius:4px}
.ob-found-bar-keys{background:var(--coral)}.ob-found-bar-look{background:var(--amber)}
.ob-found-name{flex:1;min-width:0;font-size:15px;font-weight:600}
.ob-found-more{margin:0;padding:12px 20px;font-size:14px;color:var(--text-2);border-bottom:1px solid var(--white-06)}
.ob-found-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 20px}
.ob-found-foot .pill{box-shadow:0 10px 30px var(--coral-30)}
.ob-link{color:var(--text-2);font-weight:600}
.ob-link:hover{color:var(--text)}
.ob-good{width:100%;text-align:left;display:flex;align-items:center;gap:14px;padding:20px;border-radius:18px;background:var(--card);border:1px solid var(--mint-35)}
.ob-good-grey{border-color:var(--white-14)}
.ob-good-mark{flex:none;width:30px;height:30px;border-radius:50%;background:var(--mint);color:var(--on-mint);font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ob-good-mark-grey{background:var(--white-10);color:var(--text-2)}
.ob-good-title{display:block;font-size:17px;font-weight:650}
.ob-good-text{display:block;font-size:14px;color:var(--text-2);margin-top:2px}
.ob-done-go{margin-top:24px}
.ob-done-go .pill{padding:15px 32px;font-size:16px;box-shadow:0 10px 40px var(--mint-20);transition:background .15s,border-color .15s,transform .15s,box-shadow .2s}
.ob-done-go .pill:hover{transform:translateY(-2px);box-shadow:0 14px 44px var(--mint-35)}
.ob-failed{list-style:none;margin:18px 0 0;padding:0;width:100%;display:grid;gap:8px;text-align:left}
.ob-failed li{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:12px;background:var(--coral-06);border:1px solid var(--coral-30);font-size:14px;line-height:1.5;color:var(--text-soft)}
.ob-failed li[hidden],.ob-failed[hidden]{display:none}
.ob-fail-mark{width:22px;height:22px;font-size:12px}
.ob-fail-said{color:var(--text-2)}
.ob-summary{margin:14px 0 0;font-size:13.5px;color:var(--text-3)}
.ob-summary-tick{color:var(--mint)}
.ob-unrecorded{margin:10px 0 0;font-size:13.5px;color:var(--text-3)}
.ob-codex{max-width:560px;margin:14px auto 0;font-size:13.5px;line-height:1.5;color:var(--text-3)}
@media (max-width:640px){.ob-done-title{font-size:30px}.ob-found-foot{flex-direction:column-reverse;align-items:stretch;text-align:center}.ob-conf{--spread:.5}}
`;
