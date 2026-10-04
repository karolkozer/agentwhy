// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ALERT_THRESHOLDS } from '../../watch/agent-alert.ts';
import { CLEAN_MODES, NOTICE_CHANNELS, NOTICE_LANGS, SAID_AS } from '../../watch/notice-choices.ts';
import type { NoticeChange } from '../../watch/notice-settings.ts';
import type { NoticePreferences } from '../../watch/preferences.ts';
import type { LocalRequest, LocalResponse } from '../../../ports/local-server.ts';
import { isMarkResult, MARK_RESULTS } from '../../../ports/mark-store.ts';
import type { MarkAnswer, MarkRequest } from '../../check/mark-request.ts';
import type { OnboardingChoices } from '../onboarding/onboarding-changes.ts';
import type { FinishAnswer } from '../onboarding/finish-onboarding.ts';
import { onboardingChoices } from './onboarding-request.ts';
import { LANGS, type Lang } from '../../render/report-copy.ts';
import type { SettingsChange, SettingsAnswer } from './settings-request.ts';

export interface IndexHandlerDependencies {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** The random segment every served path starts with (R51). */
  readonly token: string;
  /** The files this run wrote, by name: the only ones ever served. */
  readonly files: ReadonlySet<string>;
  readonly read: (name: string) => Promise<string>;
  readonly mark: (request: MarkRequest) => Promise<MarkAnswer>;
  readonly unmark: (path: string) => Promise<MarkAnswer>;
  /**
   * One change to the project's settings (R57-R58). Absent where this run cannot write them - a shared page, or a
   * run with no project to write to - and then the route answers as it does for any name it was not given.
   */
  readonly settings?: (change: SettingsChange) => Promise<SettingsAnswer>;
  /**
   * One change to what this person is told when a turn ends (`the-agent-tells-you.md` R26, R26a). It writes the
   * preferences file rather than a project's settings, so it changes what a person hears and never what their
   * agents may do. Absent on a shared page, which names no machine and offers no choices.
   */
  readonly notify?: (change: NoticeChange) => Promise<{ readonly written: boolean; readonly said: string }>;
  /**
   * Writes the report of one conversation this run listed as outside its range (`for-people-who-build-with-ai.md`
   * F55), by the name its row carries. Absent on a shared page, which offers no button to ask for it.
   */
  readonly include?: (name: string) => Promise<{ readonly written: boolean; readonly said: string }>;
  /**
   * Finish of the onboarding (`.ai/specs/2026-09-24-onboarding.md` W15): the three steps' answers, written through the
   * routes above, and the record that it was finished. Absent where the onboarding is not served (W1).
   */
  readonly onboarding?: (choices: OnboardingChoices) => Promise<FinishAnswer>;
  /** Renders the index again from what the run holds, with the record as it now is. */
  readonly rerender: () => Promise<void>;
  /**
   * `which-project.md` V14, V17: show another of the person's projects in this tab. The page names it by the id this run
   * listed it under, never by a path; the answer is the address of the run that shows it, or why none does.
   */
  readonly switchProject?: (id: string, from: SwitchFrom) => Promise<{ readonly url: string } | { readonly failed: string }>;
  /** Once the page has the new address: this run's server is done (V18). */
  readonly switched?: () => void;
  /**
   * `which-project.md` V14, amended 2026-09-28: a token another run of this process gave its pages, and what its pages
   * are told now. Absent, or `undefined` for a token no run gave: nothing, as for any path without this run's token.
   */
  readonly pastRun?: (token: string) => PastRunAnswer | undefined;
  /**
   * `which-project.md` V12: the computer's own folder window, opened by this server - the page sends no path, only the
   * language the window's heading is asked in. Absent where the computer has no such window this code knows.
   */
  readonly chooseFolder?: (lang: Lang, from: SwitchFrom) => Promise<ChooseAnswer>;
  /**
   * `live-pages` L1-L3: the version of a served file as it is now, and for the index how many conversations it lists.
   * Absent where this run keeps no versions; the route then answers as for a name it was not given.
   */
  readonly versionOf?: (name: string) => { readonly version: string; readonly conversations?: number } | undefined;
}

