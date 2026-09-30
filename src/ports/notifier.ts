/** A notice put in front of a person by the operating system, outside any program's own window. */
export interface Notifier {
  /** Whether the system accepted it. Never throws: a notice that could not be shown is an answer. */
  notify(title: string, text: string): Promise<boolean>;
}
