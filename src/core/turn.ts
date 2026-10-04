// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AgentId } from './agent.ts';
import type { EvidenceRef } from './evidence.ts';

/**
 * One turn of one agent: everything it did between being asked and answering, where the format records turns by id
 * (`2026-09-27-what-codex-wrote.md` §4.G). A turn is joined by `(agentId, id)` and never by time or by the records next
 * to it: two agents may reuse one local id.
 */
export interface Turn {
  readonly id: string;
  readonly agentId: AgentId;
  /** The permissions the runtime recorded as in force for the turn, where it recorded them. */
  readonly permissions?: RuntimePermissions;
  readonly evidence: EvidenceRef;
}

/**
 * The sandbox and approval settings a runtime recorded for a turn (X22). A record of what was configured then, **not**
 * agentwhy's policy and not a verdict on any path: which path was effectively allowed would need an interpretation of
 * scopes, special roots, precedence and approvals that nothing here makes. **Raw content**: paths cross the redactor.
 */
export interface RuntimePermissions {
  /** When the runtime asks before acting, in its own recorded words; absent where not recorded. */
  readonly approval?: string;
  /** Who answers those questions: a person, or a reviewer the runtime runs itself. */
  readonly approver: 'person' | 'reviewer' | 'unrecognised' | 'unrecorded';
  /** The sandbox mode, in the runtime's own recorded words; absent where not recorded. */
  readonly sandbox?: string;
  readonly network: 'allowed' | 'restricted' | 'unrecognised' | 'unrecorded';
  /** The file system scopes, as recorded: each allows reading or writing somewhere. */
  readonly scopes: readonly PermissionScope[];
  /** Whether every part of the record was one the contract knows; an unknown part is kept out, and said. */
  readonly complete: boolean;
}

export interface PermissionScope {
  readonly access: 'read' | 'write' | 'unrecognised';
  /** A path the scope names, or a runtime-defined place (`special`) that is not a path. */
  readonly target: { readonly kind: 'path'; readonly path: string } | { readonly kind: 'special' } | { readonly kind: 'unrecognised' };
}
