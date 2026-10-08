// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * v1 (2026-09-29): first-line recognition and identity only, X1-X5, measured on 70 frozen files (spec §2.7).
 * v2 (2026-09-29): the records a report reads - turns and their permissions, action items, messages, the cell's output
 * handed to the model, delegations and reviewers - from §2.2-§2.6 and the controlled terminal sessions of §2.8, and the
 * capability matrix they permit (`capabilities.ts`). Joins that depend on the probe's corrected session index (§2.4)
 * stay provisional: they are made by id and leave a relation unresolved where they break; XB4 is open. Every other
 * build and mode is read with its capabilities unmeasured.
 * v3 (2026-10-07): 0.160.0 and 0.160.1 measured (§2.13, 61 files). The VS Code panel's `legacy` files hold no item of any
 * kind and copy the agent's words as `agent_message` events without an id; a copy no id joins is the one assistant
 * message whose text it equals (XD9). 0.160.0 `paginated` gains a capability profile: delivery by §2.10's rule, own
 * words by id in the terminal and `exec`, by unique text in the panel. 0.160.1 is recognised and read; its three files
 * are no corpus, so its capabilities stay unmeasured.
 */
export const CONTRACT_VERSION = 3;

export const VERIFIED_AGAINST = {
  date: '2026-10-07',
  codex: ['0.154.0-alpha.6.2', '0.155.0-alpha.16.3', '0.155.0-alpha.9', '0.157.0', '0.160.0', '0.160.1'],
  files: 138,
  scope: 'session-records',
} as const;
