// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { PermissionScope, RuntimePermissions } from '../../../core/turn.ts';
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { APPROVAL_POLICIES, APPROVERS, PERMISSIONS, SANDBOX_TYPES, SCOPE_ACCESS, SCOPE_TARGETS } from '../contract/permissions.ts';

/**
 * The permissions a `turn_context` recorded (X22): kept as recorded settings, apart from agentwhy's policy. A value the
 * contract does not list is not copied into the model - it is said as unrecognised, and the record as incomplete.
 */
export function permissionsOf(context: JsonObject): RuntimePermissions {
  let complete = true;
  const known = <T extends string>(value: unknown, list: readonly T[]): T | undefined => {
    if (value === undefined) return undefined;
    const found = list.find((each) => each === value);
    if (found === undefined) complete = false;
    return found;
  };

  const approval = known(context[PERMISSIONS.approval], APPROVAL_POLICIES);
  const approverValue = context[PERMISSIONS.approver];
  const approver = approverValue === undefined
    ? 'unrecorded'
    : typeof approverValue === 'string' && Object.hasOwn(APPROVERS, approverValue)
      ? APPROVERS[approverValue as keyof typeof APPROVERS]
      : 'unrecognised';
  if (approver === 'unrecognised') complete = false;

  const sandboxPolicy = context[PERMISSIONS.sandbox];
  const sandbox = isJsonObject(sandboxPolicy) ? known(sandboxPolicy[PERMISSIONS.sandboxType], SANDBOX_TYPES) : undefined;
  const networkValue = isJsonObject(sandboxPolicy) ? sandboxPolicy[PERMISSIONS.network] : undefined;
  const network = networkValue === undefined ? 'unrecorded' : networkValue === true ? 'allowed' : networkValue === false ? 'restricted' : 'unrecognised';
  if (network === 'unrecognised') complete = false;

  const fileSystem = context[PERMISSIONS.fileSystem];
  const entries = isJsonObject(fileSystem) ? fileSystem[PERMISSIONS.entries] : undefined;
  const scopes: PermissionScope[] = Array.isArray(entries) ? entries.map((entry) => scopeOf(entry, () => { complete = false; })) : [];
  if (fileSystem !== undefined && !Array.isArray(entries)) complete = false;

  return {
    ...(approval === undefined ? {} : { approval }),
    approver,
    ...(sandbox === undefined ? {} : { sandbox }),
    network,
    scopes,
    complete,
  };
}

function scopeOf(entry: unknown, unknownPart: () => void): PermissionScope {
  const access = isJsonObject(entry) ? SCOPE_ACCESS.find((each) => each === entry[PERMISSIONS.access]) : undefined;
  const target = isJsonObject(entry) ? entry[PERMISSIONS.target] : undefined;
  const type = isJsonObject(target) ? target[PERMISSIONS.targetType] : undefined;
  const path = isJsonObject(target) ? target[PERMISSIONS.targetPath] : undefined;
  const scope: PermissionScope = {
    access: access ?? 'unrecognised',
    target: type === SCOPE_TARGETS.path && typeof path === 'string'
      ? { kind: 'path', path }
      : type === SCOPE_TARGETS.special ? { kind: 'special' } : { kind: 'unrecognised' },
  };
  if (scope.access === 'unrecognised' || scope.target.kind === 'unrecognised') unknownPart();
  return scope;
}
