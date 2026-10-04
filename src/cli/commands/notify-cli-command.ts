// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { ALERT_THRESHOLDS, DEFAULT_THRESHOLD, type AlertThreshold } from '../../report/watch/agent-alert.ts';
import {
  CLEAN_MODES,
  DEFAULT_CHANNELS,
  DEFAULT_CLEAN,
  DEFAULT_SAID_AS,
  NOTICE_CHANNELS,
  NOTICE_LANGS,
  SAID_AS,
  type CleanMode,
  type NoticeChannel,
  type SaidAs,
} from '../../report/watch/notice-choices.ts';
import type { NoticeSettings, NoticeSettingsView } from '../../report/watch/notice-settings.ts';
import type { NoticePreferences } from '../../report/watch/preferences.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

export const NOTIFY_USAGE = `Usage: agentwhy notify [--on value | reached | refused] [--clean off | once | every-turn]
                       [--say agent | line] [--notify chat,terminal,os] [--lang en | pl | de]
                       [--everywhere] [--reset]

What agentwhy tells you when a turn ends, and when. Run with nothing, it says what is set now and
where it comes from; with a choice, it writes that choice and the next turn uses it - no session
restarted, no settings file touched.

  --on <level>        which findings are said: value (default), reached, or refused
  --clean <when>      when a turn that found nothing says so: once (default), off, or every-turn
  --say <how>         how a value in the conversation is said: agent (default) - your own agent
                      says it and offers the report - or line, the grey line under the reply
  --notify <channels> where a notice is shown, comma-separated: chat, terminal, os
  --lang <language>   the language of the line in the conversation: en, pl or de. Unset, it is
                      your system's where agentwhy has words for it, else en
  --everywhere        your answer for every project, instead of this one
  --reset             take out the answers for this project, or with --everywhere, yours
  -h, --help          this text

Answers are read in this order: a flag written into a hook's command line, then this project's
answer, then yours, then agentwhy's own. They live in one file outside every project, so nothing
here is ever written into a repository.
`;

export interface NotifyCommandDependencies {
  readonly settings: NoticeSettings;
}

/** `agentwhy notify` - the command line half of `specs/2026-09-21-the-agent-tells-you.md` R26. */
export class NotifyCliCommand implements CliCommand {
  readonly name = 'notify';
  readonly usage = NOTIFY_USAGE;
  readonly #dependencies: NotifyCommandDependencies;

  constructor(dependencies: NotifyCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          on: { type: 'string' },
          clean: { type: 'string' },
          say: { type: 'string' },
          notify: { type: 'string' },
          lang: { type: 'string' },
          everywhere: { type: 'boolean', default: false },
          reset: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : 'that is not an option', usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };

    const on = read(values.on, ALERT_THRESHOLDS);
    const clean = read(values.clean, CLEAN_MODES);
    const say = read(values.say, SAID_AS);
    const notify = values.notify === undefined ? undefined : channelsIn(values.notify);
    const lang = read(values.lang, NOTICE_LANGS);
    if (on === 'unknown') return this.#unknown('--on', values.on ?? '', ALERT_THRESHOLDS);
    if (clean === 'unknown') return this.#unknown('--clean', values.clean ?? '', CLEAN_MODES);
    if (say === 'unknown') return this.#unknown('--say', values.say ?? '', SAID_AS);
    if (notify === 'unknown') return this.#unknown('--notify', values.notify ?? '', NOTICE_CHANNELS);
    if (lang === 'unknown') return this.#unknown('--lang', values.lang ?? '', NOTICE_LANGS);

    const choices: NoticePreferences = {
      ...(on === undefined ? {} : { on }),
      ...(clean === undefined ? {} : { clean }),
      ...(say === undefined ? {} : { say }),
      ...(notify === undefined ? {} : { notify }),
      ...(lang === undefined ? {} : { lang }),
    };
    const asked = Object.keys(choices).length > 0;
    if (!asked && !values.reset) return this.#say();

    // A flag and `--reset` in one run would be a choice written and taken out again: said, rather than guessed at.
    if (asked && values.reset) {
      return { kind: 'usage-error', message: '--reset takes answers out; it cannot be given alongside one', usage: this.usage };
    }

