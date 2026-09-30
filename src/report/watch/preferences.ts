import { isJsonObject, parseJsonObject, type JsonObject } from '../../shared/json.ts';
import { ALERT_THRESHOLDS, type AlertThreshold } from './agent-alert.ts';
import {
  CLEAN_MODES,
  NOTICE_CHANNELS,
  NOTICE_LANGS,
  SAID_AS,
  type CleanMode,
  type NoticeChannel,
  type NoticeLang,
  type SaidAs,
} from './notice-choices.ts';

/**
 * What a person chose about being told, kept by agentwhy rather than by a hook's command line
 * (`specs/2026-09-21-the-agent-tells-you.md` R22-R25). Every field is optional: a file says what was chosen and
 * nothing about what was not, so a later version adding a choice does not rewrite anybody's answers.
 */
export interface NoticePreferences {
  readonly on?: AlertThreshold;
  readonly clean?: CleanMode;
  readonly notify?: readonly NoticeChannel[];
  /** How a value in the conversation is said: the line, or the session's own agent (R8). */
  readonly say?: SaidAs;
  /** The language the line in the conversation is written in (R29). Unset: the system's, then English. */
  readonly lang?: NoticeLang;
}

/**
 * The file: one set of choices for this person, and one per project that wanted its own. A project is named by its
 * directory, which is the only path this file holds - never a path inside one, never a value, never a session.
 */
export interface Preferences {
  readonly defaults: NoticePreferences;
  readonly projects: Readonly<Record<string, NoticePreferences>>;
}

export const NO_PREFERENCES: Preferences = { defaults: {}, projects: {} };

/** What a file that could not be read gives: the built-in answers, and a reason to say so once (R24). */
export type PreferencesRead = { readonly kind: 'read'; readonly preferences: Preferences } | { readonly kind: 'unusable' };

/**
 * A file this tool wrote, read back. Anything else is `unusable`: a preferences file is not a place to guess, and
 * the built-in answers are a better outcome than a threshold read out of a shape nobody recognised. A missing file
 * is not unusable - nobody has chosen anything yet, which is exactly what the built-in answers are for.
 */
export function readPreferences(text: string | undefined): PreferencesRead {
  if (text === undefined) return { kind: 'read', preferences: NO_PREFERENCES };
  const parsed = parseJsonObject(text);
  if (parsed === undefined) return { kind: 'unusable' };

  const defaults = choicesIn(parsed.defaults);
  const projects = isJsonObject(parsed.projects) ? parsed.projects : {};
  if (defaults === undefined || (parsed.projects !== undefined && !isJsonObject(parsed.projects))) return { kind: 'unusable' };

  const perProject: Record<string, NoticePreferences> = {};
  for (const [directory, chosen] of Object.entries(projects)) {
    const choices = choicesIn(chosen);
    if (choices === undefined) return { kind: 'unusable' };
    perProject[directory] = choices;
  }
  return { kind: 'read', preferences: { defaults, projects: perProject } };
}

/** The file as it is written: the same shape this reads, with the keys a version of this tool knows. */
export function writtenPreferences(preferences: Preferences): string {
  const projects = Object.fromEntries(
    Object.entries(preferences.projects)
      .filter(([, choices]) => Object.keys(choices).length > 0)
      .sort(([one], [other]) => one.localeCompare(other)),
  );
  return `${JSON.stringify({ defaults: preferences.defaults, projects }, undefined, 2)}\n`;
}

/**
 * The choices that apply where a session runs (R24): this project's, over this person's, over nothing at all. The
 * flags a hook's command line carries are applied after these, by the caller - someone who wrote a flag meant it.
 *
 * A project is matched by directory, and the longest match wins: a session's working directory may be a directory
 * inside the project the choice was made for, and a choice made for a project holds everywhere in it.
 */
export function preferencesFor(preferences: Preferences, directory: string | undefined): NoticePreferences {
  const project = directory === undefined ? undefined : longestMatch(preferences.projects, directory);
  return { ...preferences.defaults, ...(project ?? {}) };
}

/** The same choices with one project's answers replaced, for the writer. An empty set of answers takes it out. */
export function withProjectChoices(preferences: Preferences, directory: string, choices: NoticePreferences): Preferences {
  const { [directory]: _replaced, ...others } = preferences.projects;
  return {
    defaults: preferences.defaults,
    projects: Object.keys(choices).length === 0 ? others : { ...others, [directory]: choices },
  };
}

/**
 * The one project entry that governs a directory, the same way `preferencesFor` picks it: by the longest ancestor
 * match, never by an exact key alone. A directory inside a project a choice was made for is still inside it.
 */
export function longestMatch(projects: Readonly<Record<string, NoticePreferences>>, directory: string): NoticePreferences | undefined {
  const inside = Object.keys(projects)
    .filter((project) => directory === project || directory.startsWith(project.endsWith('/') ? project : `${project}/`))
    .sort((one, other) => other.length - one.length);
  return inside[0] === undefined ? undefined : projects[inside[0]];
}

/** One set of answers, or `undefined` where a key holds something this version does not recognise. */
function choicesIn(value: unknown): NoticePreferences | undefined {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return undefined;

  const chosen = value as JsonObject;
  const on = oneOf(chosen.on, ALERT_THRESHOLDS);
  const clean = oneOf(chosen.clean, CLEAN_MODES);
  const say = oneOf(chosen.say, SAID_AS);
  const notify = channelsIn(chosen.notify);
  const lang = oneOf(chosen.lang, NOTICE_LANGS);
  if (on === 'unknown' || clean === 'unknown' || say === 'unknown' || notify === 'unknown' || lang === 'unknown') return undefined;

  return {
    ...(on === undefined ? {} : { on }),
    ...(clean === undefined ? {} : { clean }),
    ...(say === undefined ? {} : { say }),
    ...(notify === undefined ? {} : { notify }),
    ...(lang === undefined ? {} : { lang }),
  };
}

function oneOf<T extends string>(value: unknown, known: readonly T[]): T | undefined | 'unknown' {
  if (value === undefined) return undefined;
  const found = known.find((candidate): candidate is T => candidate === value);
  return found ?? 'unknown';
}

function channelsIn(value: unknown): readonly NoticeChannel[] | undefined | 'unknown' {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) return 'unknown';
  const channels = value.map((name: unknown) => NOTICE_CHANNELS.find((channel) => channel === name));
  return channels.includes(undefined) ? 'unknown' : [...new Set(channels as NoticeChannel[])];
}
