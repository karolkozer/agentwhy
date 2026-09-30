import { identifierMatches } from '../../contract/identifiers.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class IdentifierCollector implements LineCollector {
  readonly #toolUseIds = new Set<string>();
  readonly #uuids = new Set<string>();

  // Reads the raw text, so the identifiers on an unparsable line still count.
  collect({ raw }: TranscriptLine): void {
    const identifiers = identifierMatches(raw);
    for (const id of identifiers.toolUseIds) this.#toolUseIds.add(id);
    for (const id of identifiers.uuids) this.#uuids.add(id);
  }

  uniqueToolUseIds(): number {
    return this.#toolUseIds.size;
  }

  uniqueUuids(): number {
    return this.#uuids.size;
  }
}
