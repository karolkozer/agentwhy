// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from '../../../../shared/compare.ts';
import { Counter } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import { FIELDS } from '../../contract/fields.ts';
import { classifyLineType } from '../../contract/line-types.ts';
import type { CountsByLabel } from '../doctor-report.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

/** Top-level keys per unknown line type, so a new type is classified from what it carries instead of guessed. */
export class UnknownLineTypeKeyCollector implements LineCollector {
  readonly #keysByType = new Map<string, Counter>();

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    const type = json[FIELDS.lineType];
    if (classifyLineType(type) !== 'unknown') return;

    const label = toLabel(type);
    const keys = this.#keysByType.get(label) ?? new Counter();
    this.#keysByType.set(label, keys);
    for (const key of Object.keys(json)) keys.add(toLabel(key));
  }

  keysByType(): CountsByLabel {
    return Object.fromEntries(
      [...this.#keysByType.entries()].sort(([a], [b]) => byString(a, b)).map(([type, keys]) => [type, keys.toCounts()]),
    );
  }
}
