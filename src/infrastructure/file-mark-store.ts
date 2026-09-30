import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isMarkResult, type MarkReading, type MarkRecord, type MarkStore } from '../ports/mark-store.ts';

/**
 * A person's marks for one project, as JSON lines in their home directory (`worth-running-every-day` R33): outside every
 * repository, readable by that person only, appended to and never rewritten, so what was undone stays visible (R34).
 */
export class FileMarkStore implements MarkStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async read(): Promise<MarkReading> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      // Never marked is the ordinary answer; anything else is a record that exists and was not read.
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      return { records: [], skipped: 0, failed: !missing };
    }

    const records: MarkRecord[] = [];
    let skipped = 0;
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isRecord(parsed)) records.push(parsed);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return { records, skipped, failed: false };
  }

  async append(record: MarkRecord): Promise<boolean> {
    try {
      await mkdir(dirname(this.#file), { recursive: true, mode: 0o700 });
      await appendFile(this.#file, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}

/** Read from a file a person could have edited, so every field is checked: a line that does not hold is skipped. */
function isRecord(value: unknown): value is MarkRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || record.path === '' || typeof record.at !== 'number' || !Number.isFinite(record.at)) return false;
  if (record.kind === 'unmark') return true;
  return (
    record.kind === 'mark' &&
    typeof record.label === 'string' &&
    isMarkResult(record.result) &&
    (record.note === undefined || typeof record.note === 'string') &&
    Array.isArray(record.sessions) &&
    record.sessions.every((session) => typeof session === 'string')
  );
}
