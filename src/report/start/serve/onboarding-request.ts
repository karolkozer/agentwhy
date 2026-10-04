// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { OnboardingChoices } from '../onboarding/onboarding-changes.ts';

/** W15: a person adds a few files while setting up; more than this in one request is not a page that was used. */
export const MOST_NAMES = 20;

const FIELDS = ['scope', 'watch', 'protect', 'tell', 'modes', 'stopped', 'fine'];

/**
 * The body of `api/onboarding` (`.ai/specs/2026-09-24-onboarding.md` W15): exactly the three steps' answers, and
 * nothing else. A body this does not recognise is a bad request, and nothing is written - a request that could carry
 * more than the page offers would be a way to write what nobody chose. Whether a name can be written is not decided
 * here: `finishOnboarding` refuses the whole request where one cannot (R46, R59).
 */
export function onboardingChoices(fields: Record<string, unknown>): OnboardingChoices | string {
  const unknown = Object.keys(fields).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) return 'The request holds ' + FIELDS.join(', ') + ', and nothing else.';
  if (fields.scope !== 'local' && fields.scope !== 'shared') return 'The scope is local or shared.';
  if (typeof fields.watch !== 'boolean' || typeof fields.stopped !== 'boolean' || typeof fields.fine !== 'boolean') {
    return 'watch, stopped and fine are true or false.';
  }
  const protect = names(fields.protect);
  const tell = names(fields.tell);
  if (typeof protect === 'string') return protect;
  if (typeof tell === 'string') return tell;
  if (protect.length + tell.length > MOST_NAMES) return `At most ${MOST_NAMES} names are added at once.`;
  // W12a: a row's mode by its key. The key only finds a row the server reads again; it writes nothing of its own.
  if (fields.modes === null || typeof fields.modes !== 'object' || Array.isArray(fields.modes)) return 'The modes are an object.';
  const modes = Object.entries(fields.modes as Record<string, unknown>);
  if (modes.length > MOST_NAMES || modes.some(([key, mode]) => key.length > 200 || (mode !== 'block' && mode !== 'tell'))) return 'A mode is block or tell.';
  return {
    scope: fields.scope,
    watch: fields.watch,
    protect,
    tell,
    modes: Object.fromEntries(modes) as Record<string, 'block' | 'tell'>,
    stopped: fields.stopped,
    fine: fields.fine,
  };
}

function names(value: unknown): string[] | string {
  if (!Array.isArray(value)) return 'The names are a list.';
  const kept = value.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '');
  if (kept.length !== value.length) return 'A name is text.';
  return kept.map((pattern) => pattern.trim());
}
