export function labelledSelect(question, choices, attributes) {
    return '<label class="ls"><span class="ls-q">' + question + '</span><select class="ls-select"' + attributes + '>' +
        choices.map((choice) => '<option value="' + choice.value + '">' + choice.label + '</option>').join('') + '</select></label>';
}
export const LABELLED_SELECT_STYLE = String.raw `
.ls{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--white-10);border-radius:10px;padding:0 6px 0 14px}
.ls-q{font-size:13.5px;color:var(--text-3);white-space:nowrap}
.ls-select{background:transparent;border:none;color:var(--text);font:inherit;font-size:14px;font-weight:600;padding:9px 6px;outline:none;cursor:pointer}
.ls-select option{background:var(--card)}
`;
