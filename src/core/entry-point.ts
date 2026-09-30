/**
 * Which way into the agent a conversation was started by, in the words a person knows it by
 * (`.ai/specs/2026-09-27-which-project.md` V4): the terminal, a code editor, or a script. `unknown` is a way the
 * adapter recorded and does not know - counted, never named, and never read as the nearest known one.
 */
export type EntryPoint = 'terminal' | 'editor' | 'script' | 'unknown';
