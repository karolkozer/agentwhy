// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { listAnswer } from '../../answers/list-answer.js';
import { escapeHtml as e } from '../../render/html-report-components.js';
import { inLanguages } from '../../render/report-copy.js';
import { pathCell } from '../../render/ui/file-path.js';
const PARTS = [['read', 'coral'], ['changed', 'coral'], ['opened', 'blue'], ['stopped', 'mint'], ['unknown', 'amber'], ['named', 'blue']];
/**
 * How many times the AIs wanted each private or tracked file (`2026-11-24-talking-about-agentwhy.md` CV16): the chat's own answer, under
 * the list it counts, folded - it says nothing to do. Nothing where no AI wanted one. It works without a script.
 */
export function oftenSection(index) {
    const answer = listAnswer(index, index.computerView === undefined ? 'project' : 'computer');
    if (answer.often.length === 0)
        return '';
    const words = (make) => inLanguages((t) => e(make(t)));
    const row = (file) => {
        const parts = PARTS.filter(([part]) => file[part] > 0);
        const bar = parts.map(([part, tone]) => '<i class="of-' + (file.tracked && part === 'read' ? 'sand' : tone) + '" style="flex:' + file[part] + '"></i>').join('');
        const place = file.place;
        return '<li class="of-row"><div class="of-head"><span class="of-file">' + pathCell(file.path, { chip: 'chip' }) +
            (place === undefined ? '' : ' <span class="of-dim">' + words((t) => t('ch.' + place)) + '</span>') +
            (file.project === undefined ? '' : ' <span class="of-dim">' + e(file.project) + '</span>') +
            '</span><span class="of-times">' + words((t) => timesOf(t('an.often.times', { n: file.wanted }), file.wanted)) + '</span></div>' +
            '<div class="of-bar" aria-hidden="true">' + bar + '</div><p class="of-dim">' +
            words((t) => [...parts.map(([part]) => `${file[part]} ${t('an.o.' + part)}`), t('an.often.in', { n: file.conversations }), ...(file.tracked ? [t('an.often.track')] : [])].join(' · ')) + '</p></li>';
    };
    const rest = [
        ...(answer.oftenMore === 0 ? [] : [words((t) => t('an.more', { n: answer.oftenMore }))]),
        ...(answer.namedOnly === 0 ? [] : [words((t) => t('an.often.named', { n: answer.namedOnly }))]),
        words((t) => t('an.often.counted')),
    ];
    return '<details class="of"><summary>' + words((t) => t('an.often.fact')) + '</summary><ul class="of-list">' + answer.often.map(row).join('') + '</ul>' +
        rest.map((line) => '<p class="of-dim">' + line + '</p>').join('') + '</details>';
}
/** Polish has no number in its word; English and German do. */
const timesOf = (said, n) => (said.includes(String(n)) ? said : `${n} ${said}`);
export const OFTEN_STYLE = String.raw `
.of{margin:28px 0 0;border:1px solid var(--white-09);border-radius:14px;background:var(--card);padding:4px 20px}
.of summary{cursor:pointer;padding:14px 0;font-size:15px;font-weight:600;color:var(--text-soft)}
.of[open]{padding-bottom:16px}.of-list{list-style:none;margin:0;padding:0}
.of-row{padding:13px 0;border-top:1px solid var(--white-08)}
.of-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.of-file{min-width:0;max-width:100%}
.of-times{white-space:nowrap;font-weight:600}.of-dim{color:var(--text-2);font-size:13px;margin:4px 0 0}
.of-bar{display:flex;gap:3px;margin:9px 0 5px}.of-bar i{height:8px;min-width:4px;border-radius:4px}
.of-coral{background:var(--coral)}.of-sand{background:var(--sand)}.of-blue{background:var(--blue)}.of-mint{background:var(--mint)}.of-amber{background:var(--amber)}
`;
