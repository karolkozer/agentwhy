// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { runInNewContext } from 'node:vm';
import { CARD_SCRIPT } from '../../src/report/render/card/card-script.ts';
import { cardPage } from '../../src/report/render/card/card-page.ts';
import type { Lang } from '../../src/report/render/report-copy.ts';

/** As much of a page as the card's script touches, so a test runs the script and reads what it drew. */
export class Node {
  scrollTop = 0; tag: string; children: Node[] = []; parent: Node | undefined; own = ''; className = ''; hidden = false; type = '';
  readonly attributes = new Map<string, string>(); readonly style: Record<string, string> = {}; readonly listeners = new Map<string, ((event: object) => void)[]>();
  constructor(tag: string) { this.tag = tag; }
  get childNodes(): Node[] { return this.children; }
  get textContent(): string { return this.own + this.children.map((child) => child.textContent).join(''); }
  set textContent(text: string) { this.own = text; this.children = []; }
  appendChild(child: Node): Node { child.parent = this; this.children.push(child); return child; }
  remove(): void { if (this.parent !== undefined) this.parent.children = this.parent.children.filter((one) => one !== this); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, run: (event: object) => void): void { this.listeners.set(name, [...(this.listeners.get(name) ?? []), run]); }
  click(): void { for (const run of this.listeners.get('click') ?? []) run({}); }
  all(): Node[] { return [this, ...this.children.flatMap((child) => child.all())]; }
  querySelectorAll(tag: string): Node[] { return this.all().filter((node) => node !== this && node.tag === tag); }
  getBoundingClientRect(): object { return { height: 100, width: 600 }; }
}

export interface Drawn {
  readonly text: () => string;
  readonly buttons: () => readonly Node[];
  readonly spans: () => readonly Node[];
  /** The room the answer is drawn in, as the card set it. */
  readonly room: () => string;
  /** The frame takes another width. */
  readonly resize: (to: number) => void;
  readonly scrolled: () => number;
  readonly press: (text: string) => void;
  /** What the card asked of its app, newest last. */
  /** The app's answer to the last thing it was asked. */
  readonly answerLast: (result: object) => void;
  /** Another answer is handed to the same card. */
  readonly hand: (answer: object) => void;
  /** Every wait the card set is over. */
  readonly timeUp: () => void;
  readonly posted: { readonly method?: string; readonly params?: any; readonly id?: string }[];
}

/** The card with one answer handed to it, at a time of the test's. */
export function drawCard(answer: object, { lang = 'en', now = 0, host, width = 600 }: { readonly lang?: Lang; readonly now?: number; readonly host?: object; readonly width?: number } = {}): Drawn {
  const ids = new Map(['card', 'view', 'tabs', 'where', 'larger', 'words'].map((id) => [id, new Node(id)]));
  const at = (id: string): Node => ids.get(id) as Node;
  at('words').textContent = (/<script type="application\/json" id="words">(.*?)<\/script>/.exec(cardPage(lang)) as RegExpExecArray)[1] as string;
  at('larger').tag = 'button';
  at('larger').hidden = true;
  at('tabs').setAttribute('data-tabs', '');
  // A view is as tall as what is in it: what a card asks of its app's room is seen in a test.
  at('view').getBoundingClientRect = () => ({ height: 20 * at('view').all().length, width: 600 });
  for (const id of ['view', 'tabs', 'where', 'larger']) at('card').appendChild(at(id));
  const posted: Drawn['posted'] = [];
  const heard: ((event: object) => void)[] = [];
  const resized: (() => void)[] = [];
  let wide = width;
  at('card').getBoundingClientRect = () => ({ height: 100, width: wide });
  const waits: (() => void)[] = [];
  const parent = { postMessage: (message: object) => { posted.push(message); } };
  const make = (tag: string): Node => new Node(tag);
  const document = { getElementById: at, createElement: make, createTextNode: (text: string) => { const node = make('#text'); node.own = text; return node; }, documentElement: Object.assign(make('html'), { lang }), body: make('body') };
  const addEventListener = (name: string, run: (event: object) => void): void => { if (name === 'message') heard.push(run); if (name === 'resize') resized.push(() => run({})); };
  class Clock extends Date { static override now(): number { return now; } }
  const globals = { document, parent, addEventListener, setTimeout: (run: () => void) => waits.push(run), clearTimeout: () => undefined, requestAnimationFrame: (run: () => void) => run(), Date: Clock, Intl, JSON, Math, Promise, ResizeObserver: class { observe(): void { /* nothing is measured here */ } } };
  runInNewContext(CARD_SCRIPT, { ...globals, window: globals });
  const started = posted.find((one) => one.method === 'ui/initialize');
  if (host !== undefined) for (const run of heard) run({ source: parent, data: { jsonrpc: '2.0', id: started?.id, result: host } });
  for (const run of heard) run({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { 'agentwhy/answer': answer } } } });
  const buttons = (): readonly Node[] => at('card').querySelectorAll('button');
  return {
    text: () => at('view').textContent,
    buttons,
    resize: (to) => { wide = to; for (const run of resized) run(); },
    room: () => at('view').style['height'] ?? '',
    scrolled: () => at('view').scrollTop,
    spans: () => at('card').querySelectorAll('span'),
    press: (text) => { const found = buttons().find((one) => one.textContent === text); if (found === undefined) throw new Error(`no button ${text}: ${buttons().map((one) => one.textContent).join(' | ')}`); found.click(); },
    answerLast: (result) => { for (const run of heard) run({ source: parent, data: { jsonrpc: '2.0', id: posted[posted.length - 1]?.id, result } }); },
    hand: (next) => { for (const run of heard) run({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { 'agentwhy/answer': next } } } }); },
    timeUp: () => { for (const run of waits.splice(0)) run(); },
    posted,
  };
}
