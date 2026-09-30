/** Somewhere to write text as it happens, for a command that runs more than one thing in a row. */
export interface Printer {
  write(text: string): void;
}
