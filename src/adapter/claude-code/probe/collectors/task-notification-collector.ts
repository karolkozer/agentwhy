import { AGENT_TOOL, FIELDS } from '../../contract/fields.ts';
import { USER_LINE_TYPE } from '../../contract/line-types.ts';
import { notificationsIn } from '../../contract/task-notifications.ts';
import type { TaskNotificationStats } from '../doctor-report.ts';
import { toolUseBlocks, wordsWithoutResult, type TranscriptLine } from '../transcript-line.ts';
import type { LineCollector } from './line-collector.ts';

/**
 * Notifications delivered on a user line, by what they name (`specs/2026-09-15-where-the-value-went.md` R4): a
 * delegating call, another call, a call no transcript of the session holds, or nothing. Only the first is read as a
 * report, so the rest are counted here rather than lost. Fed every transcript, because a notification and the call it
 * names need not sit in the same one.
 */
export class TaskNotificationCollector implements LineCollector {
  readonly #calls = new Set<string>();
  readonly #delegatingCalls = new Set<string>();
  readonly #named: (string | undefined)[] = [];

  collect({ json }: TranscriptLine): void {
    if (json === undefined) return;
    for (const block of toolUseBlocks(json)) {
      const id = block[FIELDS.blockId];
      if (typeof id !== 'string') continue;
      this.#calls.add(id);
      if (block[FIELDS.toolName] === AGENT_TOOL.name) this.#delegatingCalls.add(id);
    }

    if (json[FIELDS.lineType] !== USER_LINE_TYPE) return;
    const words = wordsWithoutResult(json);
    if (words === undefined) return;
    for (const { callId } of notificationsIn(words)) this.#named.push(callId);
  }

  stats(): TaskNotificationStats {
    let namingADelegation = 0;
    let namingAnotherCall = 0;
    let namingNoCall = 0;
    let withoutCallId = 0;
    for (const callId of this.#named) {
      if (callId === undefined) withoutCallId += 1;
      else if (this.#delegatingCalls.has(callId)) namingADelegation += 1;
      else if (this.#calls.has(callId)) namingAnotherCall += 1;
      else namingNoCall += 1;
    }
    return { delivered: this.#named.length, namingADelegation, namingAnotherCall, namingNoCall, withoutCallId };
  }
}
