import type { AccessFailure } from '../../../ports/file-access-error.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { THREAD_SPAWN } from '../contract/delegations.ts';
import { REVIEWER } from '../contract/reviews.ts';
import { HISTORY_MODES, SESSION, type HistoryMode } from '../contract/session.ts';

export type ParentReference =
  | { readonly kind: 'root' }
  | { readonly kind: 'parent'; readonly id: string }
  | { readonly kind: 'unknown' };

export type HeaderIssue = 'empty-session-id' | 'project-missing' | 'parent-invalid' | 'history-unrecognised';

/**
 * Who started the thread, as its first `session_meta` says (§2.4): a person (`source` a string), the agent of another
 * thread (`thread_spawn`, X15), Codex's reviewer (`guardian`, X19), or another kind of thread, which is kept as unknown.
 */
export type ThreadOrigin =
  | { readonly kind: 'person' }
  | {
      readonly kind: 'spawned';
      /** The parent `thread_spawn` itself names, which X16 requires to agree with `parent_thread_id`. */
      readonly spawnedBy?: string;
      readonly depth?: number;
      /** A name, never an id (X18). */
      readonly agentPath?: string;
      readonly role?: string;
    }
  | { readonly kind: 'reviewer' }
  | { readonly kind: 'unknown' };

/** Internal source data: paths and ids must cross redaction before any output. */
export interface SessionHeader {
  readonly id: string;
  readonly parent: ParentReference;
  readonly project?: string;
  readonly historyMode: HistoryMode;
  /** The build that wrote the file, as written; absent when not a string. */
  readonly version?: string;
  readonly origin: ThreadOrigin;
  readonly issues: readonly HeaderIssue[];
}

export type HeaderRead =
  | { readonly kind: 'recognised'; readonly header: SessionHeader }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unavailable'; readonly reason: AccessFailure };

/** X2: the first physical line decides recognition. A later metadata line cannot rescue an unknown file. */
export async function readSessionHeader(files: FileReader, path: string): Promise<HeaderRead> {
  try {
    for await (const text of files.readLines(path)) {
      const header = headerIn(text);
      return header === undefined ? { kind: 'unknown' } : { kind: 'recognised', header };
    }
    return { kind: 'unknown' };
  } catch (error) {
    if (error instanceof FileAccessError) return { kind: 'unavailable', reason: error.failure };
    throw error;
  }
}

function headerIn(text: string): SessionHeader | undefined {
  const line = parseJsonObject(text);
  if (line?.[SESSION.lineType] !== SESSION.metadataType) return undefined;
  const payload = line[SESSION.payload];
  if (!isJsonObject(payload)) return undefined;
  const id = payload[SESSION.id];
  if (typeof id !== 'string') return undefined;

  const issues: HeaderIssue[] = [];
  if (id === '') issues.push('empty-session-id');
  const directory = payload[SESSION.workingDirectory];
  const project = typeof directory === 'string' && directory !== '' ? directory : undefined;
  if (project === undefined) issues.push('project-missing');
  const parentId = payload[SESSION.parentId];
  const parent: ParentReference = !(SESSION.parentId in payload)
    ? { kind: 'root' }
    : typeof parentId === 'string' && parentId !== ''
      ? { kind: 'parent', id: parentId }
      : { kind: 'unknown' };
  if (parent.kind === 'unknown') issues.push('parent-invalid');
  const historyMode = HISTORY_MODES.find((mode) => payload[SESSION.historyMode] === mode) ?? 'unknown';
  if (historyMode === 'unknown') issues.push('history-unrecognised');
  const version = payload[SESSION.version];
  return {
    id,
    parent,
    ...(project === undefined ? {} : { project }),
    historyMode,
    ...(typeof version === 'string' ? { version } : {}),
    origin: originOf(payload[SESSION.source]),
    issues,
  };
}

function originOf(source: unknown): ThreadOrigin {
  if (typeof source === 'string') return { kind: 'person' };
  const subagent = isJsonObject(source) ? source[THREAD_SPAWN.subagent] : undefined;
  if (!isJsonObject(subagent)) return { kind: 'unknown' };
  if (subagent[REVIEWER.other] === REVIEWER.guardian) return { kind: 'reviewer' };
  const spawn = subagent[THREAD_SPAWN.threadSpawn];
  return isJsonObject(spawn) ? { kind: 'spawned', ...spawnFacts(spawn) } : { kind: 'unknown' };
}

function spawnFacts(spawn: JsonObject): Omit<Extract<ThreadOrigin, { kind: 'spawned' }>, 'kind'> {
  const text = (key: string): string | undefined => {
    const value = spawn[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const depth = spawn[THREAD_SPAWN.depth];
  const spawnedBy = text(THREAD_SPAWN.parentId);
  const agentPath = text(THREAD_SPAWN.agentPath);
  const role = text(THREAD_SPAWN.role);
  return {
    ...(spawnedBy === undefined ? {} : { spawnedBy }),
    ...(typeof depth === 'number' && Number.isInteger(depth) && depth >= 0 ? { depth } : {}),
    ...(agentPath === undefined ? {} : { agentPath }),
    ...(role === undefined ? {} : { role }),
  };
}
