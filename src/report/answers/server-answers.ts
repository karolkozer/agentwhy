// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AnswerSource } from '../../ports/answer-source.ts';
import type { DetachedRun } from '../../ports/detached-run.ts';
import type { PageServerRecord, PageServers } from '../../ports/page-server.ts';
import { isOlder } from '../../shared/plain-version.ts';
import { NOT_FOUND_HERE } from '../start/detached-start.ts';
import type { AnswerScope } from './answer-kinds.ts';
import type { ListAnswer } from './answer-model.ts';
import { callIdIn } from './call-id.ts';
import { isListAnswer } from './list-shape.ts';

/** How long a server started for a question is waited for: past it the answer says the reading goes on, and it does. */
const WAIT_MS = 8_000;
/**
 * How long a page still reading is waited for, asked again each half second: "is everything okay" is a question about every
 * conversation, and an answer from the first few of them was wrong (the maintainer's run, 2026-11-24: 1 of 35). 35 take 26 s to read
 * once, and an app's own limit on a call is a minute or more. A page that has read them all and reads a changed one again is waited
 * for less.
 */
const READING_WAIT_MS = 40_000;
const AGAIN_WAIT_MS = 8_000;
const ASK_EVERY_MS = 500;
/** A page asked for by name is worth a longer wait: a project's first pages are every conversation of it. */
const OPEN_WAIT_MS = 45_000;

export interface ServerAnswersDependencies {
  readonly servers: Pick<PageServers, 'read'>;
  /** The name a folder's running server is remembered under. */
  readonly keyOf: (folder: string) => string;
  readonly version: () => Promise<string | undefined>;
  readonly source: AnswerSource;
  readonly run: DetachedRun;
  readonly sleep: (ms: number) => Promise<void>;
  /** A clock that only goes on, in milliseconds: how long a wait has been. */
  readonly elapsed: () => number;
  readonly project: string;
  readonly home: string;
}

export interface AskedWith {
  /** The call that asks (CVB22). */
  readonly call?: string | undefined;
  /** Where the newest of the conversations are all that is asked for, how many: a page reads the newest first. */
  readonly newest?: number | undefined;
  /** Told how far the reading has got, while it is waited for. */
  readonly progress?: ((checked: ListAnswer['checked']) => void) | undefined;
}

/**
 * An answer about a project or this computer, from the page server that already read its conversations
 * (`2026-11-24-talking-about-agentwhy.md` CV17): the running one, or one started as `start --detach` starts it. It reads no
 * conversation itself, and keeps nothing.
 */
export class ServerAnswers {
  readonly #dependencies: ServerAnswersDependencies;
  /** The folders whose page stopped answering while it was waited for. */
  readonly #quiet = new Set<string>();

  constructor(dependencies: ServerAnswersDependencies) {
    this.#dependencies = dependencies;
  }

  /** The running server's answer, starting none: for what a card may show beside what was asked. */
  async peek(scope: AnswerScope): Promise<ListAnswer | undefined> {
    return this.#askAt(this.#folderOf(scope), scope);
  }

