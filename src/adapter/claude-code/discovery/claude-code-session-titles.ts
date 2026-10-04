// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileTailReader } from '../../../ports/file-tail-reader.ts';
import { LAYOUT } from '../contract/layout.ts';
import { SESSION_TITLE } from '../contract/session-title.ts';
import type { ClaudeDesktopTitles } from './claude-desktop-titles.ts';
import { recognitionIn } from './transcript-tail.ts';

export interface SessionTitlesDependencies {
  readonly transcripts: FileTailReader;
  /** Only the free-text door: a title is whatever a model wrote from what the user typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
  /**
   * The Claude desktop app's own names, where the platform has them (`claude-desktop-conversations.md` CD2): the app
   * writes no `ai-title`, so a transcript without one is titled by the app's file for it. Raw until scanned here.
   */
  readonly desktop?: Pick<ClaudeDesktopTitles, 'titleOf'>;
}

/** What one transcript's tail said, kept by `modifiedAt` so an unchanged transcript is never read twice (CD5). */
interface KeptRecognition {
  readonly modifiedAt: number;
  readonly recognition: SessionRecognition;
}

/**
 * Reads what a person recognises a session by from the end of its transcript, in one read: the title Claude Code gave
 * it, handed over only once it has passed the redactor, and which way into Claude Code it was held
 * (`.ai/specs/2026-09-27-which-project.md` V4). Nothing else in the transcript is looked at, and nothing but the tail's
 * answer is kept. A session the desktop app held has no `ai-title`: its title is the app's own, read the same way a
 * Codex thread's name is (CD2) - so a row with no title can be asked again at the cost of a look at the app's folder,
 * never another read of an unchanged transcript (CD5).
 */
export class ClaudeCodeSessionTitles implements SessionTitles {
  readonly #dependencies: SessionTitlesDependencies;
  /** By the session's path: what its tail said when it was last this old. */
  readonly #known = new Map<string, KeptRecognition>();

  constructor(dependencies: SessionTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const { redactor, desktop } = this.#dependencies;

    const kept = this.#known.get(session.path);
    let fromTail: SessionRecognition;
    if (kept !== undefined && kept.modifiedAt === session.modifiedAt) {
      fromTail = kept.recognition;
    } else {
      const tail = await this.#tail(session.path + LAYOUT.transcriptSuffix);
      // A transcript that is missing or unreadable is recognised by nothing, and nothing is kept: the next ask tries it.
      if (tail === undefined) return {};
      fromTail = recognitionIn(tail, redactor);
      this.#known.set(session.path, { modifiedAt: session.modifiedAt, recognition: fromTail });
    }

    if (fromTail.title !== undefined || desktop === undefined) return fromTail;
    const named = await desktop.titleOf(session.id);
    if (named === undefined) return fromTail;
    return { ...fromTail, title: redactor.scan(named) };
  }

  async #tail(path: string): Promise<string | undefined> {
    try {
      return await this.#dependencies.transcripts.readTail(path, SESSION_TITLE.tailBytes);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return undefined;
    }
  }
}
