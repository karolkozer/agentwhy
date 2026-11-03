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

/**
 * PowerShell's lines, before Windows Forms makes any window: this process draws at the screen's own scale. One that does
 * not say so is drawn at 100 % and stretched by the system - the file window came up blurred, its text pixelated, on a
 * screen scaled above 100 % (FNB45, Windows 11, 2026-10-14). Per monitor where Windows knows it (10, version 1703 on), the
 * whole screen's scale before that; where neither is known the window opens stretched, as before, never with an error.
 */
export const DRAWN_AT_SCALE: readonly string[] = [
  '  try {',
  "    Add-Type -Namespace AgentwhyWindow -Name Dpi -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value); [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();'",
  '    $sharp = $false',
  '    try { $sharp = [AgentwhyWindow.Dpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch { }',
  '    if (-not $sharp) { [void][AgentwhyWindow.Dpi]::SetProcessDPIAware() }',
  '  } catch { }',
];

/** The folder a window answered, with every link followed; one that is not there is said so. */
export async function chosenFolder(path: string): Promise<{ readonly chosen: string } | { readonly failed: string }> {
  try {
    return { chosen: await realpath(path) };
  } catch {
    return { failed: 'The folder chosen could not be found.' };
  }
}