/**
 * What choosing a folder came to (V12), in kinds the page says in its own language: nothing chosen; a folder that is no
 * project; the folder shown in its own run already; one it switched to; projects near the one chosen - the one above it or
 * those inside it - offered with the folder itself under an id of the server's; or why the window could not help.
 */
/** What the page of a project shown earlier in this process is told (V14, amended). */
export interface PastRunAnswer {
  /** That project is the one shown now, under this run's token: its pages are sent there. */
  readonly same: boolean;
  /** "This page was for my-app. agentwhy now shows blog." */
  readonly page: () => Promise<string>;
  /** **Show my-app again**: its run started again; the answer is the address of its page. */
  readonly back: () => Promise<{ readonly url: string } | { readonly failed: string }>;
}

/** Where a page asks for another project from (`which-project.md` V16): the onboarding's project step, or the window. */
export type SwitchFrom = 'step' | 'window';

/** The one other value a page may send; anything else is the window, which asks nothing of the run it starts. */
function switchFrom(value: unknown): SwitchFrom {
  return value === 'step' ? 'step' : 'window';
}

export type ChooseAnswer =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused'; readonly not: 'home' | 'root' }
  | { readonly kind: 'here' }
  | { readonly kind: 'switched'; readonly url: string; readonly name: string }
  | { readonly kind: 'near'; readonly chosen: ChosenFolder; readonly projects: readonly ChosenFolder[]; readonly above: boolean }
  | { readonly kind: 'failed'; readonly reason: string };

/** A folder as a page may name it back: an id the server gave it, its name to show, and where it is, `~/…`, to say. */
export interface ChosenFolder {
  readonly id: string;
  readonly name: string;
  readonly place?: string;
  /** The project the page is about: on the onboarding's step it is chosen in the page, and the window offers no way to it. */
  readonly here?: true;
}

const TEXT = 'text/plain; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const VERSION_ROUTE = 'api/version/';

/**
 * A page with its version on its root element (L2), and for the index how many conversations it was sent with, so the
 * pill can say how many are new (L8). A version is base 36 and a count a number: neither needs escaping.
 */
function withVersion(html: string, version: { readonly version: string; readonly conversations?: number }): string {
  const count = version.conversations === undefined ? '' : ' data-conversations="' + version.conversations + '"';
  return html.replace(/<html /, '<html data-version="' + version.version + '"' + count + ' ');
}

/**
 * The page's server as a function of a request (`worth-running-every-day` R50-R53): a name it was not given, a path
 * without the token, a file this run did not write, a write from another origin - each gets nothing. What is left is
 * reading the pages and the two writes a person can make from them.
 */
