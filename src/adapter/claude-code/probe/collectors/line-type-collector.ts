import { byString } from '../../../../shared/compare.ts';
import { Counter, type Counts } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import { FIELDS } from '../../contract/fields.ts';
import { SYSTEM_LINE_TYPE, classifyLineType } from '../../contract/line-types.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class LineTypeCollector implements LineCollector {
  readonly #lineTypes = new Counter();
  readonly #unknownLineTypes = new Set<string>();
  readonly #systemSubtypes = new Counter();

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    const type = json[FIELDS.lineType];
    this.#lineTypes.add(toLabel(type));
    if (classifyLineType(type) === 'unknown') this.#unknownLineTypes.add(toLabel(type));
    if (type === SYSTEM_LINE_TYPE) this.#systemSubtypes.add(toLabel(json[FIELDS.systemSubtype]));
  }

  lineTypes(): Counts {
    return this.#lineTypes.toCounts();
  }

  unknownLineTypes(): string[] {
    return [...this.#unknownLineTypes].sort(byString);
  }

  systemSubtypes(): Counts {
    return this.#systemSubtypes.toCounts();
  }
}
