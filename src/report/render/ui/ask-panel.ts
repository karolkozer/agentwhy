import { textButton } from './button.ts';

/**
 * "✦ I'm stuck" (for-people-who-build-with-ai.md F43): ready-made questions and answers written in advance, stored with
 * the page. No free text and no model until O1 is decided, so nothing is sent anywhere. With a script, a question shows
 * its answer above the questions; with none, the panel is open and every question stands with its answer under it.
 */
export interface Question {
  /** Both already written in every language and escaped. */
  readonly question: string;
  readonly answer: string;
}

/**
 * The questions and their answers. Its trigger (`askTrigger`) may sit elsewhere - a window's foot - and names it by id.
 * `open` has no trigger at all: the questions are always there (`askCard`).
 */
export function askPanel(questions: readonly Question[], id: string, open = false): string {
  return '<div class="ak-box' + (open ? ' ak-open' : '') + '" id="' + id + '" data-ask>' +
    '<div class="ak-answer" data-ask-answer hidden></div>' +
    '<div class="ak-questions js-only">' + questions.map((each, at) =>
      '<button type="button" class="ak-q" data-ask-q="' + at + '">' + each.question + '</button>').join('') + '</div>' +
    '<dl class="ak-all">' + questions.map((each, at) =>
      '<dt>' + each.question + '</dt><dd data-ask-a="' + at + '">' + each.answer + '</dd>').join('') + '</dl>' +
    '</div>';
}

/** "✦ I'm stuck": opens and closes the panel it names. With no script the panel is always open, so it has nothing to do. */
export function askTrigger(label: string, id: string): string {
  return textButton(label, ' aria-expanded="false" aria-controls="' + id + '" data-ask-toggle', 'ak-trigger js-only');
}

/**
 * "✦ Not sure what to pick? Ask me." (spec §7.1): the same questions and written answers, always open, in a coral card
 * under a view's content (Settings, one card per tab).
 */
export function askCard(title: string, questions: readonly Question[], id: string): string {
  return '<section class="ak-card"><div class="ak-card-head"><span class="ak-card-mark" aria-hidden="true">✦</span>' +
    '<span class="ak-card-title">' + title + '</span></div>' + askPanel(questions, id, true) + '</section>';
}

/**
 * A written answer laid out to be read at a glance: the short answer first, in bold, then one point per line. The lines
 * of `text` are split on a newline; a single line stays as it is.
 */
export function writtenAnswer(text: string): string {
  const [lead = '', ...points] = text.split('\n');
  if (points.length === 0) return lead;
  return '<strong class="ak-lead">' + lead + '</strong>' + points.map((point) => '<span class="ak-point">' + point + '</span>').join('');
}

export const ASK_PANEL_STYLE = String.raw`
.ak-trigger{color:var(--coral-text)}.ak-trigger:hover{color:var(--coral-link-hover)}
.ak-box{margin-top:22px;padding:16px;border-radius:14px;background:var(--panel);border:1px solid var(--white-08)}
.js .ak-box:not(.ak-open){display:none}
.js .ak-all{display:none}
.ak-answer{font-size:15px;line-height:1.55;color:var(--text);margin-bottom:14px}
.ak-questions{display:flex;gap:8px;flex-wrap:wrap}
.js .ak-questions.js-only{display:flex}
.ak-q{background:transparent;border:1px solid var(--white-12);color:var(--text-soft);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.ak-q:hover,.ak-q[aria-pressed="true"]{border-color:var(--coral-60)}
.ak-all{margin:0}.ak-all dt{font-size:14px;font-weight:600;margin-top:12px}.ak-all dt:first-child{margin-top:0}
.ak-all dd{margin:4px 0 0;font-size:14.5px;line-height:1.55;color:var(--text-2)}
.ak-lead{display:block;font-weight:650;color:var(--text)}
.ak-point{display:block;position:relative;padding-left:16px;margin-top:6px}
.ak-point:before{content:"";position:absolute;left:3px;top:.6em;width:5px;height:5px;border-radius:50%;background:var(--coral-text)}
.ak-card{border-radius:14px;background:var(--coral-06);border:1px solid var(--coral-30);padding:16px 20px;margin:24px 0}
.ak-card-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.ak-card-mark{flex:none;width:32px;height:32px;border-radius:50%;background:var(--coral-14);color:var(--coral-text);display:flex;align-items:center;justify-content:center;font-size:14px}
.ak-card-title{font-size:15.5px;font-weight:600}
.ak-card .ak-box{margin:0;padding:0;background:none;border:0}
.ak-card .ak-answer{background:var(--panel);border:1px solid var(--white-08);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.ak-card .ak-q{border-color:var(--white-14);padding:7px 13px;font-size:13.5px}
`;

/** Opens and closes the box, and shows the chosen question's answer, copied from the page's own answers. */
export const ASK_PANEL_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-ask-toggle]');
  if (toggle) {
    const panel = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!panel) return;
    const open = !panel.classList.contains('ak-open');
    panel.classList.toggle('ak-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    return;
  }
  const question = event.target.closest('[data-ask-q]');
  if (!question) return;
  const panel = question.closest('[data-ask]');
  const at = question.getAttribute('data-ask-q');
  const answer = panel.querySelector('[data-ask-a="' + at + '"]');
  const slot = panel.querySelector('[data-ask-answer]');
  panel.querySelectorAll('[data-ask-q]').forEach((each) => each.setAttribute('aria-pressed', String(each === question)));
  slot.innerHTML = answer ? answer.innerHTML : '';
  slot.hidden = !answer;
});
`;
