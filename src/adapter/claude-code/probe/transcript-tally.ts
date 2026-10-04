// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseJsonObject } from '../../../shared/json.ts';
import { DeniedCallCollector } from './collectors/denied-call-collector.ts';
import { IdentifierCollector } from './collectors/identifier-collector.ts';
import type { LineCollector } from './collectors/line-collector.ts';
import { LineTypeCollector } from './collectors/line-type-collector.ts';
import { SidechainCollector } from './collectors/sidechain-collector.ts';
import { ToolUseCollector } from './collectors/tool-use-collector.ts';
import { TopLevelKeyCollector } from './collectors/top-level-key-collector.ts';
import { UnknownLineTypeKeyCollector } from './collectors/unknown-line-type-key-collector.ts';
import type { TranscriptStats } from './doctor-report.ts';

/**
 * Statistics for one group of transcripts (main session or subagents). Composed of collectors: its own, which
 * measure this group, and the session's, which measure across groups.
 */
export class TranscriptTally {
  #files = 0;
  #unreadableFiles = 0;
  #lines = 0;
  #unparsableLines = 0;
  readonly #identifiers = new IdentifierCollector();
  readonly #topLevelKeys = new TopLevelKeyCollector();
  readonly #lineTypes = new LineTypeCollector();
  readonly #unknownLineTypeKeys = new UnknownLineTypeKeyCollector();
  readonly #sidechain = new SidechainCollector();
  readonly #toolUses = new ToolUseCollector();
  readonly #deniedCalls = new DeniedCallCollector();
  readonly #collectors: readonly LineCollector[];

  constructor(sessionCollectors: readonly LineCollector[]) {
    this.#collectors = [
      this.#identifiers,
      this.#topLevelKeys,
      this.#lineTypes,
      this.#unknownLineTypeKeys,
      this.#sidechain,
      this.#toolUses,
      this.#deniedCalls,
      ...sessionCollectors,
    ];
  }

  recordFile(): void {
    this.#files += 1;
  }

  recordUnreadableFile(): void {
    this.#unreadableFiles += 1;
  }

  recordLine(raw: string): void {
    if (raw.trim() === '') return;
    this.#lines += 1;

    const json = parseJsonObject(raw);
    if (json === undefined) this.#unparsableLines += 1;

    const line = { raw, json };
    for (const collector of this.#collectors) collector.collect(line);
  }

  toStats(): TranscriptStats {
    return {
      files: this.#files,
      unreadableFiles: this.#unreadableFiles,
      lines: this.#lines,
      unparsableLines: this.#unparsableLines,
      lineTypes: this.#lineTypes.lineTypes(),
      unknownLineTypes: this.#lineTypes.unknownLineTypes(),
      unknownLineTypeKeys: this.#unknownLineTypeKeys.keysByType(),
      topLevelKeys: this.#topLevelKeys.counts(),
      sidechain: this.#sidechain.stats(),
      systemSubtypes: this.#lineTypes.systemSubtypes(),
      tools: this.#toolUses.tools(),
      agentToolUses: this.#toolUses.agentToolUses(),
      deniedCalls: this.#deniedCalls.deniedCalls(),
      uniqueToolUseIds: this.#identifiers.uniqueToolUseIds(),
      uniqueUuids: this.#identifiers.uniqueUuids(),
    };
  }
}
