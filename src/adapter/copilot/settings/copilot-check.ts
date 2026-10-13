// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { isPlainInvocation } from '../../../shared/plain-invocation.ts';
import { USER_HOOKS } from '../contract/hooks.ts';
import { absoluteInvocation, copilotInvocationIn, copilotRefuseIn } from './copilot-hooks.ts';

/**
 * Whether agentwhy's check runs in Copilot (`copilot-blocks-too` CB10, CBD9): `on` where `~/.copilot/hooks/agentwhy.json`
 * is agentwhy's own and the agentwhy it runs is there - its Node and script, looked at and never run, or agentwhy named in
 * plain words by a person's `--command`; `stale` where the file is agentwhy's and what it runs is gone, so every call
 * passes unchecked unless an `agentwhy` happens to be on Copilot's `PATH`; `absent` where there is no such file, or one
 * agentwhy did not write. Read, never assumed: a page says `on` only on `on`.
 */
export type CopilotCheckState = 'on' | 'stale' | 'absent';

export async function copilotCheckState(files: FileReader, directories: DirectoryReader, home: string): Promise<CopilotCheckState> {
  const file = parseJsonObject((await textOrUndefined(files, join(home, ...USER_HOOKS.folder, USER_HOOKS.file))) ?? '');
  const command = file === undefined ? undefined : copilotRefuseIn(file);
  if (command === undefined) return 'absent';
  const invoke = copilotInvocationIn(command);
  if (invoke === undefined) return 'stale';
  const paths = absoluteInvocation(invoke);
  if (paths === undefined) return isPlainInvocation(invoke) ? 'on' : 'stale';
  for (const path of [paths.node, paths.script]) {
    if ((await directories.kindOf(path).catch(() => undefined)) !== 'file') return 'stale';
  }
  return 'on';
}
