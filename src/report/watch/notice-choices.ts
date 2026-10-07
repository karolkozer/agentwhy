// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The choices a notice can be given, in a module of their own so that both the code that says a notice and the code
 * that remembers what a person chose can name them without depending on each other.
 */

/**
 * Where a notice is shown. `chat` is the line in the conversation itself, returned as a `systemMessage` when the
 * turn ends (`specs/2026-09-16-a-notice-in-the-conversation.md` B6a); `terminal` is a hook's `terminalSequence`,
 * which only the terminal interface shows; `os` is a system notification, outside any interface. None reaches the
 * model: B6b measured `chat` absent from its context, and the other two were never in it (B4f, D6).
 */
export type NoticeChannel = 'chat' | 'terminal' | 'os';

export const NOTICE_CHANNELS: readonly NoticeChannel[] = ['chat', 'terminal', 'os'];

/**
 * What `--notify` uses when nobody says otherwise: the line in the conversation, and no pop-up. The other two
 * arrive the moment an agent finishes rather than at the end of the turn, which is worth having and worth asking
 * for; on a first run they are three notices for one finding.
 */
export const DEFAULT_CHANNELS: readonly NoticeChannel[] = ['chat'];

/**
 * When a turn with nothing to report is said out loud (`the-agent-tells-you.md` R4). `off` is the silence this hook
 * has always kept; `once` says a session is being watched the first quiet turn, and then keeps quiet until something
 * happens; `every-turn` says it after every reply, for a person who wants to see the watch working.
 */
export type CleanMode = 'off' | 'once' | 'every-turn';

export const CLEAN_MODES: readonly CleanMode[] = ['off', 'once', 'every-turn'];

/**
 * What `--clean` does when nobody says otherwise. Silence is ambiguous - a hook that failed quietly reads exactly
 * like an agent that did nothing - and one line per session is what it costs to tell those apart.
 */
export const DEFAULT_CLEAN: CleanMode = 'once';

/**
 * What a quiet turn does for the computer's own `watch` (`protected-everywhere` GD23), where nobody has said
 * otherwise. The computer's hook runs in every folder a person works in, one nobody set up included, so the line that
 * costs one reply per project becomes a line in every conversation on the machine - said about folders nobody asked to
 * be reassured about. Off is the built-in answer there; what the computer is set up for still speaks, since a key,
 * private data and a stopped command are said whatever this is. A person who wants it says so in the computer's
 * Settings, and their answer wins over this.
 */
export const DEFAULT_CLEAN_EVERYWHERE: CleanMode = 'off';

/**
 * How a finding is said (`the-agent-tells-you.md` R8): as the grey line this hook has always returned, or by the
 * session's own agent, in a message of its own.
 *
 * It is asked only about the strongest level. R8 first wrote it per level, and the narrowing is R12b's: a session
 * checks a claim against its own context and argues with one that does not hold, so the agent speaks where the
 * evidence is strongest - a value from a protected file, in the conversation - and every other level stays a line.
 */
export type SaidAs = 'line' | 'agent';

export const SAID_AS: readonly SaidAs[] = ['line', 'agent'];

/**
 * What a `value` does when nobody has said otherwise. B9a measured that the agent is continued and answers; B9d
 * measured eleven sessions of eleven relaying these words, never going back to the file and never repeating a
 * value. A grey line under a reply is read as a debug note; this is the finding that only rotating a key undoes.
 */
export const DEFAULT_SAID_AS: SaidAs = 'agent';

/**
 * The language a line in the conversation is written in (`the-agent-tells-you.md` R29). The same three the page is
 * written in, so the line and the report say one thing in one language. Kept here rather than taken from the page's
 * own copy, so a hook run on every turn does not load every word the page has.
 */
export type NoticeLang = 'en' | 'pl' | 'de';

export const NOTICE_LANGS: readonly NoticeLang[] = ['en', 'pl', 'de'];

/** What a line is written in when nobody chose and the system says nothing this tool knows. */
export const DEFAULT_LANG: NoticeLang = 'en';

/**
 * The language a system locale names - `pl_PL.UTF-8`, `de-DE` - when it is one a line is written in. `C` and `POSIX`
 * name none, and neither does a locale this tool has no words for.
 */
export function langOfLocale(locale: string | undefined): NoticeLang | undefined {
  const code = locale?.slice(0, 2).toLowerCase();
  return NOTICE_LANGS.find((lang) => lang === code);
}
