export function toggleSwitch(spec) {
    return '<button type="button" class="sw' + (spec.on ? ' sw-on' : '') + '" role="switch" aria-checked="' + String(spec.on) + '"' +
        (spec.disabled === true ? ' disabled' : '') + spec.attributes + '><span class="sw-knob" aria-hidden="true"></span></button>';
}
export const SWITCH_STYLE = String.raw `
.sw{flex:none;width:56px;height:32px;border-radius:999px;border:none;padding:3px;cursor:pointer;background:var(--white-16);display:flex;justify-content:flex-start;transition:background .2s}
.sw-on{background:var(--mint);justify-content:flex-end}
.sw:disabled{cursor:default}
.sw[aria-busy="true"]{opacity:.6;cursor:progress}
.sw-knob{width:26px;height:26px;border-radius:50%;background:var(--white)}
`;
