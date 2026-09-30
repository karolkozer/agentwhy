import { Counter } from '../../../shared/counter.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { toLabel } from '../../../shared/label.ts';
import { META_FIELD } from '../contract/fields.ts';
import type { MetaStats } from './doctor-report.ts';

/** Statistics over the meta.json files of a session's subagents. */
export class MetaTally {
  #files = 0;
  #unreadableFiles = 0;
  #unparsableFiles = 0;
  readonly #keys = new Counter();
  readonly #agentType = new Counter();
  readonly #spawnDepth = new Counter();
  readonly #requestShape = new Counter();

  recordUnreadableFile(): void {
    this.#files += 1;
    this.#unreadableFiles += 1;
  }

  recordFile(text: string): void {
    this.#files += 1;
    const meta = parseJsonObject(text);
    if (meta === undefined) {
      this.#unparsableFiles += 1;
      return;
    }

    for (const key of Object.keys(meta)) this.#keys.add(toLabel(key));
    this.#agentType.add(toLabel(meta[META_FIELD.agentType]));
    this.#spawnDepth.add(toLabel(meta[META_FIELD.spawnDepth]));
    this.#requestShape.add(toLabel(meta[META_FIELD.requestShape]));
  }

  toStats(): MetaStats {
    return {
      files: this.#files,
      unreadableFiles: this.#unreadableFiles,
      unparsableFiles: this.#unparsableFiles,
      keys: this.#keys.toCounts(),
      agentType: this.#agentType.toCounts(),
      spawnDepth: this.#spawnDepth.toCounts(),
      requestShape: this.#requestShape.toCounts(),
    };
  }
}
