// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter, type Counts } from '../../../../shared/counter.ts';
import { isJsonObject } from '../../../../shared/json.ts';
import { toLabel } from '../../../../shared/label.ts';
import { AGENT_TOOL, FIELDS } from '../../contract/fields.ts';
import { toolUseBlocks, type TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class AgentToolInputKeyCollector implements LineCollector {
  readonly #keys = new Counter();

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    for (const block of toolUseBlocks(json)) {
      if (block[FIELDS.toolName] !== AGENT_TOOL.name) continue;
      const input = block[FIELDS.toolInput];
      if (isJsonObject(input)) {
        for (const key of Object.keys(input)) this.#keys.add(toLabel(key));
      }
    }
  }

  counts(): Counts {
    return this.#keys.toCounts();
  }
}
