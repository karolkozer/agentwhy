/**
 * The session report, wearing the sessions observatory's clothes: a fixed sidebar, a topbar that says where you
 * are, the verdict as a heading rather than a banner, and one workbench of two panels — the two views of the
 * session on the left, what is selected on the right.
 *
 * Ported from `.ai/mocks/report-clean.html`, rule for rule. What is here and not in the mock is what the mock has
 * nothing to say about: the language machinery, what a page without a script shows, the evidence tables and the
 * dialogs. The sessions index imports this file as its base, so the tokens, the reset and the shared components
 * stay general; anything that belongs to the report alone is written under `.rpt`.
 */
export const HTML_REPORT_STYLE = String.raw`
:root{color-scheme:dark;--side:225px;
  /* Measured rather than chosen by eye: the surfaces are lifted a step apart, the lines sit where a line can be
     seen, and the text colours moved only as far as the larger surfaces need. The page, its panels and its lines
     are neutral, which leaves the four signal colours as the only hues on the page. */
  --bg:#0d0e11;--panel:#151619;--raise:#1d1e23;--raise-2:#26272e;--canvas:#15161a;
  --hair:#3b3c44;--hair-2:#43444d;--hair-3:#585a66;
  /* text 16.8:1, muted 7.98:1, quiet 6.42:1 against the page; the four signals 8.7:1 and up. */
  --text:#f0efed;--muted:#a6a6ae;--quiet:#94949e;
  --ember:#ff997f;--brass:#e5bc71;--moss:#7dceb0;--indigo:#b0a3fa;
  /* The mock's own token names, aliased onto this page's, so its rules port without being rewritten. */
  --accent:var(--ember);--border:var(--hair);--dim:var(--quiet);--violet:var(--indigo);--amber:var(--brass);--green:var(--moss);
  --sans:ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--indigo);text-underline-offset:3px}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;touch-action:manipulation}
:focus-visible{outline:2px solid var(--indigo);outline-offset:2px;border-radius:6px}
code{font-family:var(--mono);font-size:.86em;font-variant-numeric:tabular-nums;background:rgba(255,255,255,.07);border-radius:5px;padding:.1em .38em;word-break:break-word}
h1,h2,h3,h4{text-wrap:balance;font-weight:600}
[hidden]{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.skip{position:fixed;left:20px;top:-100px;z-index:100;background:var(--ember);color:#171014;padding:12px;border-radius:8px;text-decoration:none}
.skip:focus{top:12px}
:root:not(.interactive) .js-only{display:none!important}
.interactive .nojs-only{display:none!important}
.i18n,.i18n-block{display:none}
:root[data-lang="en"] .i18n[lang="en"],:root[data-lang="pl"] .i18n[lang="pl"],:root[data-lang="de"] .i18n[lang="de"]{display:inline}
:root[data-lang="en"] .i18n-block[lang="en"],:root[data-lang="pl"] .i18n-block[lang="pl"],:root[data-lang="de"] .i18n-block[lang="de"]{display:block}
.lang{height:28px;padding:0 6px;border:0;border-radius:8px;background:var(--raise);color:var(--text);font:500 12.5px var(--sans);box-shadow:inset 0 0 0 1px var(--hair-2)}
.lang:hover{box-shadow:inset 0 0 0 1px var(--hair-3)}
.muted,.empty-note,.neutral-outcome{color:var(--muted)}

/* ── one dot vocabulary, one set of signal colours ── */
.dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.24);flex:none;display:block}
.dot.value{background:var(--ember)}
.dot:is(.hit,.secret,.named){background:var(--brass)}
.dot.block{background:var(--moss)}
.dot.clean{background:#5f5d68}
.dot:is(.unknown,.gap){background:none;box-shadow:inset 0 0 0 1.5px var(--brass)}

/* "Not established" is drawn, not only written (§7.5): what is already drawn with a line is drawn with a dashed
   one. One rule for every such element stood here, setting border-style and nothing else, and a style with no
   width of its own is the browser's own 3px in the colour of the text on all four sides, so every element that
   draws no box of its own (a section, a step of the evidence, a row of the list) wore a white dashed one. */
.rpt .steps>li.chain.unknown{border-left-style:dashed}
.rpt .listview tbody tr.chain.unknown td{border-bottom-style:dashed;border-bottom-color:rgba(229,188,113,.35)}
/* A section whose record has gaps is the one of these that has no line to dash, so it is given the box the mark
   asks for: the brass of the unknown, at the weight every other dashed edge on the page is drawn at. */
.rpt .sect.chain.unknown{border:1px dashed rgba(229,188,113,.38);border-radius:12px;padding:15px 17px}
.rpt .sect.chain.unknown>h3{margin-top:0}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   The report page. Everything below is scoped to .rpt, because the sessions index loads this file as its base
   and draws the same room with its own measurements.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
.rpt svg.icon{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.rpt .ambient{position:fixed;inset:0 0 0 var(--side);pointer-events:none;z-index:-1;background:radial-gradient(ellipse 70% 42% at 55% 0%,rgba(173,77,59,.08),transparent 85%),radial-gradient(ellipse 50% 50% at 100% 60%,rgba(121,97,180,.03),transparent 90%)}


/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   The column, for both pages that have one. It used to be written twice - once here under .rpt and once in the
   index's own stylesheet - which is how the sessions list and the report came to carry the same column at two
   widths, with two different wordmarks. One block, unscoped, and --side is the only place the width is written.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
/* Every rule below names the column it belongs to. Without that, a page's own reset reaches into the component:
   the index's .idx p{margin:0} is more specific than a bare .nav-label, so the label's space under it
   collapsed there and held on the report - the same column, spaced two different ways. */
.sidebar{position:fixed;inset:0 auto 0 0;width:var(--side);display:flex;flex-direction:column;background:rgba(16,17,20,.93);border-right:1px solid #29292e;padding:30px 16px 20px;overflow-y:auto;z-index:10}
.sidebar .brand{display:flex;align-items:center;gap:9px;padding:0 12px;font-size:23px;font-weight:650;letter-spacing:-1.2px;color:var(--text);text-decoration:none}
.sidebar .brand-name em{font-style:normal;color:var(--ember)}
.sidebar .brand-mark{width:32px;height:32px;flex-shrink:0;color:var(--ember)}
.sidebar .workspace{margin:32px 4px 26px;padding:12px 12px 11px;background:#1a1b20;border:1px solid var(--hair);border-radius:9px;min-width:0}
.sidebar .workspace-meta{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sidebar .workspace-icon{width:24px;height:24px;flex:none;display:grid;place-items:center;border:1px solid #424047;border-radius:6px;color:#c3b8e4;background:#302a3b}
.sidebar .workspace-icon .icon,.sidebar .workspace-icon svg{width:14px;height:14px}
/* The two lines wrap rather than end in an ellipsis: this text grows by a third between the languages the page
   ships with, and the German of it was being cut at every width the column has ever had. */
.sidebar .workspace b{display:block;font-weight:550;font-size:13px;line-height:1.35;overflow-wrap:break-word}
.sidebar .workspace small{color:var(--muted);font-size:11px;line-height:1.4;min-width:0;overflow-wrap:break-word}
.sidebar .nav-label{color:var(--quiet);font:10px var(--mono);letter-spacing:1.6px;margin:0 14px 22px;text-transform:uppercase}
.sidebar .nav{display:grid;gap:4px}
.sidebar .nav-item{display:flex;align-items:center;gap:12px;min-height:46px;padding:10px 14px;border-radius:8px;color:var(--muted);font-size:13px;text-decoration:none;cursor:pointer}
.sidebar .nav-item:hover{background:#202125;color:var(--text)}
.sidebar .nav-item .icon,.sidebar .nav-item svg{width:19px;height:19px;flex:none}
.sidebar .nav-name{min-width:0}
.sidebar .nav-count{margin-left:auto;font:11px var(--mono);border-radius:4px;padding:1px 6px;background:rgba(255,255,255,.035);color:#b3adb6}
.sidebar .nav-item[aria-current="page"],.sidebar .nav-item.active{color:var(--ember);background:linear-gradient(90deg,rgba(168,84,60,.15),rgba(168,84,60,.06));box-shadow:inset 0 0 0 1px rgba(168,97,73,.22)}
.sidebar .nav-item[aria-current="page"] .nav-count,.sidebar .nav-item.active .nav-count{background:rgba(227,138,106,.09);color:#e9a68f}
.sidebar-bottom{margin-top:auto}
.sidebar .local-note{border-top:1px solid #2b2c30;padding:20px 12px 2px;margin-top:20px;font-size:12px;color:var(--muted)}
.sidebar .local-note .dot{display:inline-block;width:7px;height:7px;background:var(--moss);box-shadow:0 0 8px rgba(125,206,176,.27);margin-right:7px}
.sidebar .local-note small{display:block;color:var(--quiet);margin:7px 0 0 14px;font-size:11px}
/* Below this the column is not a column: the mark and the way around sit on a line at the top of the page and
   scroll with it, which is the only size where a fixed column is not worth its width. */
@media (max-width:580px){
  .sidebar{position:static;width:auto;flex-direction:row;align-items:center;gap:12px;height:auto;padding:12px 16px 0;border-right:0;background:none;overflow:visible}
  .workspace,.sidebar-bottom,.nav-label{display:none}
  .sidebar>.nav{display:flex;gap:8px;margin-left:auto}
  .sidebar>.nav .nav-item{min-height:44px;padding:8px 12px;border:1px solid var(--hair);border-radius:9px}
  .sidebar>.nav .nav-count{display:none}
}

/* ── shell ── */
.rpt .shell{margin-left:var(--side)}
.rpt .topbar{min-height:70px;padding:10px 0;margin:0 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px;color:var(--muted)}
.rpt .breadcrumb{display:flex;gap:10px;align-items:center;flex-wrap:nowrap;min-width:0;overflow:hidden}
.rpt .breadcrumb>a,.rpt .breadcrumb>.slash,.rpt .breadcrumb>.session-id{flex-shrink:0}
.rpt .breadcrumb a{display:inline-flex;align-items:center;gap:7px;padding:10px 0;color:var(--muted);text-decoration:none}
.rpt .breadcrumb a .icon{width:15px;height:15px}
.rpt .breadcrumb a:hover{color:var(--text)}
.rpt .breadcrumb b{color:#d9d6d5;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rpt .slash{color:#62606b}
.rpt .session-id{font:11px var(--mono);color:var(--quiet);border:1px solid #33333a;border-radius:5px;padding:3px 7px;white-space:nowrap}
.rpt .top-actions{display:flex;align-items:center;gap:16px;flex-shrink:0}
.rpt .policy-label{font:10px var(--mono);letter-spacing:1px;border:1px solid #414047;padding:5px 8px;border-radius:5px;color:#bcb8c3;text-decoration:none;white-space:nowrap}
.rpt .policy-label:hover{border-color:var(--ember);color:var(--ember)}
.rpt .scope-btn{display:flex;align-items:center;gap:8px;min-height:44px;font-size:12px;color:var(--muted);text-decoration:none}
.rpt .scope-btn:hover{color:var(--text)}
.rpt .scope-btn .icon{width:15px;height:15px;color:var(--quiet)}
.rpt .scope-btn .dot{width:7px;height:7px}
.rpt .scope-btn.complete .dot{background:var(--moss)}
.rpt .scope-btn.partial .dot{background:var(--brass)}
.rpt .main{padding:16px 28px 44px;max-width:1900px}

/* ── the verdict: a heading, not a banner. A bordered box this wide leaves a void across the middle of a large
      screen and its frame argues with the panel below it, so the severity is carried by one icon and one coloured
      phrase. Everything under it — the graph, the list — is what a person came here to use. ── */
.rpt .verdict{max-width:104ch;margin:4px 0 18px}
.rpt .verdict h1{display:flex;align-items:center;gap:11px;font-size:clamp(17px,1.35vw,21px);font-weight:620;letter-spacing:-.5px;line-height:1.3}
.rpt .verdict h1 .warn{width:18px;height:18px;flex:none;color:var(--ember)}
.rpt .verdict h1 em{font-style:normal;color:var(--ember)}
.rpt .lead{display:flex;flex-wrap:wrap;align-items:baseline;margin-top:7px;padding-left:29px;font-size:13px;color:var(--muted);line-height:1.5}
.rpt .lead-next{color:#e6dcdb;font-weight:400}
.rpt .lead:has(.verdict-stats) .lead-next{padding-right:13px;margin-right:13px;border-right:1px solid rgba(255,255,255,.08)}
.rpt .verdict-stats{display:inline-flex;flex-wrap:wrap;align-items:baseline}
.rpt .verdict-stats>span{padding-right:13px;margin-right:13px;border-right:1px solid rgba(255,255,255,.08)}
.rpt .verdict-stats>span:last-child{padding-right:0;margin-right:0;border-right:0}
.rpt .verdict-stats .num{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.rpt .verdict-stats .num.warm{color:var(--brass)}
.rpt .lead-more{margin-top:5px}
.rpt .tier-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;padding-left:29px;list-style:none;font-size:13px;color:var(--muted)}

/* ── panel, toolbar ── */
.rpt .panel{background:linear-gradient(145deg,rgba(29,29,32,.96),rgba(19,20,22,.96));border:1px solid #343439;border-radius:13px;box-shadow:0 10px 25px rgba(0,0,0,.13),inset 0 1px rgba(255,255,255,.015);overflow:hidden}
.rpt .views{min-width:0}
.rpt .workbench{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
.rpt .panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 22px;border-bottom:1px solid rgba(255,255,255,.04)}
.rpt .panel-head h2{font-size:15px;font-weight:550;letter-spacing:-.2px}
.rpt .panel-head p{font-size:12px;color:var(--muted);margin-top:3px}
.rpt .seg{display:flex;padding:3px;border:1px solid var(--hair);border-radius:9px;background:#101114;flex-shrink:0}
.rpt .seg button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;min-width:74px;padding:0 13px;border-radius:6px;font-size:12px;color:var(--muted)}
.rpt .seg button[aria-pressed="true"]{background:#2c2d33;color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.rpt .seg-ico{width:15px;height:15px;flex:none}
/* Two views of one thing: the table is what the markup shows, because it is the one that works with no script.
   Where a script runs, the switch decides, and the diagram becomes the view the panel opens on. */
.rpt .graphview{min-width:0}
.interactive .rpt .panel[data-view="graph"] .listview{display:none}
.interactive .rpt .panel[data-view="list"] .graphview{display:none}
.rpt .filters{display:flex;align-items:center;gap:8px 20px;flex-wrap:wrap;padding:9px 22px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px;color:var(--muted)}
.rpt .filters-label{color:var(--quiet);font:10px var(--mono);letter-spacing:1.2px;text-transform:uppercase}
.rpt .tier{--c:#9b9ba3;display:flex;align-items:center;gap:8px;min-height:44px;font-size:12px;color:var(--muted);transition:color .15s}
.rpt .tier:hover{color:var(--text)}
.rpt .tier .box{display:grid;place-items:center;width:15px;height:15px;flex:none;border-radius:4px;box-shadow:inset 0 0 0 1px var(--hair-3)}
.rpt .tier .box svg{width:11px;height:11px;fill:none;stroke:#171014;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.rpt .tier[aria-pressed="true"]{color:var(--text)}
.rpt .tier[aria-pressed="true"] .box{background:var(--c);box-shadow:none}
.rpt .tier[aria-pressed="true"] .box svg{opacity:1}
.rpt .tier b{font:11px var(--mono);font-weight:400;color:var(--text);background:rgba(255,255,255,.045);border-radius:4px;padding:2px 6px}
.rpt .t-value{--c:var(--ember)}
.rpt .t-hit,.rpt .t-secret,.rpt .t-named,.rpt .t-unknown{--c:var(--brass)}
.rpt .t-block{--c:var(--moss)}

/* ── list view: the observatory's table, with this session's columns ── */
.table-scroll{overflow-x:auto;max-width:100%;min-width:0;scrollbar-width:thin;scrollbar-color:#48484f transparent}
.rpt .listview table{border-collapse:collapse;width:100%;text-align:left}
.rpt .listview th{font-size:10px;letter-spacing:.5px;color:var(--quiet);font-weight:500;padding:11px 18px;border-top:0;border-bottom:1px solid #2c2c32;white-space:nowrap;text-transform:uppercase}
.rpt .listview td,.rpt .listview tbody th{padding:0;border-top:0;border-bottom:1px solid rgba(255,255,255,.03);font-size:13px;vertical-align:middle}
.rpt .listview td{padding:14px 18px;white-space:nowrap}
.rpt .listview tbody tr:last-child td,.rpt .listview tbody tr:last-child th{border-bottom:0}
.rpt .listview tbody tr{cursor:pointer}
.rpt .listview tbody tr:hover{background:rgba(255,255,255,.02)}
.rpt .listview tbody th{position:relative;white-space:nowrap;min-width:150px;font-weight:600;font-size:14px;text-transform:none;letter-spacing:0;color:var(--text)}
.rpt .listview tbody th a{display:flex;align-items:center;gap:9px;width:100%;padding:14px 18px;min-height:52px;text-align:left;font-weight:inherit;font-size:inherit;color:var(--text);text-decoration:none}
.rpt .listview tbody th{overflow:visible}
.rpt .listview tr[data-tier] th::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:2px;border-radius:3px;background:#45454d}
.rpt .listview tr[data-tier="value"] th::before{background:var(--ember)}
.rpt .listview tr:is([data-tier="hit"],[data-tier="secret"],[data-tier="named"],[data-tier="unknown"],[data-tier="gap"]) th::before{background:var(--brass)}
.rpt .listview tr[data-tier="block"] th::before{background:var(--moss)}
.rpt .listview tr[aria-current="true"]{background:rgba(255,255,255,.03)}
.rpt .listview tr[aria-current="true"] th::before{width:3px;box-shadow:0 0 12px rgba(255,153,127,.33)}
.rpt .kid{color:#5d5d67;font:12px var(--mono);width:10px;flex-shrink:0}
.rpt td.task{white-space:normal;min-width:180px;color:#d6d2d7}
.rpt td.did{font:12px var(--mono);color:var(--muted);max-width:170px;overflow:hidden;text-overflow:ellipsis}
.rpt td.out{text-align:right;white-space:normal}
.rpt .f{display:inline-block;font:11px var(--mono);background:rgba(187,107,69,.09);color:#ffae95;border:1px solid rgba(120,80,66,.53);border-radius:5px;padding:3px 7px;margin:2px 0 2px 9px}
.rpt .out-badge{display:inline-flex;margin:2px 0 2px 9px;align-items:center;gap:6px;border:1px solid #3e3b42;border-radius:5px;padding:4px 8px;font-size:11px;color:#bcb6c0;white-space:nowrap}
.rpt .out-badge .dot{width:7px;height:7px}
.rpt .out-badge.value{color:#ffae95;border-color:rgba(120,80,66,.53);background:rgba(187,107,69,.06)}
.rpt .out-badge:is(.hit,.secret,.named,.unknown){color:var(--brass);border-color:rgba(129,106,63,.53);background:rgba(161,123,55,.06)}
.rpt .out-badge.gap{border-style:dashed}
.rpt .out-badge.block{color:var(--moss);border-color:#355d4e;background:rgba(84,142,105,.06)}
.rpt .out-badge.clean{color:#b0aab4;border-color:#42404a}
.rpt .table-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:8px 20px;border-top:1px solid rgba(255,255,255,.04);font-size:12px;color:var(--muted)}
.rpt .more{display:inline-flex;align-items:center;gap:7px;min-height:44px;color:var(--muted);font-size:12px;text-align:left}
.rpt .more:hover{color:var(--ember)}
.rpt .more u{text-underline-offset:3px}
.rpt .empty-note{padding:28px 22px;color:var(--muted);font-size:13px}

/* ── graph view: a node canvas. Nothing here is positioned by hand — the script places every node and draws every
      wire from the attributes the markup carries, so the picture is right whether a session has three agents or
      thirty. The canvas is a surface in the page's elevation ladder, not a hole in it: page < canvas < node. ── */
.rpt .scroll-map{overflow:auto;scrollbar-width:thin;scrollbar-color:#48484f transparent;max-height:min(72vh,780px);background:var(--canvas);border-top:1px solid rgba(0,0,0,.24);box-shadow:inset 0 9px 16px -14px rgba(0,0,0,.6)}
.rpt .scene{position:relative;background-color:var(--canvas);background-image:radial-gradient(rgba(255,255,255,.12) 1.15px,transparent 1.15px);background-size:22px 22px;background-position:-11px -11px}
/* The four columns are the diagram's sentence — You, the main agent, its helpers, what they reached. A label in
   --quiet at 11px was not carrying that, so the header is a band: a rule across the canvas and labels above it. */
.rpt .col-band{position:absolute;left:0;right:0;top:0;height:42px;background:linear-gradient(#191a1f,#15161a);border-bottom:1px solid rgba(255,255,255,.08);pointer-events:none}
.rpt .col{position:absolute;top:13px;display:flex;gap:8px;align-items:center;white-space:nowrap;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#c0bac5}
.rpt .col em{font-style:normal;font:10px var(--mono);font-weight:400;letter-spacing:0;color:#e2dce6;background:#32333b;border:1px solid #474851;border-radius:4px;padding:1px 6px}
.rpt .col .head-short{display:none}
.rpt .scene.compact .col .head-full{display:none}
.rpt .scene.compact .col .head-short{display:inline}
.rpt .gedges{position:absolute;inset:0;overflow:visible;pointer-events:none}
.rpt .e{fill:none;stroke-width:1.7;vector-effect:non-scaling-stroke;transition:opacity .2s}
.rpt .e.dim{opacity:.2;stroke-width:1.2}
.rpt .e.lit{stroke-width:2.3}
.rpt .e-tree{stroke:#6e6c78}
.rpt .e-tree.unresolved{stroke:#6e6c78;stroke-dasharray:6 5}
.rpt .e-value{stroke:var(--ember)}
.rpt .e-hit{stroke:#c3a16c}
.rpt .e-named{stroke:#c3a16c;stroke-dasharray:7 6}
.rpt .e-secret{stroke:var(--brass);stroke-dasharray:2 6;stroke-linecap:round}
.rpt .e-unknown{stroke:var(--violet);stroke-dasharray:2 6}
.rpt .e-block{stroke:var(--moss)}
.rpt .gn{position:absolute;display:flex;flex-direction:column;justify-content:center;overflow:hidden;text-align:left;border:1px solid #3d3b44;border-radius:10px;padding:9px 13px;background:linear-gradient(115deg,#212026,#1b1a1f);box-shadow:0 3px 10px rgba(0,0,0,.15);min-width:0;transition:opacity .2s,border-color .15s}
.rpt .gn:hover{border-color:#6f6a76}
/* Two lines, neither of which may be squeezed: the box has a set height, and flex would otherwise shrink both
   until the words are a few pixels tall rather than let one of them run past the edge. */
.rpt .gn-top{display:flex;align-items:center;gap:9px;flex:none;min-width:0;font-size:14px;line-height:1.25;font-weight:600;letter-spacing:-.2px}
.rpt .gn-top b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rpt .gn-sub{flex:none;margin-top:4px;font-size:12px;line-height:1.35;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rpt .gn-n{margin-left:auto;flex:none;color:var(--quiet);font:11px var(--mono);background:rgba(255,255,255,.04);border-radius:4px;padding:1px 6px}
.rpt .gn .dot{width:9px;height:9px;flex:none}
.rpt .gn.dim{opacity:.34}
.rpt .gn[aria-pressed="true"]{border-color:var(--ember);box-shadow:0 0 0 3px rgba(255,153,127,.14),0 4px 14px rgba(0,0,0,.25)}
/* Each tier keeps its own skin, so a glance at the column sorts the session before a word is read. */
.rpt .gn.value{border-color:#6b4c44;background:linear-gradient(115deg,#2a2124,#221e21)}
.rpt .gn.value .gn-sub{color:#d6a897}
.rpt .gn:is(.hit,.named,.secret){border-color:#5e5240;background:linear-gradient(115deg,#26241e,#1f1e1b)}
.rpt .gn:is(.hit,.named,.secret) .gn-sub{color:#c8b083}
.rpt .gn.block{border-color:#33574a}
.rpt .gn.block .gn-sub{color:#8fc7ae}
.rpt .gn:is(.unknown,.gap){border-style:dashed;border-color:#4d4666}
.rpt .gn.ty{border-radius:26px;align-items:center;padding:0;background:#202126;border-color:#41424b}
.rpt .gn.ty .gn-top{font-size:13px;font-weight:550}
.rpt .gn.file .gn-top b{font-family:var(--mono);font-size:13px;font-weight:500}
.rpt .gn.file.value .gn-top b{color:#ffc0ac}
.rpt .gn.file:is(.hit,.named) .gn-top b{color:#e0c48d}
.rpt .gn .gi{width:15px;height:15px;flex:none;color:var(--quiet)}
.rpt .gn.signal{border-color:#5d533c;background:linear-gradient(115deg,#262319,#1f1d18)}
.rpt .gn.signal .gn-top b{color:var(--brass);font-size:13px}
.rpt .glegend{display:flex;flex-wrap:wrap;gap:9px 18px;padding:13px 22px;border-top:1px solid rgba(255,255,255,.04);font-size:11px;color:var(--muted)}
.rpt .lg{display:flex;align-items:center;gap:8px;white-space:nowrap}
.rpt .lg svg{width:22px;height:10px;flex:none;overflow:visible}
.rpt .map-note{display:flex;gap:8px;padding:12px 2px;font-size:12px;line-height:1.55;color:var(--muted)}
.rpt .map-note .icon{width:15px;height:15px;margin-top:2px;color:var(--quiet)}

/* ── the inspector: one card per thing the page can say something about ── */
.rpt .inspector{display:flex;flex-direction:column;gap:18px;align-self:start;min-width:0}
/* Without a script every card is in the page at once, so the stack needs the gap the switch would otherwise hide. */
.rpt #pane{display:flex;flex-direction:column;gap:18px;min-width:0}
.rpt .inspector .panel{padding:0}
.rpt .inspector-head{padding:20px 22px 16px}
/* The name and what was found, on one line - wrapping onto a second only when the card is too narrow to hold both. */
.rpt .who-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.rpt .chip{--c:#b0aab4;display:inline-flex;align-items:center;gap:7px;flex:none;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:600;color:color-mix(in srgb,var(--c) 70%,var(--text));background:color-mix(in srgb,var(--c) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 20%,transparent)}
.rpt .chip i{width:7px;height:7px;border-radius:50%;background:currentColor;display:block}
.rpt .chip.value,.rpt .avatar.value{--c:var(--ember)}
.rpt .chip:is(.hit,.secret,.named,.unknown),.rpt .avatar:is(.hit,.secret,.named,.unknown){--c:var(--brass)}
.rpt .chip.block,.rpt .avatar.block{--c:var(--moss)}
.rpt .who-line{display:flex;align-items:center;gap:12px}
.rpt .avatar{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:10px;background:color-mix(in srgb,var(--c,var(--ember)) 5%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--ember)) 34%,transparent);color:var(--c,var(--ember))}
.rpt .avatar svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.rpt .who-line h2{min-width:0;font-size:20px;letter-spacing:-.4px;font-weight:570;line-height:1.2;word-break:break-word}
.rpt .who-line .sub{display:block;font-size:12px;margin-top:2px;color:var(--muted);word-break:break-word}
.tabs{display:flex;border-bottom:1px solid var(--hair);padding:0 14px;gap:6px}
.tabs button{position:relative;flex:1;padding:12px 8px;min-height:46px;font-size:13px;color:var(--muted)}
.tabs button:hover{color:var(--text)}
.tabs button[aria-selected="true"]{color:var(--text)}
.tabs button[aria-selected="true"]::after{content:"";position:absolute;bottom:-1px;height:2px;background:var(--ember);left:8px;right:8px}
.rpt .inspector-body{padding:16px;min-width:0}
.tabpane{min-width:0}

/* ── what one panel says, at the mock's sizes ── */
.rpt .tldr{--c:var(--indigo);margin-top:4px;padding:20px;border:1px solid color-mix(in srgb,var(--c) 26%,transparent);border-left:4px solid var(--c);border-radius:4px 13px 13px 4px;background:color-mix(in srgb,var(--c) 9%,transparent);font-size:16px;font-weight:600;line-height:1.45;color:color-mix(in srgb,var(--c) 62%,var(--text))}
.rpt .tldr.tone-bad{--c:var(--ember)}.rpt .tldr.tone-warn,.rpt .tldr.tone-low{--c:var(--brass)}.rpt .tldr.tone-ok{--c:var(--moss)}
.rpt .panel.value .tldr{--c:var(--ember)}.rpt .panel:is(.hit,.secret,.named,.unknown) .tldr{--c:var(--brass)}.rpt .panel.block .tldr{--c:var(--moss)}
.rpt .seen-answer{display:flex;flex-direction:column;gap:2px;margin-top:12px}
.rpt .seen-word{font-size:40px;line-height:1.15;font-weight:700;letter-spacing:-.035em;color:var(--c);text-transform:uppercase}
.rpt .seen-says{margin-top:12px;font-size:17px;line-height:1.55;font-weight:400;color:#f0e9e7}
.rpt .seen-rows{list-style:none;margin-top:22px;border-top:1px solid color-mix(in srgb,var(--c) 30%,transparent)}
.rpt .seen-rows li{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--c) 30%,transparent);font-size:14px;line-height:1.45}
.rpt .seen-rows li>span{min-width:0;overflow-wrap:anywhere}
.rpt .yn{flex:none;padding:3px 10px;border-radius:14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.rpt .yn.yes{color:var(--ember);background:color-mix(in srgb,var(--ember) 17%,transparent)}
.rpt .yn.no{color:var(--muted);background:rgba(255,255,255,.06)}
.rpt .yn.unknown{color:var(--brass);background:color-mix(in srgb,var(--brass) 15%,transparent)}
.rpt .summary-next{margin-top:22px}
.rpt .summary-next h4{font-size:15px;font-weight:650;color:var(--text);margin-bottom:6px}
.rpt .summary-next p{font-size:16px;line-height:1.6;color:#e4dce0}
.rpt .summary-help{margin-top:12px;font-size:13px;line-height:1.6;color:var(--muted)}
.rpt .summary-help summary{cursor:pointer;text-decoration:underline;text-underline-offset:3px;min-height:34px}
.rpt .section-title,.rpt .sect h3,.rpt .happened h3{font-size:16px;font-weight:550;letter-spacing:-.2px;margin-bottom:6px;color:var(--text)}
.rpt .section-lead{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:20px}
.rpt .sec-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.rpt .sec-head .section-title{display:flex;align-items:baseline;margin-bottom:0}
.rpt .steps-count{font:11px var(--mono);color:var(--quiet);background:rgba(255,255,255,.04);border-radius:4px;padding:2px 7px;margin-left:9px}
/* Framed, so it reads as a control; sized to the line beside it, so it does not outrank the heading. The accent
   stays reserved for what the report found - a utility button does not borrow it until hover. */
.rpt .ghost-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid #3f3b44;border-radius:7px;font-size:12px;font-weight:550;color:#cfcad2;flex-shrink:0}
.rpt .ghost-btn:hover{border-color:var(--ember);color:var(--ember)}
.rpt .ghost-btn .ico{width:13px;height:13px;flex:none}
.rpt .more-steps{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;margin-top:2px;border:1px dashed #45424a;border-radius:9px;font-size:13px;color:var(--muted)}
.rpt .more-steps:hover{color:var(--ember);border-color:#77584e}
.rpt .more-steps .ico{width:15px;height:15px;flex:none}
.rpt .steps{list-style:none;margin:20px 0 0}
.rpt .steps>li{position:relative;margin-left:12px;padding:0 0 24px 32px;border-left:1px solid #414149}
.rpt .steps>li:last-child{padding-bottom:2px;border-left-color:transparent}
.rpt .steps .n{position:absolute;left:-13px;top:0;display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#222329;box-shadow:inset 0 0 0 1px #4b4b54;font:11px var(--mono);color:#c9c8ce}
.rpt .steps h3{font-size:14px;font-weight:550;color:var(--text);margin-bottom:6px;padding-top:2px}
.rpt .steps blockquote{font-size:15px;line-height:1.55}
.rpt .steps p,.rpt .sect p{font-size:14px;line-height:1.65;color:#c3c2ca}
.rpt .steps p+p{margin-top:6px}
.rpt .note{padding:12px;background:rgba(255,255,255,.02);border-radius:7px;color:var(--muted);font-size:13px!important;line-height:1.6}
.rpt .none{color:var(--muted);font-size:13px;border:1px dashed var(--hair-3);border-radius:10px;padding:10px 12px}
.rpt .filebtn{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:10px 12px;min-height:44px;border-radius:7px;background:#1e1d21;box-shadow:inset 0 0 0 1px #343238;text-decoration:none}
.rpt .filebtn:hover{background:var(--raise-2);box-shadow:inset 0 0 0 1px var(--hair-3)}
.rpt .filebtn code{background:none;padding:0;font:12px var(--mono);color:#ffc0ac;word-break:break-all}
.rpt .filebtn span,.rpt .linkish{font-size:13px;font-weight:500;color:var(--indigo)}
.rpt .linkish{display:inline-block;margin-top:9px;text-decoration:none}
.rpt .linkish:hover,.rpt .filebtn:hover span{text-decoration:underline}
.rpt .sect{margin-top:22px}
/* Who touched it: one card per agent, because this list is the answer to "who", not a set of links. */
.rpt .touch{list-style:none;margin-top:12px;border-radius:11px;background:rgba(255,255,255,.012);box-shadow:inset 0 0 0 1px var(--hair);overflow:hidden}
.rpt .touch li+li{border-top:1px solid rgba(255,255,255,.04)}
.rpt .touch a{display:grid;grid-template-columns:11px minmax(0,1fr) auto;align-items:center;column-gap:12px;padding:13px 15px;min-height:66px;color:var(--text);text-decoration:none}
.rpt .touch a:hover{background:rgba(255,255,255,.03)}
.rpt .touch .dot{width:11px;height:11px}
.rpt .touch b{font-size:15px;font-weight:620;letter-spacing:-.2px}
.rpt .touch em{--c:var(--muted);display:inline-flex;align-items:center;height:20px;padding:0 10px;margin-left:8px;border-radius:20px;vertical-align:1px;font-style:normal;font-size:12px;font-weight:550;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent)}
.rpt .touch em.value{--c:var(--ember)}.rpt .touch em:is(.hit,.secret,.named,.unknown){--c:var(--brass)}.rpt .touch em.block{--c:var(--moss)}
.rpt .touch small{display:block;margin-top:4px;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rpt .touch .arr{color:var(--quiet)}
.rpt .touch a:hover .arr{color:var(--ember)}
.rpt .next{--c:var(--ember);margin-top:22px;padding:16px 18px;border:1px solid #4a3a3c;border-left:3px solid #ff896b;border-radius:4px 12px 12px 4px;background:linear-gradient(140deg,#2a2225,#221e22)}
.rpt .next h3{font-size:15px;font-weight:650;color:var(--c);margin-bottom:6px}
.rpt .next p{font-size:15px;line-height:1.6;color:#e4dce0}
.rpt .story{margin-top:10px;padding:14px 15px;border:1px solid var(--hair);border-radius:11px;background:rgba(255,255,255,.015)}
.rpt .story h4{font-size:15px;font-weight:600;line-height:1.4;margin-bottom:5px}
.rpt .story p{font-size:13px;color:var(--muted);line-height:1.55}
.rpt .story .meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 11px;margin-top:12px;font-size:12px;color:var(--muted)}
.rpt .story.value{border-color:#6b4c44;background:rgba(255,153,127,.03)}
.rpt .story.block{border-color:#33574a;background:rgba(125,206,176,.03)}
.rpt .what{margin-top:16px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.02);box-shadow:inset 0 0 0 1px var(--hair);font-size:13.5px;line-height:1.6;color:var(--muted)}
.rpt .what h3{font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px}
.rpt .what p+p{margin-top:7px}
.rpt .what b{color:var(--text);font-weight:600}
.rpt .ev{margin-top:16px;font-size:12.5px;font-weight:600;color:var(--muted)}
.rpt .ev code{display:block;margin-top:7px;font:11px/1.8 var(--mono);padding:12px;background:#101114;border:1px solid #2b2c33;border-radius:6px;overflow-wrap:anywhere;color:var(--muted)}
.rpt .limit{margin-top:18px;padding-top:16px;border-top:1px solid var(--hair);font-size:13px;line-height:1.7;color:var(--muted)}
.rpt .codes{display:flex;flex-wrap:wrap;gap:6px}
.rpt .facts{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}
.rpt .facts dt{color:var(--muted)}
.rpt .gap-list{margin:8px 0 0 18px;font-size:13.5px}
.rpt .came-back,.rpt .use-line{margin-top:12px}
.file-chip{display:inline-block;max-width:100%;margin:1px 0;padding:0 6px;border-radius:6px;background:var(--raise-2);font-size:12.5px;line-height:1.7;overflow-wrap:anywhere}
/* The evidence card: a bordered card per section, its heading the size of a heading, and a marker that turns and
   takes the accent when the card is open. */
details.fold{margin-top:10px;border:1px solid var(--hair);border-radius:11px;background:rgba(255,255,255,.012)}
details.fold>summary{display:flex;align-items:center;gap:11px;min-height:58px;padding:14px 16px;cursor:pointer;color:var(--text);font-size:15px;font-weight:600;list-style:none}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary::before{content:"";flex:none;width:0;height:0;border-left:6px solid var(--quiet);border-top:4.5px solid transparent;border-bottom:4.5px solid transparent}
details.fold[open]>summary::before{border-left-color:var(--ember);transform:rotate(90deg)}
details.fold[open]>summary{border-bottom:0;padding-bottom:6px}
.rpt .evidence-fold>p,.rpt .evidence-fold>.steps,.rpt .evidence-fold>.sect{margin-left:14px;margin-right:14px}
.rpt .evidence-fold>.sect{margin-bottom:14px}
.rpt .happened h3{color:var(--c)}
.rpt .happened ol{margin:0 0 0 20px;display:flex;flex-direction:column;gap:7px;font-size:15px;line-height:1.55}
.rpt .happened li::marker{color:var(--muted);font-weight:600}
.rpt .happened li.key{color:var(--text);font-weight:600}
.rpt .happened li.key::marker{color:var(--c)}

/* ── the tables of evidence, and the dialogs they open into ── */
.rpt table{width:100%;border-collapse:collapse;font-size:13.5px}
/* An identifier is one thing. Broken across lines it reads as several, and neither half can be searched for. */
.rpt th code,.rpt td code{white-space:nowrap;word-break:normal;overflow-wrap:normal}
.rpt caption{text-align:left;padding:10px 14px;color:var(--muted);font-size:12.5px}
/* Written for every table but the list one, which sets its own: an evidence table is moved into the dialog to be
   read full width, and rules keyed to the fold it came from would not travel with it. */
.rpt th,.rpt td{text-align:left;padding:10px 14px;border-top:1px solid var(--hair);vertical-align:top}
.rpt th{color:var(--muted);font-weight:600}
.badge{display:inline-flex;gap:5px;align-items:center;padding:2px 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap;background:rgba(255,255,255,.09)}
.badge.succeeded{color:var(--ember)}.badge.blocked{color:var(--moss)}.badge.unknown{color:var(--brass);border:1px dashed var(--brass)}
.table-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}
.table-wrap>.table-scroll{width:100%}
.table-open{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;box-shadow:inset 0 0 0 1px var(--hair-2);color:var(--muted)}
.table-open:hover{color:var(--text);box-shadow:inset 0 0 0 1px var(--hair)}
/* A modal dialog is centred by the browser through margin:auto, which the reset at the top takes away from
   everything. Without these the dialog sits in the top-left corner, half of it off the page. */
dialog::backdrop{background:rgba(4,5,8,.72)}
dialog{color:var(--text);background:#191a1e;border:1px solid #424148;border-radius:14px;box-shadow:0 24px 90px rgba(0,0,0,.6);inset:0;margin:auto;padding:28px;width:min(96vw,1200px);max-height:86vh;overflow:auto}
.dialog-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.dialog-head h2{font-size:20px;font-weight:600}
.dialog-acts{display:flex;align-items:center;gap:8px}
.dialog-x,.dialog-back{display:grid;place-items:center;min-width:44px;min-height:44px;border:1px solid var(--hair);border-radius:8px;color:var(--muted)}
.dialog-back{grid-auto-flow:column;gap:5px;padding:0 12px;font-size:13px;font-weight:600}
.dialog-back svg{width:14px;height:14px}
.dialog-x:hover,.dialog-back:hover{color:var(--text);border-color:var(--hair-3)}
#table-modal{width:min(96vw,1200px)}
#table-modal-body th code,#table-modal-body td code{white-space:normal;overflow-wrap:anywhere}
.flow-link{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:7px 12px;border-radius:9px;background:var(--raise);box-shadow:inset 0 0 0 1px var(--hair-2);color:var(--indigo);font-size:13px;font-weight:600}
.flow-link:hover{background:var(--raise-2);box-shadow:inset 0 0 0 1px var(--hair-3)}
/* The one action a panel offers. */
.rpt .primary{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;margin-top:14px;padding:12px 15px;border-radius:8px;background:#28282d;box-shadow:inset 0 0 0 1px #414047;font-size:13px;font-weight:500;color:var(--text)}
.rpt .primary:hover{background:#33303a;box-shadow:inset 0 0 0 1px #796257}
.rpt .happened>.note{margin-top:10px}
#flow-modal{width:min(780px,calc(100% - 32px))}
.flow-title{font-size:20px;line-height:1.25;letter-spacing:-.01em;margin:0 0 2px}
/* The tab shows the opening of a long run and the dialog shows all of it - the same element, cut by the tab it
   sits in, so nothing has to be rendered twice and the two can never disagree. */
.rpt .tabpane .flow-title{display:none}
/* Only where the dialog that shows the rest can be opened: with no script the whole run is the only run there is. */
.interactive .rpt .tabpane .flow.long .flow-steps>li:nth-child(n+6){display:none}
.flow-steps>li{padding-bottom:22px}
.flow-step p{font-size:14.5px;line-height:1.65}
.flow-step.chain.unknown>p{border:1px dashed var(--brass);border-radius:10px;padding:8px 11px}
.flow-step.chain.unknown .n{box-shadow:none;border:1px dashed var(--brass)}
.times{color:var(--ember);font-family:var(--mono);font-weight:600}
.flow-ev{margin-top:6px}
.flow-ev>summary{cursor:pointer;font-size:12px;color:var(--quiet);min-height:30px}
.flow-ev>summary:hover{color:var(--muted)}
.flow-ev code{display:block;margin-top:5px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}

/* ── footer ── */
.rpt .footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--quiet);font-size:11px;padding:24px 2px 0;margin-top:20px;border-top:1px solid rgba(255,255,255,.03)}

/* ── the way back inside the inspector, and the way out of it on a narrow screen ── */
.paneback{display:inline-flex;align-items:center;gap:5px;max-width:100%;height:30px;padding:0 11px 0 7px;margin:0 0 12px;border-radius:8px;box-shadow:inset 0 0 0 1px var(--hair-2);color:var(--muted);font-size:13px;font-weight:500}
.paneback svg{width:15px;height:15px;flex:none}
.paneback b{color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.paneback:hover{background:rgba(255,255,255,.05);color:var(--text)}

/* ── narrower ── */
@media (max-width:1400px){.rpt .workbench{grid-template-columns:minmax(0,1fr) 380px}}
/* The column keeps one width at every size it is a column. It used to have four - 232, then 200, then 72px of
   icons, then a bar along the bottom - so the same page put its own chrome in a different place on almost every
   screen, and none of the steps bought room the page could not spare. Two states now: this column, or none. */
@media (max-width:1180px){
  .rpt .topbar{margin-inline:22px}.rpt .main{padding:20px 22px 44px}
  .rpt .workbench{grid-template-columns:minmax(0,1fr)}
  .rpt .listview th,.rpt .listview td,.rpt .listview tbody th a{padding-inline:14px}
}
@media (max-width:850px){
  .rpt .topbar{min-height:60px}
}
@media (max-width:580px){
  .rpt .shell{margin-left:0}.rpt .ambient{left:0}
  .rpt .topbar{margin:0 18px;min-height:58px}
  .rpt .breadcrumb{font-size:11px;gap:8px}
  .rpt .breadcrumb .session-id{display:none}
  .rpt .top-actions{gap:10px}
  .rpt .policy-label{display:none}
  .rpt .main{padding:16px 16px 92px}
  .rpt .verdict{margin-bottom:14px}
  .rpt .verdict h1{align-items:flex-start;font-size:17px}
  .rpt .lead,.rpt .tier-legend{padding-left:0}
  .rpt .panel-head{padding:14px 16px;flex-wrap:wrap}
  .rpt .seg{width:100%}.rpt .seg button{flex:1}
  .rpt .filters{padding:8px 16px}.rpt .filters-label{display:none}
  .rpt .listview table{min-width:720px}
  .rpt .glegend{padding-inline:16px;gap:8px 12px}
  .rpt .inspector-head{padding:18px}
  .rpt .inspector-body{padding:12px}
  .rpt .seen-word{font-size:34px}
  .rpt .footer{font-size:10px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{.rpt .sidebar{display:none!important}.rpt .shell{margin-left:0!important}.js-only{display:none!important}.rpt .panel[hidden]{display:block!important}}
`;