export function indexHandler(dependencies: IndexHandlerDependencies): (request: LocalRequest) => Promise<LocalResponse> {
  const { origin, token } = dependencies;
  const host = origin.replace(/^http:\/\//, '');
  const prefix = `/${token}/`;

  return async (request) => {
    // A name that merely resolves to this machine is not the address the page was opened on (DNS rebinding).
    if (request.headers.host !== host) return { status: 403, type: TEXT, body: 'Forbidden.' };
    if (!request.path.startsWith(prefix)) {
      const other = /^\/([^/]+)\/(.*)$/.exec(request.path);
      const past = other === null ? undefined : dependencies.pastRun?.(other[1] ?? '');
      return past === undefined ? notFound() : pastRunAnswer(past, other?.[2] ?? '', request, dependencies, prefix);
    }
    const rest = request.path.slice(prefix.length);

    if (request.method === 'GET') {
      // live-pages L3: a page asks whether its file is still the version it was sent. The refresh ran before this
      // handler was reached (the server runs it for every page and every version asked for); this only answers.
      if (rest.startsWith(VERSION_ROUTE)) {
        // Empty is the page opened at the served root: the index, as a `GET` of the root is.
        const asked = rest.slice(VERSION_ROUTE.length) || 'index.html';
        const version = dependencies.files.has(asked) ? dependencies.versionOf?.(asked) : undefined;
        return version === undefined ? notFound() : { status: 200, type: JSON_TYPE, body: JSON.stringify(version) };
      }
      const name = rest === '' ? 'index.html' : rest;
      if (!dependencies.files.has(name)) return notFound();
      const body = await dependencies.read(name);
      // L2: the page carries the version it was sent at, added as it is sent, so the file on disk - and the version
      // hashed from it - is exactly what the renderer wrote.
      const version = dependencies.versionOf?.(name);
      return { status: 200, type: 'text/html; charset=utf-8', body: version === undefined ? body : withVersion(body, version) };
    }

    const routes = [
      'api/mark',
      'api/unmark',
      ...(dependencies.settings === undefined ? [] : ['api/settings']),
      ...(dependencies.notify === undefined ? [] : ['api/notify']),
      ...(dependencies.include === undefined ? [] : ['api/include']),
      ...(dependencies.onboarding === undefined ? [] : ['api/onboarding']),
      ...(dependencies.switchProject === undefined ? [] : ['api/switch-project']),
      ...(dependencies.chooseFolder === undefined ? [] : ['api/choose-folder']),
    ];
    if (request.method !== 'POST' || !routes.includes(rest)) return notFound();
    if (request.headers.origin !== origin) return { status: 403, type: TEXT, body: 'Forbidden.' };
    if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return { status: 415, type: TEXT, body: 'JSON only.' };

    let body: unknown;
    try {
      body = JSON.parse(request.body);
    } catch {
      return reply(400, 'The request was not JSON.');
    }
    if (body === null || typeof body !== 'object') return reply(400, 'The request was not an object.');
    const fields = body as Record<string, unknown>;

    if (rest === 'api/notify') {
      const change = noticeChange(fields);
      if (typeof change === 'string') return reply(400, change);
      const answer = await (dependencies.notify as (one: NoticeChange) => Promise<{ written: boolean; said: string }>)(change);
      if (!answer.written) return reply(500, answer.said);
      await dependencies.rerender();
      return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, message: answer.said }) };
    }

    if (rest === 'api/choose-folder') {
      const lang = LANGS.find((one) => one === fields.lang) ?? 'en';
      const answer = await (dependencies.chooseFolder as (lang: Lang, from: SwitchFrom) => Promise<ChooseAnswer>)(lang, switchFrom(fields.from));
      if (answer.kind === 'failed') return reply(422, answer.reason);
      // A folder switched to is this run's end, as a switch by id is (V18): the answer is sent whole first.
      return {
        status: 200,
        type: JSON_TYPE,
        body: JSON.stringify({ ok: true, ...answer }),
        ...(answer.kind === 'switched' && dependencies.switched !== undefined ? { after: dependencies.switched } : {}),
      };
    }

    if (rest === 'api/switch-project') {
      if (typeof fields.id !== 'string' || fields.id === '' || fields.id.length > 1024) return reply(400, 'A project is named.');
      const answer = await (dependencies.switchProject as (id: string, from: SwitchFrom) => Promise<{ readonly url: string } | { readonly failed: string }>)(fields.id, switchFrom(fields.from));
      if ('failed' in answer) return reply(422, answer.failed);
      // The answer is sent whole before this run's server closes: closing first would cut it.
      return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, url: answer.url }), ...(dependencies.switched === undefined ? {} : { after: dependencies.switched }) };
    }

    if (rest === 'api/include') {
      // F55: one name, and nothing else; whether it may be written is the run's to say, which lists what it left out.
      if (typeof fields.name !== 'string' || fields.name === '' || fields.name.length > 200) return reply(400, 'A conversation is named.');
      const answer = await (dependencies.include as (name: string) => Promise<{ written: boolean; said: string }>)(fields.name);
      if (!answer.written) return reply(422, answer.said);
      await dependencies.rerender();
      return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, message: answer.said }) };
    }

    if (rest === 'api/onboarding') {
      const choices = onboardingChoices(fields);
      if (typeof choices === 'string') return reply(400, choices);
      const answer = await (dependencies.onboarding as (one: OnboardingChoices) => Promise<FinishAnswer>)(choices);
      // A name that cannot be written refuses the whole request: nothing was written, nothing recorded (R59).
      if (answer.outcome === 'refused') return reply(422, answer.message);
      // Handled, whatever each change answered: the page names the ones that failed (W20), and every page is read again.
      await dependencies.rerender();
      return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, results: answer.results, recorded: answer.recorded, ...(answer.codex === undefined ? {} : { codex: answer.codex }) }) };
    }

    if (rest === 'api/settings') {
      const change = settingsChange(fields);
      if (typeof change === 'string') return reply(400, change);
      // R58: the page's confirm step is the consent, so the same setup a terminal runs is run with `yes`.
      const answer = await (dependencies.settings as (one: SettingsChange) => Promise<SettingsAnswer>)(change);
      // R59: a refusal says why and writes nothing; R60: a write is followed by the page being read again.
      if (answer.outcome !== 'written' && answer.outcome !== 'unchanged') {
        return reply(answer.outcome === 'refused' ? 422 : 500, answer.output.trim());
      }
      await dependencies.rerender();
      return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, message: answer.output.trim() }) };
    }

    if (typeof fields.path !== 'string' || fields.path === '') return reply(400, 'A path is required.');

    let answer: MarkAnswer;
    if (rest === 'api/mark') {
      const result = fields.result;
      if (!isMarkResult(result)) return reply(400, `The result is ${MARK_RESULTS.join(', ')}.`);
      if (fields.note !== undefined && typeof fields.note !== 'string') return reply(400, 'A note is text.');
      answer = await dependencies.mark({
        path: fields.path,
        result,
        ...(typeof fields.note === 'string' && fields.note.trim() !== '' ? { note: fields.note } : {}),
      });
    } else {
      answer = await dependencies.unmark(fields.path);
    }

    if (answer.outcome !== 'marked') return reply(answer.outcome === 'mark-refused' ? 422 : 500, answer.output.trim());
    await dependencies.rerender();
    return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, message: answer.output.trim() }) };
  };
}

