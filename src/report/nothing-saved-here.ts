// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * What `start`, `sessions` and `check` say where no AI's store of conversations is there at all
 * (`.ai/specs/2026-09-16-worth-running-every-day.md` R28, amended 2026-10-01). Two things look the same from here: a
 * computer the AI has not been used on yet, and an AI app's sandbox or virtual machine, measured twice that day, where
 * "not used yet" was false. Each is said with its own way forward - R28's for the first, `init` among it, and a terminal on
 * the person's own computer for the second - since nothing a run sees tells them apart.
 */
export function nothingSavedHere(agents: string, where: string, notUsedYet: string): string {
  return `No ${agents} conversations are saved where agentwhy looked: ${where}\n` +
    `Either ${agents} ${agents.includes(' or ') ? 'have' : 'has'} not been used on this computer yet, or agentwhy is running somewhere they are not ` +
    `saved: an AI app's sandbox or a virtual machine runs commands apart from your computer.\n` +
    `Not used yet: ${notUsedYet}\n` +
    `Running elsewhere: run agentwhy in a terminal on your own computer, in your project's folder.\n`;
}
