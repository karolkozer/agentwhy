import { pill } from './button.ts';
import { CLOSES, popup } from './popup.ts';

/**
 * "Protect this file?" and every other change that writes something into a project (guidelines §9.2): a mint mark, a
 * title, what it applies to, one sentence of what changes, an optional choice under it, and Cancel beside the confirm -
 * the same size, because leaving a change must be as easy as making one (R47). Confirming is mint (O6).
 */
export interface Confirm {
  readonly id: string;
  /** Every argument below is already written in every language and escaped. */
  readonly title: string;
  /** What it applies to - a file chip - or empty. */
  readonly subject: string;
  readonly sentence: string;
  /** A choice under the sentence - "Also protect every file called …" - or empty. */
  readonly option: string;
  /**
   * A block under the sentence, already written: the list of every change one confirm makes - the onboarding's Finish
   * (`.ai/specs/2026-09-24-onboarding.md` W14) - where one sentence cannot say them all.
   */
  readonly detail?: string;
  readonly cancel: string;
  readonly confirm: string;
  /** What the page's script finds the confirm button by. */
  readonly confirmAttributes: string;
  /** Written above the buttons, for the page's script to fill: why the change was refused, or the command to run. */
  readonly note?: string;
  /** The mark over the title; empty draws none (Settings' windows have none). */
  readonly glyph?: string;
  /** Mint confirms a change that makes something safe (O6); coral one that takes protection away ("Turn off"). */
  readonly tone?: 'mint' | 'primary';
}

export function confirmDialog(spec: Confirm): string {
  const title = spec.id + '-title';
  return popup({
    id: spec.id,
    size: 'confirm',
    labelledBy: title,
    body: '<div class="cf">' +
      (spec.glyph === '' ? '' : '<div class="cf-mark" aria-hidden="true">' + (spec.glyph ?? '⊘') + '</div>') +
      '<h3 class="cf-title" id="' + title + '">' + spec.title + '</h3>' +
      (spec.subject === '' ? '' : '<div class="cf-subject">' + spec.subject + '</div>') +
      '<p class="cf-sentence">' + spec.sentence + '</p>' +
      (spec.detail === undefined ? '' : '<div class="cf-detail">' + spec.detail + '</div>') +
      (spec.option === '' ? '' : '<div class="cf-option">' + spec.option + '</div>') +
      (spec.note ?? '') +
      '<div class="cf-actions">' +
      pill({ label: spec.cancel, tone: 'outline', size: 'lg', button: true, attributes: CLOSES }) +
      pill({ label: spec.confirm, tone: spec.tone ?? 'mint', size: 'lg', button: true, attributes: spec.confirmAttributes }) +
      '</div></div>',
  });
}

export const CONFIRM_DIALOG_STYLE = String.raw`
.cf{padding:28px}
.cf-mark{width:48px;height:48px;border-radius:50%;background:var(--mint-14);color:var(--mint);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:18px}
.cf-title{margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:650}
.cf-subject{margin-bottom:16px}
.cf-sentence{margin:0 0 24px;font-size:15px;line-height:1.55;color:var(--text-2);text-wrap:pretty}
.cf-option{margin:-12px 0 24px;font-size:14px;color:var(--text-2)}
.cf-detail{margin:-12px 0 24px;font-size:15px;line-height:1.5;color:var(--text-soft)}
.cf-detail ul{margin:0;padding-left:20px;display:grid;gap:8px}
.cf-actions{display:flex;justify-content:flex-end;gap:10px}
.cf-actions .pill-outline{font-weight:400}
`;