    const result = await this.#dependencies.settings.change({
      scope: values.everywhere ? 'everywhere' : 'project',
      choices,
      ...(values.reset ? { reset: true as const } : {}),
    });
    const view = await this.#dependencies.settings.view();
    return {
      kind: 'completed',
      output: `${result.said}\n\n${said(view)}`,
      exitCode: result.written ? EXIT_CODE.ok : EXIT_CODE.unexpected,
    };
  }

  async #say(): Promise<CommandResult> {
    return { kind: 'completed', output: said(await this.#dependencies.settings.view()), exitCode: EXIT_CODE.ok };
  }

  #unknown(flag: string, given: string, known: readonly string[]): CommandResult {
    return { kind: 'usage-error', message: `${flag} does not take "${given}". It takes: ${known.join(', ')}`, usage: this.usage };
  }
}

/**
 * What is set, and where each answer comes from. A person changing this is deciding how much they hear, so the
 * lines say which of the three levels answered rather than only what the answer is.
 */
function said(view: NoticeSettingsView): string {
  const from = (key: 'on' | 'clean' | 'say' | 'notify' | 'lang'): string =>
    view.forProject[key] !== undefined ? 'this project' : view.defaults[key] !== undefined ? 'you, everywhere' : "agentwhy's own";

  const lines = [
    'What agentwhy tells you when a turn ends',
    '',
    `  Findings said     ${view.effective.on ?? DEFAULT_THRESHOLD}${level(view.effective.on ?? DEFAULT_THRESHOLD)}   (${from('on')})`,
    `  A quiet turn      ${view.effective.clean ?? DEFAULT_CLEAN}${quiet(view.effective.clean ?? DEFAULT_CLEAN)}   (${from('clean')})`,
    `  A value is said   ${view.effective.say ?? DEFAULT_SAID_AS}${saidAs(view.effective.say ?? DEFAULT_SAID_AS)}   (${from('say')})`,
    `  Shown in          ${(view.effective.notify ?? DEFAULT_CHANNELS).join(', ')}   (${from('notify')})`,
    `  Written in        ${view.effective.lang ?? "your system's language, else en"}   (${from('lang')})`,
    '',
    `  This project      ${view.project}`,
    `  Answers kept in   ${view.path}`,
    ...(view.unusable ? ['', `  That file could not be read, so none of the above is an answer anybody gave.`] : []),
    '',
    '  Change it         agentwhy notify --on reached',
    '  For every project agentwhy notify --everywhere --clean every-turn',
  ];
  return `${lines.join('\n')}\n`;
}

const LEVEL: Readonly<Record<AlertThreshold, string>> = {
  value: ' - a value from a protected file is in the conversation',
  reached: ' - that, and a protected file reached',
  refused: ' - that, and an attempt that was stopped',
};

const QUIET: Readonly<Record<CleanMode, string>> = {
  off: ' - nothing is said about a turn that found nothing',
  once: " - the first quiet turn says the session is watched",
  'every-turn': ' - said after every reply',
};

const SAID: Readonly<Record<SaidAs, string>> = {
  agent: ' - by your own agent, which offers to open the report',
  line: ' - as the grey line under the reply',
};

const saidAs = (how: SaidAs): string => SAID[how];
const level = (threshold: AlertThreshold): string => LEVEL[threshold];
const quiet = (mode: CleanMode): string => QUIET[mode];

function read<T extends string>(value: string | undefined, known: readonly T[]): T | undefined | 'unknown' {
  if (value === undefined) return undefined;
  return known.find((candidate): candidate is T => candidate === value) ?? 'unknown';
}

function channelsIn(list: string): readonly NoticeChannel[] | 'unknown' {
  const names = list.split(',').map((name) => name.trim()).filter((name) => name !== '');
  const channels = names.map((name) => NOTICE_CHANNELS.find((channel) => channel === name));
  return channels.length === 0 || channels.includes(undefined) ? 'unknown' : [...new Set(channels as NoticeChannel[])];
}