/**
 * R57: one change per request, in the shape `--watch`/`--refuse`/`--protect`/`--unprotect` already give the command
 * line, plus the change of a pattern, which is those last two in order. A body this does not recognise is answered
 * as the bad request it is, and nothing is written.
 */
function settingsChange(fields: Record<string, unknown>): SettingsChange | string {
  // Which of the project's two settings files the change is to. Absent is the local one, which is what `init`
  // writes when `--shared` is not given; anything else is a body this server does not recognise.
  if (fields.where !== undefined && fields.where !== 'local' && fields.where !== 'shared') {
    return 'The file is local or shared.';
  }
  const where = fields.where === 'shared' ? { where: 'shared' as const } : {};
  if (fields.change === 'hooks') {
    if (!Array.isArray(fields.hooks)) return 'The hooks are a list.';
    const hooks = fields.hooks.filter((hook): hook is 'watch' | 'refuse' => hook === 'watch' || hook === 'refuse');
    if (hooks.length !== fields.hooks.length) return 'A hook is watch or refuse.';
    if (hooks.length === 0) return 'A hook is required.';
    if (typeof fields.on !== 'boolean') return 'The direction is true or false.';
    return { change: 'hooks', hooks, on: fields.on, ...where };
  }
  // The built-in list, written into the project. The patterns are named by the page rather than taken on trust
  // from a body: a request that could name any pattern at all would be a way to write rules nobody chose.
  if (fields.change === 'adopt') {
    if (fields.where !== 'local' && fields.where !== 'shared') return 'A change names the file it writes.';
    if (!Array.isArray(fields.patterns) || fields.patterns.length === 0) return 'The patterns are a list.';
    const patterns = fields.patterns.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
    if (patterns.length !== fields.patterns.length) return 'A pattern is text.';
    return { change: 'adopt', patterns: patterns.map((pattern) => pattern.trim()), where: fields.where };
  }
  // F57: one row's switch. The patterns and the rules are the page's, named as `adopt` names its patterns.
  if (fields.change === 'mode') {
    if (fields.where !== 'local' && fields.where !== 'shared') return 'A change names the file it writes.';
    if (fields.to !== 'block' && fields.to !== 'tell' && fields.to !== 'none') return 'The mode is block, tell or none.';
    if (!Array.isArray(fields.patterns) || fields.patterns.length === 0 || !Array.isArray(fields.rules)) return 'The patterns and the rules are lists.';
    const patterns = fields.patterns.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
    const rules = fields.rules.filter((rule): rule is string => typeof rule === 'string' && rule.trim() !== '');
    if (patterns.length !== fields.patterns.length || rules.length !== fields.rules.length) return 'A pattern is text.';
    return { change: 'mode', to: fields.to, patterns: patterns.map((pattern) => pattern.trim()), rules: rules.map((rule) => rule.trim()), where: fields.where };
  }
  // General (F56): the rules and the hooks the page names, into one file. As with `adopt`, the page names them.
  if (fields.change === 'scope') {
    if (fields.where !== 'local' && fields.where !== 'shared') return 'A change names the file it writes.';
    if (!Array.isArray(fields.patterns) || !Array.isArray(fields.hooks)) return 'The patterns and the hooks are lists.';
    const patterns = fields.patterns.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
    if (patterns.length !== fields.patterns.length) return 'A pattern is text.';
    const hooks = fields.hooks.filter((hook): hook is 'watch' | 'refuse' => hook === 'watch' || hook === 'refuse');
    if (hooks.length !== fields.hooks.length) return 'A hook is watch or refuse.';
    if (patterns.length === 0 && hooks.length === 0) return 'A change sets something.';
    return { change: 'scope', patterns: patterns.map((pattern) => pattern.trim()), hooks, where: fields.where };
  }
  // F59: both hooks out of each file named, with the rules the page names for it. A file named with no rules still has
  // its hooks taken out; a body that names no file at all asks for nothing.
  if (fields.change === 'uninstall') {
    const named = fields.rules;
    if (typeof named !== 'object' || named === null || Array.isArray(named)) return 'The rules are listed by file.';
    const rules: Partial<Record<'local' | 'shared', readonly string[]>> = {};
    for (const [file, list] of Object.entries(named)) {
      if (file !== 'local' && file !== 'shared') return 'The file is local or shared.';
      if (!Array.isArray(list)) return 'The rules are a list.';
      const patterns = list.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
      if (patterns.length !== list.length) return 'A pattern is text.';
      rules[file] = patterns.map((pattern) => pattern.trim());
    }
    if (Object.keys(rules).length === 0) return 'An uninstall names the files it takes agentwhy out of.';
    // AO17: the window's unticked choice - out of the person's own Codex files too. Anything but true is unticked.
    return { change: 'uninstall', rules, ...(fields.codex === true ? { codex: true } : {}) };
  }
  // The same rule, in the other file. `where` is the destination and is required here: a move with no file named
  // is not a move. A hook is moved by a `hooks` change instead, which names the file it is to run from.
  if (fields.change === 'move') {
    if (fields.where !== 'local' && fields.where !== 'shared') return 'A move names the file it goes to.';
    const to = fields.where;
    if (typeof fields.pattern !== 'string' || fields.pattern.trim() === '') return 'A pattern is required.';
    if (fields.from !== 'local' && fields.from !== 'shared') return 'A move names the file it comes from.';
    return { change: 'move', pattern: fields.pattern.trim(), from: fields.from, where: to };
  }
  // U7: the update notice names nothing; what it pins, and to what, the setup reads for itself.
  if (fields.change === 'update') return { change: 'update' };
  if (fields.change === 'codex') return { change: 'codex' };
  if (fields.change === 'protect' || fields.change === 'unprotect' || fields.change === 'edit') {
    if (typeof fields.pattern !== 'string' || fields.pattern.trim() === '') return 'A pattern is required.';
    if (fields.change !== 'edit') return { change: fields.change, pattern: fields.pattern.trim(), ...where };
    if (typeof fields.from !== 'string' || fields.from.trim() === '') return 'The pattern being changed is required.';
    return { change: 'edit', from: fields.from.trim(), pattern: fields.pattern.trim(), ...where };
  }
  return 'The change is hooks, protect, unprotect, edit, move, adopt, scope, mode, uninstall or update.';
}

