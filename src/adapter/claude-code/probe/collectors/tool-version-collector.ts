// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter, type Counts } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import { FIELDS } from '../../contract/fields.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class ToolVersionCollector implements LineCollector {
  readonly #versions = new Counter();

  collect({ json }: TranscriptLine): void {
    const version = json?.[FIELDS.toolVersion];
    if (version !== undefined) this.#versions.add(toLabel(version));
  }

  counts(): Counts {
    return this.#versions.toCounts();
  }
}
