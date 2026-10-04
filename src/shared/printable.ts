// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Text from a file as a terminal may be shown it: every character a terminal obeys rather than draws, as a space. A
 * settings file, a transcript and a folder's name all arrive from outside this tool - a committed settings file and a
 * folder's name with a clone - so an escape sequence in one would be run: `\u001b[2K\u001b[1G` rewrites the line a person
 * reads to decide what to do next.
 *
 * The marks that turn the direction of text, and the separators that break a line, go too. Found by a review: they are
 * no control characters, so `Stop\u{202e}…` in a committed key showed the rest of its line reversed in the plan a person
 * reads before "Update it?". A second review found the title of a session and the name of a folder guarded by rules of
 * their own, or none, so there is one set of rules for every place. Letters of any script are left as they are.
 */
export function printable(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u{061c}\u{200e}\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}]/gu, ' ');
}

/**
 * One line of plain words, for a title drawn in a list: `printable`, with the spaces it leaves - a line break among them,
 * which would split one row in two - run together. Found by a review: a title guarded against control characters alone
 * reached the `sessions` chooser with a mark that turns the direction of text.
 */
export function oneLine(text: string): string {
  return printable(text)
    .split(' ')
    .filter((word) => word !== '')
    .join(' ');
}
