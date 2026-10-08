// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A pill with a dot (guidelines §4, "Protection tags"): *Not protected* (coral outline), *Protected* (mint), *Not needed*
 * (grey); and, larger and without a dot, a task's *Done ✓*. `badge` is the small one with no dot and no outline that
 * says where something came from (guidelines §9.2: *Added by agentwhy* grey, *From your project* amber, *Added by you*
 * mint) or marks one of many (*Default · recommended*, mint; *Optional*, grey).
 */
export type TagTone = 'coral' | 'mint' | 'grey' | 'amber' | 'sand' | 'blue';

export function tag(label: string, tone: TagTone, size: 'sm' | 'md' | 'badge' = 'sm', outlined = false): string {
  return '<span class="tag tag-' + tone + ' tag-' + size + (outlined ? ' tag-outlined' : '') + '">' + (size === 'sm' ? '<span class="tag-dot" aria-hidden="true"></span>' : '') + label + '</span>';
}

export const TAG_STYLE = String.raw`
.tag{display:inline-flex;align-items:center;gap:7px;font-weight:600;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.tag-sm{font-size:12.5px;padding:4px 11px}
.tag-md{font-size:13px;padding:8px 14px}
.tag-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.tag-coral{color:var(--coral-text);background:var(--coral-08);border-color:var(--coral-40)}
.tag-mint{color:var(--mint);background:var(--mint-10)}
.tag-md.tag-mint{background:var(--mint-12)}
.tag-grey{color:var(--text-3);background:var(--white-04)}
.tag-amber{color:var(--amber);background:var(--amber-12)}
.tag-sand{color:var(--sand);background:var(--sand-16)}.tag-blue{color:var(--blue);background:var(--blue-16)}
.tag-badge{font-size:12px;padding:2px 9px;border:0}
.tag-badge.tag-outlined{border:1px solid var(--white-14)}
.tag-outlined.tag-coral{border-color:var(--coral-35)}.tag-outlined.tag-mint{border-color:var(--mint-35)}.tag-outlined.tag-amber{border-color:var(--amber-35)}
.tag-held{color:var(--text-3);font-weight:500}
.tag-badge.tag-coral{background:var(--coral-12)}.tag-badge.tag-mint{background:var(--mint-12)}.tag-badge.tag-grey{color:var(--text-2);background:var(--white-06)}
`;
