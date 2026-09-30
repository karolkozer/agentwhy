/**
 * The runtime permissions a `turn_context` records for its turn (§2.5; §2.8): recorded settings, never agentwhy's policy
 * and never a verdict on a path (X21, X22). Values outside these lists are kept out of the model and said as unknown.
 */
export const PERMISSIONS = {
  approval: 'approval_policy',
  approver: 'approvals_reviewer',
  sandbox: 'sandbox_policy',
  sandboxType: 'type',
  network: 'network_access',
  fileSystem: 'file_system_sandbox_policy',
  entries: 'entries',
  access: 'access',
  target: 'path',
  targetType: 'type',
  targetPath: 'path',
} as const;

/** `approvals_reviewer`: `user` 128 and `auto_review` 341 turns (§2.5); `user` in 7 of 7 (§2.8). */
export const APPROVERS = { user: 'person', auto_review: 'reviewer' } as const;

/** `approval_policy` string values: `on-request` 304 and `never` 145 turns (§2.5). A `granular` object (20) is not read. */
export const APPROVAL_POLICIES = ['on-request', 'never'] as const;

/** `sandbox_policy.type`: `workspace-write` and `read-only` (§2.8). */
export const SANDBOX_TYPES = ['workspace-write', 'read-only'] as const;

/** `entries[].access`: `read` 2,731 and `write` 1,112 (§2.5). The entries only allow; not one denies. */
export const SCOPE_ACCESS = ['read', 'write'] as const;

/** `entries[].path.type`: `path` 2,436 and `special` 1,407 (§2.5). A special target names no path this reads. */
export const SCOPE_TARGETS = { path: 'path', special: 'special' } as const;
