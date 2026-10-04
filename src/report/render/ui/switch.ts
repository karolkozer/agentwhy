// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The on/off switch of the design (*agentwhy Settings*): a mint track when on, a white knob. It is a `role="switch"`
 * button, so with no script it states which way it is and does nothing; a page's script answers it. A switch never
 * flips itself - it shows what the file holds, and moves only once a write has landed (R60, R62).
 */
export interface Switch {
  readonly on: boolean;
  /** Greyed and inert: something it depends on is off. */
  readonly disabled?: boolean;
  /** Its name in every language (`labelAttributes`), and what the page's script finds it by, already escaped. */
  readonly attributes: string;
}

export function toggleSwitch(spec: Switch): string {
  return '<button type="button" class="sw' + (spec.on ? ' sw-on' : '') + '" role="switch" aria-checked="' + String(spec.on) + '"' +
    (spec.disabled === true ? ' disabled' : '') + spec.attributes + '><span class="sw-knob" aria-hidden="true"></span></button>';
}

export const SWITCH_STYLE = String.raw`
.sw{flex:none;width:56px;height:32px;border-radius:999px;border:none;padding:3px;cursor:pointer;background:var(--white-16);display:flex;justify-content:flex-start;transition:background .2s}
.sw-on{background:var(--mint);justify-content:flex-end}
.sw:disabled{cursor:default}
.sw[aria-busy="true"]{opacity:.6;cursor:progress}
.sw-knob{width:26px;height:26px;border-radius:50%;background:var(--white)}
`;
