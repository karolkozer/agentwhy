// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The choices a notice can be given, in a module of their own so that both the code that says a notice and the code
 * that remembers what a person chose can name them without depending on each other.
 */
export const NOTICE_CHANNELS = ['chat', 'terminal', 'os'];
/**
 * What `--notify` uses when nobody says otherwise: the line in the conversation, and no pop-up. The other two
 * arrive the moment an agent finishes rather than at the end of the turn, which is worth having and worth asking
 * for; on a first run they are three notices for one finding.
 */
export const DEFAULT_CHANNELS = ['chat'];
export const CLEAN_MODES = ['off', 'once', 'every-turn'];
/**
 * What `--clean` does when nobody says otherwise. Silence is ambiguous - a hook that failed quietly reads exactly
 * like an agent that did nothing - and one line per session is what it costs to tell those apart.
 */
export const DEFAULT_CLEAN = 'once';
/**
 * What a quiet turn does for the computer's own `watch` (`protected-everywhere` GD23), where nobody has said
 * otherwise. The computer's hook runs in every folder a person works in, one nobody set up included, so the line that
 * costs one reply per project becomes a line in every conversation on the machine - said about folders nobody asked to
 * be reassured about. Off is the built-in answer there; what the computer is set up for still speaks, since a key,
 * private data and a stopped command are said whatever this is. A person who wants it says so in the computer's
 * Settings, and their answer wins over this.
 */
export const DEFAULT_CLEAN_EVERYWHERE = 'off';
export const SAID_AS = ['line', 'agent'];
/**
 * What a `value` does when nobody has said otherwise. B9a measured that the agent is continued and answers; B9d
 * measured eleven sessions of eleven relaying these words, never going back to the file and never repeating a
 * value. A grey line under a reply is read as a debug note; this is the finding that only rotating a key undoes.
 */
export const DEFAULT_SAID_AS = 'agent';
export const NOTICE_LANGS = ['en', 'pl', 'de'];
/** What a line is written in when nobody chose and the system says nothing this tool knows. */
export const DEFAULT_LANG = 'en';
/**
 * The language a system locale names - `pl_PL.UTF-8`, `de-DE` - when it is one a line is written in. `C` and `POSIX`
 * name none, and neither does a locale this tool has no words for.
 */
export function langOfLocale(locale) {
    const code = locale?.slice(0, 2).toLowerCase();
    return NOTICE_LANGS.find((lang) => lang === code);
}
