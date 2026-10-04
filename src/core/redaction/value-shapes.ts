// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The exclusions of spec §5.4 — "the real work here". Without them class B is a noise generator, because a
 * sensitive name sits beside a harmless value far more often than beside a secret: `SECRET_ENABLED=true`,
 * `TOKEN_EXPIRY=3600`, `API_KEY_HEADER=X-Api-Key`.
 *
 * They run **before** name matching (resolution order, step 3 before step 4). The reverse order redacts
 * `SECRET_ENABLED=true`, which is the mistake the order exists to prevent.
 */

/** A name that describes a secret, or names something public, rather than holding one. */
const NAME_EXCLUSIONS: readonly RegExp[] = [
  // `NEXT_PUBLIC_SITE_URL` was the prompt of test B2; these are published in client-side code by design.
  /PUBLIC/i,
  /\b(PRIMARY|FOREIGN|SORT|PARTITION|CACHE|IDEMPOTENCY)_KEY\b/i,
  /KEYWORD|KEYCODE|KEYBOARD/i,
  /_(ENABLED|EXPIRY|TTL|LENGTH|ROUNDS|ALGO|HEADER|NAME|PATH|FILE|PROVIDER|STRATEGY)$/i,
];

const SENSITIVE_NAME =
  /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|CREDENTIAL|PRIVATE|AUTH|APIKEY|SALT|SIGNING|BEARER|SESSION|COOKIE|DSN|CONNECTION_STRING)/i;

/** A value of one of these shapes is not a secret, whatever the name beside it says. */
const VALUE_EXCLUSIONS: readonly RegExp[] = [
  /^(true|false|yes|no|on|off|enabled|disabled|null|none|undefined)$/i,
  /^-?\d+(\.\d+)?([a-z%]{1,3})?$/i,
  /^\d+(ms|s|m|h|d|w)(\d+(ms|s|m|h|d|w))*$/i,
  /^(development|production|staging|test|local|debug|info|warn|error|postgres|postgresql|mysql|redis|sqlite|utf8|utf-8)$/i,
  /^(v?\d+(\.\d+)*(-[\w.]+)?|latest|next|\^[\w.]+|~[\w.]+)$/i,
  /^[\w.-]+:[\w.-]+$/,
  /^([~.]{0,2}\/|[A-Za-z]:\\)/,
  /^[\w.-]+\.(ts|js|json|ya?ml|md|txt|log|sql|sh)$/i,
  /^(https?|postgres(ql)?|mysql|redis|mongodb|amqp):\/\//i,
  /^[\w.+-]+@[\w.-]+\.\w+$/,
  /^(#[0-9a-f]{3,8}|rgba?\([\d,.\s]+\))$/i,
  /^[a-z]{2}([_-][A-Za-z]{2,4})?$/,
  /^[\w.-]+\/[\w.+-]+$/,
  /^(changeme|your-[\w-]+|replace_?me|todo|example|dummy|test|xxx+|<.*>|\.{3}|)$/i,
  /^(.)\1*$/,
];

/**
 * A name as configuration writes them: `WEBHOOK_SECRET`, `aws_access_key_id`, `api-key`. Code writes `sessionId`,
 * `key` and `tokens`, and on one real session those three shapes alone accounted for 62 of 139 class B matches -
 * names from a repository's own vocabulary, standing beside values that are not secrets.
 *
 * This narrows **reporting only** (spec §5.4, two thresholds): redaction keeps the wider rule, because replacing
 * something that was not a secret costs nothing and missing one costs everything.
 */
export function isConfigName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name) || /[_-]/.test(name);
}

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name) && !NAME_EXCLUSIONS.some((pattern) => pattern.test(name));
}

/** Prose is many words with spaces: a sentence beside a sensitive name is a description, not a credential. */
export function isExcludedValue(value: string): boolean {
  const trimmed = unquote(value.trim());

  if (trimmed.length < 8) return true;
  if (trimmed.split(/\s+/).length > 2) return true;
  if (VALUE_EXCLUSIONS.some((pattern) => pattern.test(trimmed))) return true;
  // A list is excluded when every item of it is.
  const items = trimmed.split(',');
  return items.length > 1 && items.every((item) => isExcludedValue(item.trim()) || item.trim().length < 8);
}

/**
 * The shape exclusions without the length floor. `specs/2026-09-15-what-came-back.md` §5.2 proposes these to decide which values
 * read from a protected file are too ordinary to trace, and leaves the floor out on purpose: §2 of that specification
 * shows a real secret may be shorter than 8 characters. Redaction does not use this - rule 1 redacts every
 * value of a protected resource, whatever its shape.
 */
export function isOrdinaryShape(value: string): boolean {
  const trimmed = unquote(value.trim());

  if (trimmed.split(/\s+/).length > 2) return true;
  if (VALUE_EXCLUSIONS.some((pattern) => pattern.test(trimmed))) return true;
  const items = trimmed.split(',');
  return items.length > 1 && items.every((item) => isOrdinaryShape(item.trim()));
}

export function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted?.[2] ?? value;
}