/**
 * R26a: the scope, and the answers to set - or that they are to be taken out. Nothing else about a person or a
 * project goes in the body, and a value this version does not know is a bad request rather than a choice half
 * written: someone believing they are told more than they are is the failure this whole feature exists against.
 */
function noticeChange(fields: Record<string, unknown>): NoticeChange | string {
  if (fields.scope !== 'project' && fields.scope !== 'everywhere') return 'The scope is project or everywhere.';
  const scope = fields.scope;

  const on = oneOf(fields.on, ALERT_THRESHOLDS);
  const clean = oneOf(fields.clean, CLEAN_MODES);
  const say = oneOf(fields.say, SAID_AS);
  const notify = channelsIn(fields.notify);
  const lang = oneOf(fields.lang, NOTICE_LANGS);
  if (on === 'unknown') return `A level is ${ALERT_THRESHOLDS.join(', ')}.`;
  if (clean === 'unknown') return `A quiet turn is ${CLEAN_MODES.join(', ')}.`;
  if (say === 'unknown') return `A value is said as ${SAID_AS.join(' or ')}.`;
  if (notify === 'unknown') return `A channel is ${NOTICE_CHANNELS.join(', ')}.`;
  if (lang === 'unknown') return `A language is ${NOTICE_LANGS.join(', ')}.`;

  const choices: NoticePreferences = {
    ...(on === undefined ? {} : { on }),
    ...(clean === undefined ? {} : { clean }),
    ...(say === undefined ? {} : { say }),
    ...(notify === undefined ? {} : { notify }),
    ...(lang === undefined ? {} : { lang }),
  };
  // Mirrors the CLI's `--reset`: it takes answers out, and is refused rather than guessed at where a choice came
  // with it. Checked after the fields are read, so a choice this version does not know is still the error said -
  // and checked before `choices` is dropped, so a choice given alongside `reset` is never silently lost.
  if (fields.reset === true) {
    return Object.keys(choices).length > 0
      ? 'A reset takes answers out; it cannot be given alongside a choice.'
      : { scope, choices: {}, reset: true };
  }
  return Object.keys(choices).length === 0 ? 'A change sets something, or resets.' : { scope, choices };
}

