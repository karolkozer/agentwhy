// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { autocomplete, isCancel } from '@clack/prompts';
import type { Choice, Chooser } from '../ports/chooser.ts';
import type { TerminalBanner } from './terminal-banner.ts';

/** Rows shown at once. The rest are reached by moving, or found by typing. */
const VISIBLE = 10;

/**
 * Chooses through `@clack/prompts`: a list that narrows as a person types, so a session is found by a word of its
 * title, its date or its id rather than by counting rows. It is the project's only runtime dependency, and this is
 * the only module allowed to import it (`2026-09-13-conventions.md`, Runtime dependencies).
 *
 * **Replaced a hand-written chooser on 2026-09-15**, after someone at a real terminal could not choose with it. The
 * failure did not reproduce in a pseudo-terminal, so this swaps in a widely used implementation; it does not fix a
 * cause that was found.
 */
export class ClackChooser implements Chooser {
  readonly #input: NodeJS.ReadStream;
  readonly #output: NodeJS.WriteStream;
  readonly #banner: TerminalBanner | undefined;

  /** `banner` is drawn above the first question of a command: it decides for itself whether it has been drawn already. */
  constructor(input: NodeJS.ReadStream, output: NodeJS.WriteStream, banner?: TerminalBanner) {
    this.#input = input;
    this.#output = output;
    this.#banner = banner;
  }

  async choose(heading: string, choices: readonly Choice[]): Promise<number | undefined> {
    if (choices.length === 0) return undefined;

    this.#banner?.drawOn(this.#output);

    const chosen = await autocomplete<number>({
      message: heading,
      options: choices.map((choice, position) => ({ value: position, label: choice.label, hint: choice.detail })),
      // The default filter also matches the value, which here is a row number: typing "2" would match row 2
      // whatever it says. What a person searches by is what they can see.
      filter: (search, option) => `${option.label ?? ''} ${option.hint ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      maxItems: VISIBLE,
      input: this.#input,
      output: this.#output,
    });

    // Escape and Ctrl-C cancel. Enter on a search that matches nothing resolves with no value, which is not a choice.
    return isCancel(chosen) || chosen === undefined ? undefined : chosen;
  }
}