  /** Where a server's pages are, as its record says. A server that ended has one too: only beside an answer of its own is it a link. */
  async address(scope: AnswerScope): Promise<string | undefined> {
    if (this.#quiet.has(this.#folderOf(scope))) return undefined;
    const record = await this.#recordAt(this.#folderOf(scope));
    return record?.url;
  }

  /** `newer`: a newer agentwhy's server runs here, which starts none beside it and answers in a shape this one does not know. */
  async ask(scope: AnswerScope, asked: AskedWith = {}): Promise<ListAnswer | 'starting' | 'no-server' | 'newer'> {
    const { run, servers, keyOf, version } = this.#dependencies;
    const folder = this.#folderOf(scope);
    this.#quiet.delete(folder);
    const known = await this.#askAt(folder, scope, asked.call);
    if (known !== undefined) return this.#whole(known, folder, scope, asked);
    const started = await run.run(['start', '--detach', '--no-open', '--quiet'], folder, WAIT_MS);
    const answered = await this.#askAt(folder, scope, asked.call);
    if (answered !== undefined) return this.#whole(answered, folder, scope, asked);
    const [own, record] = [await version(), await servers.read(keyOf(folder))];
    if (own !== undefined && record?.version !== undefined && isOlder(own, record.version)) return 'newer';
    return started !== undefined && !started.ended ? 'starting' : 'no-server';
  }

  /** The page of that scope, started where none runs: the report of that conversation where one is named and the page has it. */
  async open(scope: AnswerScope, key: string | undefined): Promise<{ readonly url: string; readonly found: boolean } | 'starting' | undefined> {
    const done = await this.#dependencies.run.run(['start', '--detach', '--no-open', '--quiet', ...(key === undefined ? [] : ['--session', key])], this.#folderOf(scope), OPEN_WAIT_MS);
    if (done === undefined) return undefined;
    if (!done.ended) return 'starting';
    const url = /http:\/\/127\.0\.0\.1:\d+\/\S+/.exec(done.output)?.[0];
    return url === undefined ? undefined : { url, found: !done.output.includes(NOT_FOUND_HERE) };
  }

  /** The answer once the page has read what it reads, or the last one it gave before the wait was over. */
  async #whole(first: ListAnswer, folder: string, scope: AnswerScope, { call, progress, newest }: AskedWith): Promise<ListAnswer> {
    const { elapsed, sleep } = this.#dependencies;
    const from = elapsed();
    let answer = first;
    const enough = (): boolean => isPart(answer) && newest !== undefined && [answer, answer.beside].every((list) => list === undefined || holdsNewest(list, newest));
    while (isReading(answer) && !enough() && elapsed() - from < (isPart(answer) ? READING_WAIT_MS : AGAIN_WAIT_MS)) {
      progress?.(checkedOf(answer));
      await sleep(ASK_EVERY_MS);
      const next = await this.#askAt(folder, scope, call);
      // A page that has stopped answering: what it said last stands, and its address is nobody's.
      if (next === undefined) {
        this.#quiet.add(folder);
        return answer;
      }
      answer = next;
    }
    return answer;
  }

  #folderOf(scope: AnswerScope): string {
    return scope === 'project' ? this.#dependencies.project : this.#dependencies.home;
  }

  async #askAt(folder: string, scope: AnswerScope, call?: string): Promise<ListAnswer | undefined> {
    const record = await this.#recordAt(folder);
    if (record === undefined) return undefined;
    const asking = callIdIn(call);
    const answer = await this.#dependencies.source.ask(`${record.url}api/answer/${scope}${asking === undefined ? '' : `/${asking}`}`);
    return isListAnswer(answer, scope) ? answer : undefined;
  }

  /**
   * PF7 as amended: a server of this version, or a newer one, which `start --detach` hands over too. What it answers is data, drawn
   * in this agentwhy's words, and taken only in a shape this one knows whole. An older one is left to stop by itself.
   */
  async #recordAt(folder: string): Promise<PageServerRecord | undefined> {
    const { servers, keyOf, version } = this.#dependencies;
    const [record, own] = [await servers.read(keyOf(folder)), await version()];
    if (record === undefined || own === undefined || record.version === own) return record;
    return record.version !== undefined && isOlder(own, record.version) ? record : undefined;
  }
}

const isReading = (answer: ListAnswer): boolean => answer.reading === true || answer.beside?.reading === true;
const checkedOf = ({ checked, beside }: ListAnswer): ListAnswer['checked'] =>
  ({ read: checked.read + (beside?.checked.read ?? 0), of: checked.of + (beside?.checked.of ?? 0) });
/** Whether the newest that many are read, or as many as there are: rows read further back are none of them. */
const holdsNewest = ({ checked, newestRead }: ListAnswer, newest: number): boolean => checked.read >= checked.of || (newestRead ?? 0) >= newest;
const isPart = (answer: ListAnswer): boolean => checkedOf(answer).read < checkedOf(answer).of;
