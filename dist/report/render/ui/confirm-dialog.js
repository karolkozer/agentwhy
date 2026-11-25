// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { pill } from './button.js';
import { CLOSES, popup } from './popup.js';
/**
 * The parts one case supplies, each drawn outside `inLanguages` so the swap and the language rule never fight over
 * `display`. Exported for what a window builds itself and hands over as one piece - the note, whose handed-over
 * command differs with the case (BT8).
 */
export function confirmCase(at, body) {
    return inCase(at, body);
}
function inCase(at, body) {
    return body === '' ? '' : '<span class="cf-case cf-case-' + at + '">' + body + '</span>';
}
function confirmButton(spec) {
    return pill({ label: spec.confirm, tone: spec.tone ?? 'mint', size: 'lg', button: true, attributes: spec.confirmAttributes });
}
function choiceBlock(id, choice) {
    const question = id + '-q';
    // A real radio behind the kit's own ring (`scope-choice.ts`), so the choice is made and read the same with a script
    // or without one, and the card that is chosen is seen before it is read (guidelines §9.3).
    const chosen = choice.chosen ?? 1;
    const option = (one, at) => '<label class="cf-opt cf-opt-' + (one.markTone ?? 'grey') + '">' +
        '<input class="cf-radio cf-radio-' + at + '" type="radio" name="' + id + '-case" value="' + at + '"' + (at === chosen ? ' checked' : '') + '>' +
        '<span class="cf-ring" aria-hidden="true"></span>' +
        '<span class="cf-opt-mark" aria-hidden="true">' + one.mark + '</span>' +
        '<span><span class="cf-opt-name">' + one.name + (one.now ?? '') + '</span>' +
        '<span class="cf-opt-why">' + one.why + '</span></span></label>';
    // A question of its own only where the title does not ask it: an empty one would label the group with nothing.
    return '<div class="cf-choice"' + (choice.question === '' ? '' : ' role="radiogroup" aria-labelledby="' + question + '"') + '>' +
        (choice.question === '' ? '' : '<span class="cf-choice-q" id="' + question + '">' + choice.question + '</span>') +
        option(choice.options[0], 1) + option(choice.options[1], 2) + '</div>';
}
export function confirmDialog(spec) {
    const title = spec.id + '-title';
    const option = spec.choice === undefined ? spec.option
        : inCase(1, spec.choice.options[0].option) + inCase(2, spec.choice.options[1].option);
    const confirms = spec.choice === undefined
        ? confirmButton(spec)
        : inCase(1, confirmButton(spec.choice.options[0])) + inCase(2, confirmButton(spec.choice.options[1]));
    return popup({
        id: spec.id,
        size: 'confirm',
        labelledBy: title,
        ...(spec.attributes === undefined ? {} : { attributes: spec.attributes }),
        body: '<div class="cf' + (spec.choice === undefined ? '' : ' cf-choose') + '">' +
            (spec.glyph === '' ? '' : '<div class="cf-mark" aria-hidden="true">' + (spec.glyph ?? '⊘') + '</div>') +
            '<h3 class="cf-title" id="' + title + '">' + spec.title + '</h3>' +
            (spec.subject === '' ? '' : '<div class="cf-subject">' + spec.subject + '</div>') +
            '<p class="cf-sentence">' + spec.sentence + '</p>' +
            (spec.detail === undefined ? '' : '<div class="cf-detail">' + spec.detail + '</div>') +
            (spec.choice === undefined ? '' : choiceBlock(spec.id, spec.choice)) +
            (option === '' ? '' : '<div class="cf-option">' + option + '</div>') +
            (spec.note ?? '') +
            '<div class="cf-actions">' +
            pill({ label: spec.cancel, tone: 'outline', size: 'lg', button: true, attributes: CLOSES }) +
            confirms +
            '</div></div>',
    });
}
export const CONFIRM_DIALOG_STYLE = String.raw `
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
/* A window that asks takes the next size up of the family (popup.ts): at the confirm's own 460px the two cards drew
   four lines each and the sentence above them read as a wall (the maintainer, 2026-10-05). Narrower screens are
   unchanged - the window is still the viewport less its margin there. */
dialog.pp-confirm:has(.cf-choose){max-width:560px}
.cf-choose{padding:30px 32px}
@media (max-width:640px){.cf-choose{padding:24px 20px}}
.cf-choose .cf-sentence{margin-bottom:20px}
.cf-case{display:none}
.cf:has(.cf-radio-1:checked) .cf-case-1{display:contents}
.cf:has(.cf-radio-2:checked) .cf-case-2{display:contents}
.cf-choice{display:grid;gap:8px;margin:0 0 22px}
.cf-choice-q{font-size:13px;font-weight:600;color:var(--text-3)}
.cf-opt{position:relative;display:grid;grid-template-columns:20px 26px minmax(0,1fr);gap:11px;align-items:center;padding:13px 15px;border-radius:12px;border:1px solid var(--white-09);background:var(--panel);cursor:pointer}
.cf-opt:hover{background:var(--raised)}
.cf-opt:has(.cf-radio:checked){background:var(--raised-2)}
.cf-opt-mint:has(.cf-radio:checked){border-color:var(--mint-50)}
.cf-opt-sand:has(.cf-radio:checked){border-color:var(--sand-35)}
.cf-opt:has(.cf-radio:focus-visible){outline:2px solid var(--coral);outline-offset:2px}
.cf-radio{position:absolute;opacity:0;pointer-events:none}
.cf-ring{flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--white-30);display:flex;align-items:center;justify-content:center}
.cf-ring:after{content:"";width:10px;height:10px;border-radius:50%}
.cf-opt-mint .cf-radio:checked+.cf-ring{border-color:var(--mint)}.cf-opt-mint .cf-radio:checked+.cf-ring:after{background:var(--mint)}
.cf-opt-sand .cf-radio:checked+.cf-ring{border-color:var(--sand)}.cf-opt-sand .cf-radio:checked+.cf-ring:after{background:var(--sand)}
.cf-opt-grey .cf-radio:checked+.cf-ring{border-color:var(--text)}.cf-opt-grey .cf-radio:checked+.cf-ring:after{background:var(--text)}
.cf-opt-mark{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--white-06);color:var(--text-2)}
.cf-opt-mark svg{width:13px;height:13px}
.cf-opt-mint .cf-opt-mark{background:var(--mint-14);color:var(--mint)}
.cf-opt-sand .cf-opt-mark{background:var(--sand-16);color:var(--sand)}
.cf-opt-name{display:block;font-size:14.5px;font-weight:650;line-height:1.3;color:var(--text)}
.cf-opt-now{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:999px;background:var(--white-08);color:var(--text-3);font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;vertical-align:1px}
/* The way out that is not a mode: quiet, under the cards, and confirmed in a window of its own (QE5). */
.cf-drop{margin:-6px 0 20px;font-size:13.5px}
.cf-opt-why{display:block;margin-top:4px;font-size:13px;line-height:1.45;color:var(--text-2)}
`;
