import { isCancel, text } from '@clack/prompts';
import type { Asker } from '../ports/asker.ts';
import type { TerminalBanner } from './terminal-banner.ts';

/** One line of text, through `@clack/prompts`. A blank answer comes back as an empty string, never as a cancellation. */
export class ClackAsker implements Asker {
  readonly #input: NodeJS.ReadStream;
  readonly #output: NodeJS.WriteStream;
  readonly #banner: TerminalBanner | undefined;

  /** The banner is shared with the command's other prompts, so the mark is drawn once above the first of them. */
  constructor(input: NodeJS.ReadStream, output: NodeJS.WriteStream, banner?: TerminalBanner) {
    this.#input = input;
    this.#output = output;
    this.#banner = banner;
  }

  async ask(question: string, placeholder?: string): Promise<string | undefined> {
    this.#banner?.drawOn(this.#output);

    const answer = await text({
      message: question,
      ...(placeholder === undefined ? {} : { placeholder }),
      defaultValue: '',
      input: this.#input,
      output: this.#output,
    });

    return isCancel(answer) ? undefined : answer;
  }
}
