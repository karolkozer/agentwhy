import type { HookRefusal } from '../../adapter/codex/events/hook-refusals.ts';

/**
 * A continuation request, so the refusal is said in the conversation by Codex, in the user's language (CK13). Codex's
 * VS Code chat folds the hook's own words into the turn's collapsed steps, so the reply is the one place a person sees
 * agentwhy there: it is asked to lead with agentwhy's name. The person reads this request too - the VS Code chat shows
 * it as "Hook feedback" and the terminal as "Blocked by hook" (CKB14) - so it is three short sentences in the page's
 * words (guidelines §7): what happened, what to say, and what not to do. It gives no text to copy.
 */
export function codexStopInstruction(refusals: readonly HookRefusal[]): string {
  const paths = [...new Set(refusals.map((refusal) => refusal.path))];
  const named = paths.slice(0, 3).map((path) => JSON.stringify(path));
  if (paths.length > 3) named.push(`${paths.length - 3} more`);
  const listed = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`;
  const one = refusals.length === 1;
  const [files, them] = paths.length === 1 ? ['file', 'it'] : ['files', 'them'];
  return [
    `agentwhy stopped ${one ? 'a command' : 'commands'} that would have read the private ${files} ${listed}, so ${one ? 'it' : 'they'} did not run.`,
    `Say so to the user in one short message in their language, starting with **agentwhy**, and add that they can open the ${files} in their editor.`,
    `Don't read ${them} another way or ask for what's in ${them}.`,
  ].join(' ');
}
