import type { Redacted } from '../../../core/redaction/redacted.ts';

/**
 * What the session's own agent is asked to say, when a finding is set to be said by it
 * (`specs/2026-09-21-the-agent-tells-you.md` §5, R12, R12a, R12b). These are the words eleven sessions of eleven
 * relayed, and they are the third version: the two before them were refused, and for reasons worth keeping in view.
 *
 * - **It is agentwhy's finding, passed on as agentwhy's.** The first version told the agent to assert it in its own
 *   voice, and a session refused: it was being told to state as fact something it could not check.
 * - **Nothing is forbidden but going back to the file.** That same version forbade the agent to confirm anything,
 *   which - together with the claim above - is what an injection asks for, and was named as such.
 * - **No link.** A version carrying a `file://` address to a page outside the project lost the agent on that alone
 *   (B9g), so the offer is a command, named as what it is.
 * - **Only what the records establish.** A session handed a claim that did not match its own context refused it and
 *   said so to the person (R12b). The consequence is worded as what the records show - the conversation and the
 *   session's own files - and not as a fact about a provider's infrastructure.
 */
export function instructionFor(files: readonly Redacted[], command: string): string {
  const named = files.slice(0, NAMED_AT_MOST);
  const rest = files.length - named.length;
  const which = named.length === 0
    ? 'a protected file'
    : `the protected ${named.length === 1 ? 'file' : 'files'} ${list(named)}${rest === 0 ? '' : ` and ${rest} more`}`;
  // What the agent is asked not to do is said about the same files it was just told about, in the same words.
  const them = named.length <= 1 ? 'it' : 'them';

  return [
    `agentwhy, the local tool this user runs, checked this turn: a value from ${which} is in this conversation.`,
    'Tell the user, in one short message in the language of this conversation, that agentwhy found this, what it',
    'means - the value went wherever this conversation goes and stays in the session records kept on this machine,',
    'so deleting messages does not recall it - and that rotating that credential where it was issued is what undoes',
    `it. You read ${named.length === 0 ? 'it' : which} in this conversation, so you can see the finding yourself.`,
    `Do not open or read ${them} again, and do not repeat the value.`,
    `Then ask whether to open agentwhy's report for this session, and run \`${command}\` only if they say yes.`,
    'Do not continue the earlier task in this message.',
  ].join(' ');
}

/**
 * How many files the instruction names before it counts the rest. Three keeps it inside what a person reads in one
 * go - and the person reads it too, framed as `Stop hook error:` in the terminal (B9a, R12a).
 */
const NAMED_AT_MOST = 3;

/**
 * The command the agent offers to run: this session by its id, and nothing of what the report holds (R18, R19), with
 * agentwhy invoked the way the hook invokes it.
 */
export function reportCommand(sessionId: string, invocation: string): string {
  return `${invocation} report --input ${sessionId} --open --quiet`;
}

function list(files: readonly Redacted[]): string {
  const [one, two, three] = files;
  if (three !== undefined) return `${one}, ${two} and ${three}`;
  if (two !== undefined) return `${one} and ${two}`;
  return String(one);
}
