// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A small number with its name (Advanced's four numbers, the record tab's): `page` sits on the page, `record` inside a
 * window. The tone colours the number only.
 */
export function stats(items: readonly { readonly label: string; readonly value: string; readonly tone?: 'coral' | 'mint' }[], variant: 'page' | 'record'): string {
  return '<div class="sx sx-' + variant + '">' + items.map((item) =>
    '<div class="sx-card"><div class="sx-label">' + item.label + '</div><div class="sx-value' +
    (item.tone === undefined ? '' : ' sx-' + item.tone) + '">' + item.value + '</div></div>').join('') + '</div>';
}

export const STAT_STYLE = String.raw`
.sx{display:grid;gap:10px}
.sx-page{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:16px}
.sx-record{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:28px}
.sx-card{border-radius:14px}
.sx-page .sx-card{padding:14px 18px;background:var(--card);border:1px solid var(--white-08)}
.sx-record .sx-card{padding:16px 18px;background:var(--raised);border:1px solid var(--white-07)}
.sx-label{color:var(--text-3)}
.sx-page .sx-label{font-size:12.5px;margin-bottom:4px}.sx-record .sx-label{font-size:13px;margin-bottom:6px}
.sx-value{font-weight:650;color:var(--text)}
.sx-page .sx-value{font-size:24px}.sx-record .sx-value{font-size:26px;letter-spacing:-0.01em}
.sx-coral{color:var(--coral-text)}.sx-mint{color:var(--mint)}
`;
