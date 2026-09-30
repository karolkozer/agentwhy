/**
 * How a hook written now should run agentwhy, judged from how this process runs (`a-hook-runs-what-you-ran.md` J2):
 * `agentwhy`, or `npx @agentwhy/cli@<version>` (`nothing-updates-by-itself.md` U1).
 */
export interface AgentwhyInvocation {
  /** Never throws: whatever cannot be looked at gives the form that works wherever `npx` does (J3). */
  find(): Promise<string>;
  /** The version of the agentwhy this process runs, as its `package.json` says; `undefined` where it cannot be read. */
  version(): Promise<string | undefined>;
}
