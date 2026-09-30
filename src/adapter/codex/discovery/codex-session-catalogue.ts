import type { SessionCatalogue, SessionListing } from '../../../core/session-catalogue.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { conversationsIn } from './codex-conversations.ts';
import type { CodexSessionIndex } from './codex-session-index.ts';

export interface CodexSessionCatalogueDependencies {
  /** Lists the root once, and keeps it for the reader of what it listed. */
  readonly index: CodexSessionIndex;
  readonly directories: DirectoryReader;
  /** The supported sessions root (X1); `$CODEX_HOME` is not measured (XB6). */
  readonly sessionsRoot: string;
}

/**
 * A project's Codex conversations (X1, X4, X5): each conversation whose first line records the project's folder as its
 * `cwd`, exactly - Codex records the folder itself, where Claude Code's store encodes it. First lines only are read.
 */
export class CodexSessionCatalogue implements SessionCatalogue {
  readonly #dependencies: CodexSessionCatalogueDependencies;

  constructor(dependencies: CodexSessionCatalogueDependencies) {
    this.#dependencies = dependencies;
  }

  async list(workingDirectory: string): Promise<SessionListing> {
    const { index, directories, sessionsRoot } = this.#dependencies;
    const listing = await index.list(sessionsRoot);
    // The root itself missing or unreadable is "not looked at", never "no conversations".
    const found = !listing.gaps.some((gap) => gap.path === sessionsRoot);
    // Chosen by the first line before any file is looked at: only this project's conversations cost a look.
    const sessions = (await conversationsIn(listing, directories, (root) => root.header.project === workingDirectory))
      .map((conversation) => ({
        id: conversation.source.header.id,
        path: conversation.source.path,
        modifiedAt: conversation.modifiedAt,
        delegations: conversation.delegations,
        provider: 'codex' as const,
      }))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    return { directory: sessionsRoot, found, searched: [{ provider: 'codex', directory: sessionsRoot, found }], sessions };
  }
}
