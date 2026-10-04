// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter, type Counts } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class TopLevelKeyCollector implements LineCollector {
  readonly #keys = new Counter();

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    for (const key of Object.keys(json)) this.#keys.add(toLabel(key));
  }

  counts(): Counts {
    return this.#keys.toCounts();
  }
}
