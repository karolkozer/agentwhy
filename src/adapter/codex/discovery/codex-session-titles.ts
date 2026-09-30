import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { oneLine } from '../../../shared/printable.ts';
import { ENVELOPE, LINE_TYPES } from '../contract/envelope.ts';
import { MESSAGE, RESPONSE_ITEMS, ROLES, TEXT_BLOCKS } from '../contract/messages.ts';
import { SESSION, THREAD_NAMES } from '../contract/session.ts';
import { RESPONSE_TURN } from '../contract/turns.ts';

export interface CodexSessionTitlesDependencies {
  readonly files: FileReader;
  /** When the names file last changed: a list drawn again reads it again only where it did (see `#current`). */
  readonly directories: Pick<DirectoryReader, 'modifiedAt'>;
  /** `~/.codex/session_index.jsonl` (`THREAD_NAMES`). */
  readonly path: string;
  /** Only the free-text door: a thread's name is whatever Codex wrote from what the person typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
}

/**
 * What a person recognises a Codex conversation by: the name Codex gave its thread and shows in its own list, from
 * `session_index.jsonl`, past the redactor. The file is read once, for the whole list; its last line for an id is the
 * name the thread has now, since a name given again is appended. Where `codex exec` wrote no name, its first prompt
 * follows a separate environment-context message in measured builds. That prompt can identify the conversation too.
 */
export class CodexSessionTitles implements SessionTitles {
  readonly #dependencies: CodexSessionTitlesDependencies;
  #names: Promise<ReadonlyMap<string, string>> | undefined;
  #readAt: number | undefined;

  constructor(dependencies: CodexSessionTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const indexed = (await this.#current()).get(session.id);
    if (indexed !== undefined) return { title: this.#dependencies.redactor.scan(indexed) };
    const prompt = await this.#execPrompt(session);
    if (prompt === undefined) return {};
    // Scan the entire prompt before shortening it: a cut secret might no longer match the redactor's pattern.
    const safe = this.#dependencies.redactor.scan(prompt);
    return { title: this.#dependencies.redactor.scan(Array.from(oneLine(safe)).slice(0, 160).join('')) };
  }

  /**
   * Measured on 21 local `exec` roots (0.155.0-alpha.16.3, 0.157.0, 0.159.2): the first user message is injected
   * context containing `<environment_context>`; the second, in the same turn, is one `input_text` prompt at line 9.
   * Stop near the start. An unfamiliar shape has no fallback title instead of guessing from a later message.
   */
  async #execPrompt(session: SessionSummary): Promise<string | undefined> {
    let lineNumber = 0;
    let contextTurn: string | undefined;
    try {
      for await (const raw of this.#dependencies.files.readLines(session.path)) {
        if (++lineNumber > 32) break;
        const line = parseJsonObject(raw);
        if (!isJsonObject(line)) return undefined;
        const payload = line[ENVELOPE.payload];
        if (!isJsonObject(payload)) return undefined;
        if (lineNumber === 1) {
          if (line[ENVELOPE.type] !== LINE_TYPES.sessionMeta || payload[SESSION.id] !== session.id ||
              payload[SESSION.source] !== 'exec' ||
              !['0.155.0-alpha.16.3', '0.157.0', '0.159.2'].includes(String(payload[SESSION.version]))) return undefined;
          continue;
        }
        if (line[ENVELOPE.type] !== LINE_TYPES.responseItem || payload[ENVELOPE.payloadType] !== RESPONSE_ITEMS.message ||
            payload[MESSAGE.role] !== ROLES.user) continue;
        const metadata = payload[RESPONSE_TURN.metadata];
        const turn = isJsonObject(metadata) ? metadata[RESPONSE_TURN.turnId] : undefined;
        const blocks = payload[MESSAGE.content];
        if (typeof turn !== 'string' || !Array.isArray(blocks)) return undefined;
        if (contextTurn === undefined) {
          if (!blocks.some((block) => {
            if (!isJsonObject(block) || block[MESSAGE.blockType] !== TEXT_BLOCKS.given) return false;
            const text = block[MESSAGE.blockText];
            return typeof text === 'string' && text.includes('<environment_context>');
          })) return undefined;
          contextTurn = turn;
          continue;
        }
        if (turn !== contextTurn || blocks.length !== 1 || !isJsonObject(blocks[0]) ||
            blocks[0][MESSAGE.blockType] !== TEXT_BLOCKS.given) return undefined;
        const prompt = blocks[0][MESSAGE.blockText];
        if (typeof prompt !== 'string') return undefined;
        const title = oneLine(prompt);
        return title === '' ? undefined : title;
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }
    return undefined;
  }

  /**
   * The names as the file holds them now. Codex names a thread a few seconds after it starts (§2.9: 14 s in the
   * maintainer's run), and a served page lists a conversation started since as it is drawn again - so the file is read
   * again whenever it changed, and once for every list where it did not. Found by the maintainer: read once per process,
   * a conversation started a moment before `start` kept "A conversation with no title" on every later drawing.
   */
  async #current(): Promise<ReadonlyMap<string, string>> {
    let at: number | undefined;
    try {
      at = await this.#dependencies.directories.modifiedAt(this.#dependencies.path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }
    if (this.#names === undefined || at !== this.#readAt) {
      this.#readAt = at;
      this.#names = this.#read();
    }
    return this.#names;
  }

  async #read(): Promise<ReadonlyMap<string, string>> {
    const names = new Map<string, string>();
    try {
      for await (const line of this.#dependencies.files.readLines(this.#dependencies.path)) {
        const record = parseJsonObject(line);
        if (!isJsonObject(record)) continue;
        const id = record[THREAD_NAMES.id];
        const name = record[THREAD_NAMES.name];
        if (typeof id !== 'string' || typeof name !== 'string') continue;
        const shown = oneLine(name);
        if (shown !== '') names.set(id, shown);
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
    }
    return names;
  }
}
