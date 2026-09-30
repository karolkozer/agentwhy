/**
 * Where a person is (guidelines §1.5): the mint bar with "{n} of {N} done", the rail of one dash per file in the Fix it
 * wizard, and its stepper of three steps.
 */

/** The mint bar and its words, already written in every language. */
export function progressBar(done: number, total: number, words: string): string {
  const percent = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
  return '<span class="pg"><span class="pg-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + total +
    '" aria-valuenow="' + done + '"><span class="pg-fill" style="width:' + percent + '%"></span></span>' +
    '<span class="pg-words">' + words + '</span></span>';
}

export type RailState = 'now' | 'done' | 'waiting';

/** One dash per item; its title is the item's name, escaped by the caller; `item` is what a script finds it by. */
export function rail(dashes: readonly { readonly state: RailState; readonly title: string; readonly item?: number }[]): string {
  return '<div class="rl" aria-hidden="true">' + dashes.map((dash) => '<span class="rl-dash rl-' + dash.state + '" title="' + dash.title + '"' +
    (dash.item === undefined ? '' : ' data-rail-item="' + dash.item + '"') + '></span>').join('') + '</div>';
}

export type StepState = 'past' | 'current' | 'future';

/** The wizard's steps: a past one carries a tick, the current one is lit, the rest wait. Labels in every language. */
export function stepper(steps: readonly { readonly label: string; readonly state: StepState }[]): string {
  return '<ol class="st">' + steps.map((step, at) =>
    '<li class="st-step st-' + step.state + '"' + (step.state === 'current' ? ' aria-current="step"' : '') + '>' +
    '<span class="st-mark" aria-hidden="true">' + (step.state === 'past' ? '✓' : String(at + 1)) + '</span>' + step.label + '</li>').join('') + '</ol>';
}

export const PROGRESS_STYLE = String.raw`
.pg{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-2)}
.pg-track{display:block;width:90px;height:5px;border-radius:999px;background:var(--white-08);overflow:hidden}
.pg-fill{display:block;height:100%;background:var(--mint);border-radius:999px;transition:width .4s}
.pg-words{white-space:nowrap}
.rl{display:flex;gap:6px;margin-bottom:18px}
.rl-dash{flex:1;height:5px;border-radius:3px;background:var(--white-12)}
.rl-now{background:var(--coral)}.rl-done{background:var(--mint)}
.st{flex:1;display:flex;gap:6px;justify-content:center;list-style:none;margin:0;padding:0;flex-wrap:wrap}
.st-step{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:999px;color:var(--text-3)}
.st-mark{width:18px;height:18px;border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center;background:var(--white-08);color:var(--text-2)}
.st-current{color:var(--text);background:var(--white-07)}.st-current .st-mark{background:var(--coral);color:var(--on-coral)}
.st-past{color:var(--mint)}.st-past .st-mark{background:var(--mint);color:var(--on-coral)}
`;
