import { isCancel, multiselect } from '@clack/prompts';
import type { MultiChoice, MultiChooser } from '../ports/multi-chooser.ts';
import type { TerminalBanner } from './terminal-banner.ts';

/**
 * A list with boxes, through `@clack/prompts` - the package the session chooser already uses, so no new dependency
 * (`2026-09-13-conventions.md`, Runtime dependencies). Answering with nothing ticked is an answer, not a cancellation:
 * "install none of this" is a thing a person may mean.
 */
export class ClackMultiChooser implements MultiChooser {
  readonly #input: NodeJS.ReadStream;
  readonly #output: NodeJS.WriteStream;
  readonly #banner: TerminalBanner | undefined;

  /** The banner is shared with the command's other prompts, so the mark is drawn once above the first of them. */
  constructor(input: NodeJS.ReadStream, output: NodeJS.WriteStream, banner?: TerminalBanner) {
    this.#input = input;
    this.#output = output;
    this.#banner = banner;
  }

  async chooseMany(heading: string, choices: readonly MultiChoice[]): Promise<readonly number[] | undefined> {
    this.#banner?.drawOn(this.#output);

    if (choices.length === 0) return [];

    const chosen = await multiselect<number>({
      message: heading,
      options: choices.map((choice, position) => ({ value: position, label: choice.label, hint: choice.detail })),
      initialValues: choices.flatMap((choice, position) => (choice.selected ? [position] : [])),
      required: false,
      input: this.#input,
      output: this.#output,
    });

    return isCancel(chosen) ? undefined : [...chosen].sort((a, b) => a - b);
  }
}
