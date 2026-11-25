// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { ClaudeCodeSessionDiscovery } from '../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import { FileAlertStore } from '../../src/infrastructure/file-alert-store.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { NoticeWordsRenderer } from '../../src/report/watch/render/notice-words.ts';
import { SubagentWatch, type WatchResult } from '../../src/report/watch/subagent-watch.ts';
import { writeSession } from './synthetic-session.ts';

export interface OverlappingWatch {
  /**
   * One hook run over the session, a process of its own: nothing but the store's directory is shared with another.
   * `whileReading` happens in the middle of it - after it looked at what was said before, while it reads the session.
   */
  run(text: (transcript: string) => string, whileReading?: () => Promise<unknown>): Promise<WatchResult>;
  /** A `Stop` of the session, as B8b measured one. */
  readonly stop: (transcript: string) => string;
  readonly store: FileAlertStore;
}

/** Hook runs that overlap, as Claude Code starts them, over the store the shell uses. */
export async function overlappingWatch(t: TestContext, session: Record<string, string>, sessionId: string): Promise<OverlappingWatch> {
  const temporary = await mkdtemp(join(tmpdir(), 'agentwhy-overlap-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const transcript = join(await writeSession(t, session), `${sessionId}.jsonl`);
  const files = new NodeFileSystem();
  const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });
  const store = (): FileAlertStore => new FileAlertStore(temporary, process.getuid?.());

  return {
    store: store(),
    stop: (path) => JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, transcript_path: path, cwd: '/work/the-app', last_assistant_message: 'Done.' }),
    run: (text, whileReading) => new SubagentWatch({
      source: {
        read: async (path) => {
          await whileReading?.();
          return source.read(path);
        },
      },
      files,
      input: { readAll: async () => text(transcript) },
      createRedactor: (projectRoot) => new Redactor('test', projectRoot, false),
      words: (wayIn) => new NoticeWordsRenderer(wayIn),
      notifier: { notify: async () => true },
      home: '/Users/someone',
      preferencesPath: '/Users/someone/.config/agentwhy/notices.json',
      store: store(),
      invocation: { find: async () => 'agentwhy', version: async () => undefined },
    }).run({ on: 'value', channels: ['chat'], clean: 'off' }),
  };
}
