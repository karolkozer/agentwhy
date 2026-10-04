// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Counts } from '../../../shared/counter.ts';
import { AgentToolInputKeyCollector } from './collectors/agent-tool-input-key-collector.ts';
import { DenialKindCollector } from './collectors/denial-kind-collector.ts';
import type { LineCollector } from './collectors/line-collector.ts';
import { TaskNotificationCollector } from './collectors/task-notification-collector.ts';
import { ToolResultReferenceCollector } from './collectors/tool-result-reference-collector.ts';
import { ToolVersionCollector } from './collectors/tool-version-collector.ts';
import { WorkingDirectoryCollector } from './collectors/working-directory-collector.ts';
import type { DenialStats, TaskNotificationStats, ToolResultReferenceStats, WorkingDirectoryStats } from './doctor-report.ts';

/** Measurements that span the whole session: every transcript, main and subagents alike, feeds the same collectors. */
export class SessionTally {
  readonly #toolVersions = new ToolVersionCollector();
  readonly #agentToolInputKeys = new AgentToolInputKeyCollector();
  readonly #denialKinds = new DenialKindCollector();
  readonly #toolResultReferences = new ToolResultReferenceCollector();
  readonly #workingDirectories = new WorkingDirectoryCollector();
  readonly #taskNotifications = new TaskNotificationCollector();

  readonly collectors: readonly LineCollector[] = [
    this.#toolVersions,
    this.#agentToolInputKeys,
    this.#denialKinds,
    this.#toolResultReferences,
    this.#workingDirectories,
    this.#taskNotifications,
  ];

  toolVersions(): Counts {
    return this.#toolVersions.counts();
  }

  workingDirectories(): WorkingDirectoryStats {
    return this.#workingDirectories.stats();
  }

  agentToolInputKeys(): Counts {
    return this.#agentToolInputKeys.counts();
  }

  denials(): DenialStats {
    return this.#denialKinds.stats();
  }

  taskNotifications(): TaskNotificationStats {
    return this.#taskNotifications.stats();
  }

  toolResultReferences(availableFiles: readonly string[]): ToolResultReferenceStats {
    return this.#toolResultReferences.stats(availableFiles);
  }
}
