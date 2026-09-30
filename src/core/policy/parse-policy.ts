import { isJsonObject, parseJsonObject } from '../../shared/json.ts';
import type { Policy, PolicyLevel, ProtectedPath } from './policy.ts';

/**
 * Reads a policy document. Every problem is an error with a sentence saying what to do, and **never a silent
 * default**: a policy file whose typo quietly disables a rule is worse than no policy file, because it reads as
 * a decision that was taken.
 */
export type PolicyDocument = { readonly policy: Policy } | { readonly errors: readonly string[] };

export const POLICY_VERSION = 1;

const LEVELS: readonly PolicyLevel[] = ['no-read', 'no-disclose'];
const KEYS = new Set(['version', 'level', 'protected', 'allowed']);

export function parsePolicy(text: string, path: string): PolicyDocument {
  const document = parseJsonObject(text);
  if (document === undefined) return { errors: [`${path} is not a JSON object`] };

  const errors: string[] = [];
  const unknown = Object.keys(document).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) {
    errors.push(`unknown ${unknown.length === 1 ? 'key' : 'keys'} ${unknown.join(', ')} — remove them, or fix the spelling`);
  }
  if (document.version !== POLICY_VERSION) {
    errors.push(`"version" must be ${POLICY_VERSION} — add it, so a later format change is detected rather than guessed`);
  }

  const level = document.level;
  if (typeof level !== 'string' || !isLevel(level)) {
    errors.push(`"level" must be one of ${LEVELS.join(', ')}`);
  }

  const protectedPaths = readProtected(document.protected, errors);
  const allowed = readAllowed(document.allowed, errors);

  if (errors.length > 0) return { errors };
  return {
    policy: {
      level: level as PolicyLevel,
      protected: protectedPaths,
      allowed,
      origin: { kind: 'file', path },
    },
  };
}

function isLevel(value: string): value is PolicyLevel {
  return (LEVELS as readonly string[]).includes(value);
}

/** An entry is a pattern, or a pattern with its own level. Both shapes are read; nothing acts on the level yet. */
function readProtected(value: unknown, errors: string[]): ProtectedPath[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('"protected" must be a non-empty array of path patterns');
    return [];
  }

  return value.flatMap((entry, index) => {
    if (typeof entry === 'string') return entry === '' ? refuse(errors, index, 'is empty') : [{ pattern: entry }];
    if (!isJsonObject(entry)) return refuse(errors, index, 'must be a pattern or an object with "path"');

    const pattern = entry.path;
    const level = entry.level;
    if (typeof pattern !== 'string' || pattern === '') return refuse(errors, index, 'has no "path"');
    if (level !== undefined && (typeof level !== 'string' || !isLevel(level))) {
      return refuse(errors, index, `has a "level" that is not one of ${LEVELS.join(', ')}`);
    }
    return [{ pattern, ...(level === undefined ? {} : { level: level as PolicyLevel }) }];
  });
}

function readAllowed(value: unknown, errors: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry === '')) {
    errors.push('"allowed" must be an array of path patterns');
    return [];
  }
  return value as string[];
}

function refuse(errors: string[], index: number, problem: string): [] {
  errors.push(`"protected" entry ${index + 1} ${problem}`);
  return [];
}
