// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.js';
/** Initials come from the page's own naming (`AI`, `H` and an ordinal), never from transcript text; escaped anyway. */
export function avatar(initials, tone, size = 42) {
    return '<span class="av av-' + tone + ' av-' + size + '" aria-hidden="true">' + e(initials) + '</span>';
}
/** Several readers of one file, overlapping (Advanced, "Read by"). */
export function avatarGroup(avatars) {
    return '<span class="avg">' + avatars.map((each) => avatar(each.initials, each.tone, 30)).join('') + '</span>';
}
export const AVATAR_STYLE = String.raw `
.av{flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700}
.av-42{width:42px;height:42px;font-size:14px}.av-40{width:40px;height:40px;font-size:12.5px}.av-30{width:30px;height:30px;font-size:11px}
.av-coral{background:var(--coral-16);color:var(--coral-text)}
.av-alert{background:var(--coral);color:var(--on-coral)}
.av-mint{background:var(--mint-14);color:var(--mint)}
.av-grey{background:var(--raised-2);color:var(--text-2)}
.av-40{border:1px solid var(--white-10)}.av-40.av-alert{border-color:var(--coral)}
.avg{display:flex}.avg .av{margin-right:-6px;border:2px solid var(--card)}
`;
