import { HOOK_OUTPUT, TERMINAL } from '../contract/hooks.ts';

/** C0 and C1 control characters, and DEL: any of them in the words would take the sequence outside the allowlist. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * A hook's stdout carrying a terminal notification with these words, or nothing for no words
 * (`specs/2026-09-16-when-an-agent-finishes.md` R15). Control characters are replaced before the words go in, since
 * Claude Code ignores the field whole when the sequence leaves the allowlist; `;` is kept out of the title, where
 * OSC 777 reads it as the end of the title.
 */
export function terminalNotice(title: string, text: string): string {
  if (text === '') return '';

  const body = text.replace(CONTROL, ' ');
  const heading = title.replace(CONTROL, ' ').replaceAll(';', ' ');
  const { osc, bel, notify, notifyWithTitle } = TERMINAL;
  const sequence = `${osc}${notify};${heading}: ${body}${bel}${osc}${notifyWithTitle};${heading};${body}${bel}`;
  return JSON.stringify({ [HOOK_OUTPUT.terminalSequence]: sequence });
}

/**
 * A hook's stdout carrying a `systemMessage` with these words, or nothing for no words
 * (`specs/2026-09-16-a-notice-in-the-conversation.md` R4). Only `Stop` shows it — B6a measured it rendered under the
 * assistant's reply as `Stop says: …`, and B4d and B4f measured `SubagentStop` discarding it — so the event that
 * returns this is decided by the caller. Control characters go, as they do in a terminal sequence.
 */
export function chatNotice(text: string): string {
  return text === '' ? '' : JSON.stringify({ [HOOK_OUTPUT.systemMessage]: text.replace(CONTROL, ' ') });
}

/**
 * A hook's stdout keeping the turn from ending, so that the session's own agent says the finding itself
 * (`specs/2026-09-21-the-agent-tells-you.md` R9, R11). The exit code stays 0: this is the JSON form of the same
 * control, and exit 2 is what R2 of `a-notice-in-the-conversation` forbids for good.
 *
 * The line goes out beside it, because B9b measured both shown and R11 keeps it: the line is agentwhy's own
 * record of what it found, in words the agent's message cannot soften.
 */
export function blockNotice(reason: string, text: string): string {
  return JSON.stringify({
    [HOOK_OUTPUT.decision]: HOOK_OUTPUT.block,
    [HOOK_OUTPUT.reason]: reason.replace(CONTROL, ' '),
    ...(text === '' ? {} : { [HOOK_OUTPUT.systemMessage]: text.replace(CONTROL, ' ') }),
  });
}
