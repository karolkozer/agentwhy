// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The card in the chat (`2026-11-24-talking-about-agentwhy.md` CV4). It fills its frame with its own background - an app's frame is
 * white where a card has none (CVB15) - and has no border or corners of its own: the frame has them.
 */
export const CARD_STYLE = String.raw `
html,body{background:var(--card)}
.bd{background:radial-gradient(900px 420px at 60% -140px,var(--glow) 0%,var(--glow-mid) 55%,var(--bg) 100%)}
button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:left;cursor:pointer}
code{font:500 12.5px var(--mono);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 7px;overflow-wrap:anywhere}
#card{position:relative;z-index:1;padding:18px 22px;font-size:15px;line-height:1.5}
#view{overflow-y:auto;margin-right:-12px;padding-right:12px;scrollbar-width:thin;scrollbar-color:var(--white-16) transparent}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.brand{display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:650;letter-spacing:-0.01em;color:var(--coral)}
.brand svg{width:22px;height:21px;flex:none}.brand span{color:var(--text)}.brand em{font-style:normal;color:var(--coral)}
.dim{color:var(--text-2);font-size:13px}.faint{color:var(--text-3);font-size:12.5px}
.fact{font-size:22px;font-weight:650;line-height:1.3;letter-spacing:-0.02em;margin:0}
.ask{color:var(--coral-text)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px;margin:16px 0 4px}
.tile{background:var(--card);border:1px solid var(--white-09);border-radius:14px;padding:9px 13px}.tile b{display:block;font-size:22px;font-weight:650;line-height:1.3}
.t-coral{color:var(--coral-text)}.t-sand{color:var(--sand)}.t-blue{color:var(--blue)}.t-mint{color:var(--mint)}.t-amber{color:var(--amber)}.t-grey{color:var(--text-2)}
.strip{display:flex;flex-wrap:wrap;gap:4px;margin:16px 0 8px}.strip button{flex:none;width:13px;height:13px;border-radius:4px;background:var(--white-14)}
.strip button[aria-pressed="true"]{outline:2px solid var(--text);outline-offset:2px}
.b-coral{background:var(--coral)!important}.b-sand{background:var(--sand)!important}.b-blue{background:var(--blue)!important}.b-mint{background:var(--mint)!important}.b-amber{background:var(--amber)!important}
.bar{display:flex;gap:3px;margin:14px 0 10px}.bar i{height:10px;border-radius:5px;background:var(--white-16);min-width:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1px solid var(--white-14);border-radius:999px;padding:5px 12px;font-size:13.5px;color:var(--text-soft)}
button.chip:hover{border-color:var(--white-32)}
.rows{margin-top:12px}.row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:10px 0;border-top:1px solid var(--white-08)}
.row>*{min-width:0}.row strong{font-weight:600;overflow-wrap:anywhere}
.mark{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:650;background:var(--white-07)}
.m-coral{background:var(--coral-16);color:var(--coral-text)}.m-sand{background:var(--sand-16);color:var(--sand)}.m-blue{background:var(--blue-16);color:var(--blue)}.m-mint{background:var(--mint-16);color:var(--mint)}.m-amber{background:var(--amber-16);color:var(--amber)}
.topic{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 14px}.days{margin-top:6px}
.day{margin-top:18px;font-size:14px;font-weight:650;color:var(--text-soft)}
.days .rows{margin-top:8px}.under{display:block;font-size:13px}.under span{display:inline-block}.under>span:not(:last-child)::after{content:'·';margin:0 6px;color:var(--text-3)}.under b{font-weight:650}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--text-2);margin:0 0 6px}.legend>span{display:inline-flex;align-items:center;gap:6px}.legend i{width:11px;height:11px;border-radius:3px;background:var(--white-14)}.legend b{color:var(--text)}
.story{position:relative;margin:18px 0 4px;padding-left:26px}.story::before{content:'';position:absolute;left:6px;top:14px;bottom:14px;width:2px;background:var(--white-10)}
.stop{position:relative;margin-bottom:12px}.stop::before{content:'';position:absolute;left:-25px;top:22px;width:11px;height:11px;border-radius:50%;background:var(--white-30);box-shadow:0 0 0 4px var(--bg)}
.stop.d-coral::before{background:var(--coral)}.stop.d-sand::before{background:var(--sand)}.stop.d-blue::before{background:var(--blue)}.stop.d-mint::before{background:var(--mint)}.stop.d-amber::before{background:var(--amber)}
.box{border:1px solid var(--white-09);border-radius:16px;background:var(--card);overflow:hidden}.box .inside{margin:0;padding:0 18px 14px 64px}
.wrote{display:flex;gap:12px;padding:13px 18px;background:var(--white-04);border-bottom:1px solid var(--white-08);font-size:14px}.wrote>span:last-child{min-width:0;overflow-wrap:anywhere}.wrote .dim,.wrote .quote{display:block}
.ai{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--text-2);background:var(--white-06)}
.moment{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:14px;align-items:start;width:100%;padding:15px 18px}.moment:hover{background:var(--white-02)}
.glyph{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:650}.glyph.m-grey{background:var(--white-07)}
.told>*{display:block}.told strong{font-weight:650;font-size:15px;overflow-wrap:anywhere}.told .chips{display:flex;gap:6px;margin-top:8px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:3px}
.look{align-self:center;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:600;white-space:nowrap}.look.m-grey{background:var(--white-06);color:var(--text-2)}
.p-coral{color:var(--coral-text);border-color:var(--coral)}.p-sand{color:var(--sand)}.p-mint{color:var(--mint)}.p-amber{color:var(--amber)}.p-blue{color:var(--blue)}
.between{margin:0 0 12px;padding-left:4px}.whose{margin:18px 0 10px;font-weight:650}
.panel{margin:16px 0 4px;border:1px solid var(--white-09);border-radius:16px;background:var(--card);overflow:hidden}
.cell3{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:13px;align-items:center;padding:12px 18px;border-top:1px solid var(--white-06)}.cell3:first-child,.part-head:first-child{border-top:0}.cell3>*{min-width:0}.cell3 .under{margin-top:4px}
.part-head{display:flex;align-items:center;gap:10px;padding:13px 18px;background:var(--panel);border-top:1px solid var(--white-08)}.part-head i{width:9px;height:9px;border-radius:50%}
.part-head strong::first-letter{text-transform:uppercase}.folder{display:block;padding:8px 18px;font:500 12px var(--mono);color:var(--text-2);background:var(--white-04);border-top:1px solid var(--white-06);overflow-wrap:anywhere}
.go.small{padding:7px 16px;font-size:14px}
.panel.rows{margin-top:8px}.panel .row{padding:11px 18px}.panel>:first-child .row,.panel>.row:first-child{border-top:0}.panel .inside{padding:0 18px}.panel .file{padding:14px 18px;margin:0}.panel .file:first-child{border-top:0}
.diagram{margin:18px 0 4px;text-align:left}.node{border:1px solid var(--white-12);border-radius:16px;background:var(--card);padding:14px 16px}.node>*+*{margin-top:9px}.node p{margin-bottom:0}
.node.main{width:fit-content;margin:0 auto}.stem{display:block;width:2px;height:22px;margin:0 auto;background:var(--white-16)}.who{display:flex;align-items:center;gap:10px}
.nodes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;border-top:2px solid var(--white-16);border-radius:14px 14px 0 0;padding-top:16px}
.nodes.four{grid-template-columns:repeat(auto-fit,minmax(270px,1fr))}
.node.e-coral{border-color:var(--coral)}.node.e-sand{border-color:var(--sand)}.node.e-amber{border-color:var(--amber)}.node.e-blue{border-color:var(--blue)}.node.e-mint{border-color:var(--mint)}
.met{display:grid;gap:7px;font-size:13.5px}.acts .dim{margin:0}
.inside{margin:0 0 12px 40px}.inside>*+*{margin-top:8px}
.file{padding:11px 0;border-top:1px solid var(--white-08)}.file .head{display:flex;justify-content:space-between;gap:14px;align-items:baseline}.file .bar{margin:8px 0 6px}.file .bar i{height:8px}
.big{font-size:19px;font-weight:650}
.acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px}
.go{background:var(--coral);color:var(--on-coral);border-radius:999px;padding:10px 20px;font-weight:650}.go:hover{background:var(--coral-hover)}
.quiet{border:1px solid var(--white-16);border-radius:999px;padding:8px 15px;font-size:14px;color:var(--text-soft)}.quiet:hover{border-color:var(--white-32)}
.wait{max-width:420px}.wait .part i{width:38%;background:var(--coral);border-radius:2px;animation:go 1.6s ease-in-out infinite}@keyframes go{from{transform:translateX(-100%)}to{transform:translateX(270%)}}@media (prefers-reduced-motion:reduce){.wait .part i{animation:none}}
.part{height:4px;border-radius:2px;background:var(--white-08);margin:14px 0 6px;overflow:hidden}.part i{display:block;height:100%;background:var(--text-2)}
.said{font-size:16px;margin:0;overflow-wrap:anywhere}.sides{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.sides .chip[aria-pressed="true"]{background:var(--raised-2);border-color:var(--white-28);color:var(--text)}
.tabs{position:relative;display:flex;gap:4px;padding:4px;margin:0 0 18px;border-radius:999px;background:var(--panel);border:1px solid var(--white-09);width:fit-content;max-width:100%;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs[hidden]{display:none}
.tabs button{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;border-radius:999px;padding:8px 16px;font-size:14px;font-weight:600;color:var(--text-2)}
.tabs button:hover{color:var(--text)}
.tabs button[aria-current="true"]{background:var(--text);color:var(--bg)}
.tabs .n{min-width:20px;padding:0 6px;border-radius:999px;background:var(--white-10);font-size:12px;line-height:20px;text-align:center;font-weight:600}
.tabs button[aria-current="true"] .n{background:var(--coral);color:var(--on-coral)}
.end{display:inline-flex;align-items:center;gap:12px;min-width:0}#larger{width:30px;height:30px;border-radius:9px;text-align:center;font-size:20px;line-height:30px;color:var(--text-2);background:var(--white-05)}#larger:hover{color:var(--text);background:var(--white-10)}#larger[hidden]{display:none}
:focus-visible{outline-color:var(--text)}
@media (max-width:520px){.cell3{grid-template-columns:28px minmax(0,1fr)}.cell3>:nth-child(3){grid-column:2;justify-self:start}#card{padding:16px}.fact{font-size:19px}.tiles{grid-template-columns:1fr 1fr}.inside{margin-left:0}.row{grid-template-columns:28px minmax(0,1fr) auto}.row>.side:not(.at){grid-column:2}.moment{grid-template-columns:34px minmax(0,1fr)}.moment .look{grid-column:2;justify-self:start}.story{padding-left:20px}.stop::before{left:-20px}.story::before{left:5px}.box .inside{padding-left:18px}.tabs button{padding:8px 13px}}
`;
