/**
 * Where a project's sessions live: `~/.claude/projects/<encoded working directory>/`.
 *
 * The encoding replaces **every run of non-alphanumeric characters** with a single hyphen, not only the path
 * separators. Corrected on 2026-09-14 by the first real use outside this repository: a project under
 * `…/Web Portal/…` is stored as `…-Web-Portal-…`, and a rule that only replaced separators looked in a
 * directory that does not exist and reported "no sessions" for a project with plenty.
 *
 * The rule is still inferred from examples, so it is not trusted on its own: `matches` lets a caller compare an
 * existing directory name against a working directory, and the catalogue falls back to scanning. An encoding
 * we have not seen costs a slower lookup, not a wrong answer.
 */
export const PROJECTS_DIRECTORY = ['.claude', 'projects'] as const;

export function projectDirectoryName(workingDirectory: string): string {
  return normalise(workingDirectory);
}

/** Whether this stored directory is the one for that working directory, whatever else the encoder did to it. */
export function matchesProject(directoryName: string, workingDirectory: string): boolean {
  return normalise(directoryName) === normalise(workingDirectory);
}

function normalise(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, '-');
}
