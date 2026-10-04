// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FIELDS } from '../../contract/fields.ts';
import type { TranscriptStats } from '../doctor-report.ts';
import type { TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class SidechainCollector implements LineCollector {
  readonly #sidechain = { true: 0, false: 0, absent: 0, invalid: 0 };

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    const value = json[FIELDS.sidechain];
    if (value === true) this.#sidechain.true += 1;
    else if (value === false) this.#sidechain.false += 1;
    else if (value === undefined) this.#sidechain.absent += 1;
    else this.#sidechain.invalid += 1;
  }

  stats(): TranscriptStats['sidechain'] {
    return { ...this.#sidechain };
  }
}
