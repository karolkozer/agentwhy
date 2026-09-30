import { FIELDS } from '../../contract/fields.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class DeniedCallCollector implements LineCollector {
  #deniedCalls = 0;

  collect({ json }: TranscriptLine): void {
    if (json !== undefined && FIELDS.denialKind in json) this.#deniedCalls += 1;
  }

  deniedCalls(): number {
    return this.#deniedCalls;
  }
}
