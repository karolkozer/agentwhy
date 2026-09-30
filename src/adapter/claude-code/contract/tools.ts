/**
 * Where each tool says what it addresses, and what its result is.
 *
 * Measured need, not taste: matching every string of a call against the policy reported 316 touches of a
 * protected path in the measured session, where the honest number is far smaller. The text of a file being
 * written, a document being read, a web search - all mention `.env` without anything being opened. A path
 * counts when it sits in the position that **names the target**, and which position that is belongs to the
 * tool. That knowledge is format knowledge, so it lives here.
 */
export type ResultShape =
  /** The result enumerates things the tool reached: search hits, a directory listing. A path here was touched. */
  | 'listing'
  /** The result is the content of the one thing the call addressed. A path inside it is a mention. */
  | 'content'
  /** The result says whether the call worked, and names nothing. */
  | 'none';

export interface ToolProfile {
  /** Input keys whose value is the path the call addresses. */
  readonly pathKeys: readonly string[];
  /** Input keys whose value is a command line, which may name paths among its arguments. */
  readonly commandKeys: readonly string[];
  /** For a tool this contract does not know: search the whole input, and treat the result as a listing. */
  readonly searchWholeInput: boolean;
  readonly result: ResultShape;
  /**
   * Present for a tool that writes a file: the input keys holding text the call takes out of the file rather than puts
   * in (`specs/2026-09-15-where-the-value-went.md` R7). A value only there was in the file already.
   */
  readonly writes?: { readonly removedTextKeys: readonly string[] };
}

function profile(
  pathKeys: readonly string[],
  commandKeys: readonly string[],
  result: ResultShape,
  writes?: ToolProfile['writes'],
): ToolProfile {
  return { pathKeys, commandKeys, searchWholeInput: false, result, ...(writes === undefined ? {} : { writes }) };
}

export const TOOL_PROFILES: Readonly<Record<string, ToolProfile>> = {
  Read: profile(['file_path'], [], 'content'),
  Edit: profile(['file_path'], [], 'none', { removedTextKeys: ['old_string'] }),
  Write: profile(['file_path'], [], 'none', { removedTextKeys: [] }),
  NotebookEdit: profile(['notebook_path'], [], 'none'),
  Bash: profile([], ['command'], 'listing'),
  Grep: profile(['path'], [], 'listing'),
  Glob: profile(['path'], [], 'listing'),
  Agent: profile([], [], 'none'),
  Skill: profile([], [], 'none'),
  ToolSearch: profile([], [], 'none'),
  WebFetch: profile([], [], 'none'),
  WebSearch: profile([], [], 'none'),
};

/**
 * An unknown tool is treated as the noisiest possibility rather than passed over: everything it was given may
 * name a target, and its result may enumerate what it reached. Callers are told the tool was not recognised, so
 * a report can say so instead of presenting the guess as knowledge.
 */
export const UNKNOWN_TOOL: ToolProfile = { pathKeys: [], commandKeys: [], searchWholeInput: true, result: 'listing' };

export function profileOf(toolName: string): { readonly profile: ToolProfile; readonly known: boolean } {
  // `Object.hasOwn`, because a tool named `toString` or `constructor` would otherwise find something on the
  // prototype, report itself as known, and hand back a profile with no keys at all.
  if (!Object.hasOwn(TOOL_PROFILES, toolName)) return { profile: UNKNOWN_TOOL, known: false };

  const profile = TOOL_PROFILES[toolName];
  return profile === undefined ? { profile: UNKNOWN_TOOL, known: false } : { profile, known: true };
}

/**
 * The Grep tool prints the lines it matched only when its input asks for them; by default it prints file names
 * (`search-hits-are-reads` H1). Measured on the maintainer's transcripts of 2026-09-24: no call of it at all - every
 * search there went through the shell - so this is written from the tool's documented input, not from a record.
 */
export const GREP_TOOL = { name: 'Grep', outputModeKey: 'output_mode', contentMode: 'content' } as const;
