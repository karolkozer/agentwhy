// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';

/** What a program answered: its exit code, and what it wrote. */
export interface ProgramAnswer {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** How a folder window's program is run with these arguments. Replaced in a test, never the real window. */
export type RunScript = (args: readonly string[]) => Promise<ProgramAnswer>;

/**
 * Runs `program` with `args` and no shell, its own console window hidden where the system would draw one (Windows); a
 * window the program opens is still shown. A program that exits with a code answers it; one that could not start rejects.
 */
export function runProgram(program: string, args: readonly string[]): Promise<ProgramAnswer> {
  return new Promise((resolve, reject) => {
    execFile(program, [...args], { windowsHide: true }, (error, stdout, stderr) => {
      if (error !== null && typeof error.code !== 'number') {
        reject(error);
        return;
      }
      resolve({ code: error === null ? 0 : Number(error.code), stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** The folder a window answered, with every link followed; one that is not there is said so. */
export async function chosenFolder(path: string): Promise<{ readonly chosen: string } | { readonly failed: string }> {
  try {
    return { chosen: await realpath(path) };
  } catch {
    return { failed: 'The folder chosen could not be found.' };
  }
}
