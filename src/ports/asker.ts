/**
 * One line of text from the person at the terminal (`specs/2026-09-16-worth-running-every-day.md` R4c). What they type
 * is theirs: it is never shown back to a model, and the caller decides what a blank answer means.
 */
export interface Asker {
  /** What was typed, empty for a blank answer, or `undefined` when the person left without answering. */
  ask(question: string, placeholder?: string): Promise<string | undefined>;
}
