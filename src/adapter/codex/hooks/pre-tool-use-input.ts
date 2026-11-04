// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { posixReadingOfPowerShell } from '../../../core/access/powershell-line.ts';
import { startsAtDrive } from '../../../core/drive-path.ts';
import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';

/** Why an input could not be read. Named, so the notice can say the command was not checked. */
export type UnusableShellInput = 'not-json' | 'another-event' | 'field-missing';

/**
 * Reads the text a Codex `PreToolUse` hook was given (`codex-blocks-too` CK4): the command line of a shell call, and the
 * session's folder, which `refuse --codex` looks for the project from (CK3). A call to any tool but the shell is
 * `another-tool`, and passes. Never throws. The fields are Codex's own, measured (CKB2); that they are named as Claude
 * Code's are is an observation, not a shared definition.
 */
export function parseCodexPreToolUseInput(
  text: string,
): { readonly command: string; readonly written?: string; readonly cwd?: string; readonly transcriptPath?: string } | { readonly anotherTool: true } | { readonly unusable: UnusableShellInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };

  const { fields } = PRE_TOOL_USE;
  if (input[fields.event] !== PRE_TOOL_USE.event) return { unusable: 'another-event' };
  if (input[fields.toolName] !== PRE_TOOL_USE.shellTool) return { anotherTool: true };

  const toolInput = input[fields.toolInput];
  const given = isJsonObject(toolInput) ? toolInput[fields.command] : undefined;
  if (typeof given !== 'string') return { unusable: 'field-missing' };
  const cwd = input[fields.cwd];
  // `2026-10-12-powershell-on-windows.md` PW8 (PWB5): Codex on Windows hands its `Bash` tool a PowerShell line, which it
  // runs with `pwsh -Command`; read as bash, `Get-Content -LiteralPath .\secret.txt` named no file and a blocked one was
  // printed. Its folder at a drive says Codex ran on Windows; there the line is read as PowerShell, as PW1 reads Claude
  // Code's `PowerShell` tool. Anywhere else, as it was.
  const command = typeof cwd === 'string' && startsAtDrive(cwd) ? posixReadingOfPowerShell(given) : given;
  // RW15: the rollout, where the cell running the command names the folder it runs in - found by the line as Codex wrote
  // it there, which PW8's reading is not (PW11).
  const transcript = input[fields.transcriptPath];
  return {
    command,
    ...(command === given ? {} : { written: given }),
    ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
    ...(typeof transcript === 'string' && transcript !== '' ? { transcriptPath: transcript } : {}),
  };
}
