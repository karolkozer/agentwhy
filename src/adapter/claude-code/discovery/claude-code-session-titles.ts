import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileTailReader } from '../../../ports/file-tail-reader.ts';
import { LAYOUT } from '../contract/layout.ts';
import { SESSION_TITLE } from '../contract/session-title.ts';
import { recognitionIn } from './transcript-tail.ts';

export interface SessionTitlesDependencies {
  readonly transcripts: FileTailReader;
  /** Only the free-text door: a title is whatever a model wrote from what the user typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
}

/**
 * Reads what a person recognises a session by from the end of its transcript, in one read: the title Claude Code gave
 * it, handed over only once it has passed the redactor, and which way into Claude Code it was held
 * (`.ai/specs/2026-09-27-which-project.md` V4). Nothing else in the transcript is looked at, and nothing is kept.
 */
export class ClaudeCodeSessionTitles implements SessionTitles {
  readonly #dependencies: SessionTitlesDependencies;

  constructor(dependencies: SessionTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const { transcripts, redactor } = this.#dependencies;

    let tail: string;
    try {
      tail = await transcripts.readTail(session.path + LAYOUT.transcriptSuffix, SESSION_TITLE.tailBytes);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return {};
    }

    return recognitionIn(tail, redactor);
  }
}
