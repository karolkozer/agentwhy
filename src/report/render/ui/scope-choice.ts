// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * "Who is this for?" (guidelines §9.2; spec F40): *Just me* - this computer only, the project's local settings file -
 * or *Everyone on this project* - the committed one. Two radio cards; the first is chosen unless the page says
 * otherwise. They are real radios, so the choice is made, and read, the same with a script or without one.
 */
export interface ScopeOption {
  readonly value: 'local' | 'shared';
  /** Both already written in every language and escaped. */
  readonly label: string;
  readonly sub: string;
}

export function scopeChoice(question: string, name: string, options: readonly ScopeOption[], chosen: 'local' | 'shared' = 'local'): string {
  return '<fieldset class="sc"><legend class="sc-q">' + question + '</legend>' + options.map((option) =>
    '<label class="sc-option"><input type="radio" class="sc-radio" name="' + name + '" value="' + option.value + '"' +
    (option.value === chosen ? ' checked' : '') + '><span class="sc-ring" aria-hidden="true"></span>' +
    '<span class="sc-text"><span class="sc-label">' + option.label + '</span><span class="sc-sub">' + option.sub + '</span></span></label>').join('') +
    '</fieldset>';
}

export const SCOPE_CHOICE_STYLE = String.raw`
.sc{border:0;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:10px}
.sc-q{padding:0;margin-bottom:10px;font-size:13.5px;font-weight:600;color:var(--text-3)}
.sc-option{position:relative;display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:12px;background:var(--panel);border:1px solid var(--white-09);cursor:pointer}
.sc-option:has(.sc-radio:checked){background:var(--mint-07);border-color:var(--mint-50)}
.sc-option:has(.sc-radio:focus-visible){outline:2px solid var(--coral);outline-offset:2px}
.sc-radio{position:absolute;opacity:0;pointer-events:none}
.sc-ring{flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--white-30);display:flex;align-items:center;justify-content:center;margin-top:1px}
.sc-ring:after{content:"";width:10px;height:10px;border-radius:50%}
.sc-radio:checked+.sc-ring{border-color:var(--mint)}.sc-radio:checked+.sc-ring:after{background:var(--mint)}
.sc-label{display:block;font-size:15px;font-weight:600}
.sc-sub{display:block;font-size:13.5px;line-height:1.45;color:var(--text-2);margin-top:3px}
`;
