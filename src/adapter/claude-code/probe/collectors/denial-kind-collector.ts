import { byString } from '../../../../shared/compare.ts';
import { Counter } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import { isKnownDenialKind } from '../../contract/denials.ts';
import { FIELDS } from '../../contract/fields.ts';
import type { DenialStats } from '../doctor-report.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class DenialKindCollector implements LineCollector {
  readonly #kinds = new Counter();
  readonly #unknownKinds = new Set<string>();

  collect({ json }: TranscriptLine): void {
    if (json === undefined || !(FIELDS.denialKind in json)) return;
    const kind = json[FIELDS.denialKind];
    this.#kinds.add(toLabel(kind));
    if (!isKnownDenialKind(kind)) this.#unknownKinds.add(toLabel(kind));
  }

  stats(): DenialStats {
    return { byKind: this.#kinds.toCounts(), unknownKinds: [...this.#unknownKinds].sort(byString) };
  }
}
