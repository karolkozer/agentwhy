// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter, type Counts } from '../../../../shared/counter.ts';
import { toLabel } from '../../../../shared/label.ts';
import { AGENT_TOOL, FIELDS } from '../../contract/fields.ts';
import { toolUseBlocks, type TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

export class ToolUseCollector implements LineCollector {
  readonly #tools = new Counter();
  #agentToolUses = 0;

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    for (const block of toolUseBlocks(json)) {
      const name = block[FIELDS.toolName];
      this.#tools.add(toLabel(name));
      if (name === AGENT_TOOL.name) this.#agentToolUses += 1;
    }
  }

  tools(): Counts {
    return this.#tools.toCounts();
  }

  agentToolUses(): number {
    return this.#agentToolUses;
  }
}