function oneOf<T extends string>(value: unknown, known: readonly T[]): T | undefined | 'unknown' {
  if (value === undefined) return undefined;
  return known.find((candidate): candidate is T => candidate === value) ?? 'unknown';
}

function channelsIn(value: unknown): readonly ('chat' | 'terminal' | 'os')[] | undefined | 'unknown' {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) return 'unknown';
  const channels = value.map((name: unknown) => NOTICE_CHANNELS.find((channel) => channel === name));
  return channels.includes(undefined) ? 'unknown' : [...new Set(channels as ('chat' | 'terminal' | 'os')[])];
}

/**
 * The pages of a project shown earlier in this process (V14, amended). The project shown again since: its pages are sent
 * to this run's address. Another: a page is "This page was for my-app", a page open in a tab that asks whether it
 * changed is told it has gone for good (410, so it says so at once, L13), and the only thing it may ask is the way back -
 * from its own origin, as every write. Nothing else is read or written from it (V17).
 */
async function pastRunAnswer(past: PastRunAnswer, rest: string, request: LocalRequest, dependencies: IndexHandlerDependencies, prefix: string): Promise<LocalResponse> {
  if (past.same) return request.method === 'GET' ? { status: 302, type: TEXT, body: '', location: prefix + rest } : notFound();
  if (request.method === 'GET') {
    if (rest.startsWith('api/')) return { status: 410, type: JSON_TYPE, body: JSON.stringify({ gone: true }) };
    return { status: 200, type: 'text/html; charset=utf-8', body: await past.page() };
  }
  if (request.method !== 'POST' || rest !== 'api/switch-back') return notFound();
  if (request.headers.origin !== dependencies.origin) return { status: 403, type: TEXT, body: 'Forbidden.' };
  const answer = await past.back();
  if ('failed' in answer) return reply(422, answer.failed);
  return { status: 200, type: JSON_TYPE, body: JSON.stringify({ ok: true, url: answer.url }), ...(dependencies.switched === undefined ? {} : { after: dependencies.switched }) };
}

function notFound(): LocalResponse {
  return { status: 404, type: TEXT, body: 'Not found.' };
}

function reply(status: number, message: string): LocalResponse {
  return { status, type: JSON_TYPE, body: JSON.stringify({ ok: false, message }) };
}
