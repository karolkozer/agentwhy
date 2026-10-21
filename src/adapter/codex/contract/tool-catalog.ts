// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Where Codex keeps what its MCP servers say their tools do (`2026-10-21-the-plan-and-the-recap.md` PNB11, measured
 * 2026-10-21): a rollout keeps no tool's description (0 of 483 MCP calls), and Codex's desktop app keeps a cache of the
 * tools it has now in `.codex-global-state.json`, beside `sessions`, under `electron-persisted-atom-state` →
 * `mcp-server-tools-cache-v2` → `catalog[]` - each entry's `name` the server's, its `tools` an object keyed by tool name,
 * each with a `description` (232 tools; 20 of the 28 MCP tools the rollouts called). The same file holds the app's other
 * state and an account id: only this one key is read, and only descriptions leave it.
 *
 * The cache is the tools as they are when a report is read, not as they were in the conversation: a description from
 * it is said as the server's description *now*. A description is **content**, written by whoever wrote the tool.
 */
export const TOOL_CATALOG = {
  file: '.codex-global-state.json',
  path: ['electron-persisted-atom-state', 'mcp-server-tools-cache-v2', 'catalog'],
  server: 'name',
  tools: 'tools',
  description: 'description',
} as const;
