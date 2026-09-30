import type { Provider, SessionFormats } from './session-format.ts';
import type { SessionModel } from './session-model.ts';
import type { SessionSource } from './session-source.ts';

/** A session read by the format that recognised it, or no format recognised the input and nothing read it (X2). */
export type SessionRead = { readonly kind: 'read'; readonly model: SessionModel } | { readonly kind: 'unknown-format' };

/** What `report` needs to read a session, whichever AI wrote it. */
export interface SessionReader {
  read(input: string): Promise<SessionRead>;
}

export interface FormatSelectingReaderDependencies {
  readonly formats: SessionFormats;
  /** One reader per format, keyed: a new format does not compile until its reader is registered. */
  readonly sources: Readonly<Record<Provider, SessionSource>>;
  /**
   * The format whose reader answers for an input no format could read to tell: Claude Code's says its main transcript is
   * missing, as it always did.
   */
  readonly whenUnavailable: Provider;
}

/**
 * Reads an input with the format its content names (`2026-09-27-what-codex-wrote.md` X2, XD7), through the registry
 * `doctor` uses. An input every format read and none recognised is read by none: it is never taken for the nearer one.
 */
export class FormatSelectingReader implements SessionReader {
  readonly #dependencies: FormatSelectingReaderDependencies;

  constructor(dependencies: FormatSelectingReaderDependencies) {
    this.#dependencies = dependencies;
  }

  async read(input: string): Promise<SessionRead> {
    const { formats, sources, whenUnavailable } = this.#dependencies;
    const selection = await formats.select(input);
    if (selection.kind === 'unknown') return { kind: 'unknown-format' };
    const provider = selection.kind === 'recognised' ? selection.provider : whenUnavailable;
    return { kind: 'read', model: await sources[provider].read(input) };
  }
}

/** A reader of one format alone, for a caller only that format concerns. */
export function readerOf(source: SessionSource): SessionReader {
  return { read: async (input) => ({ kind: 'read', model: await source.read(input) }) };
}
