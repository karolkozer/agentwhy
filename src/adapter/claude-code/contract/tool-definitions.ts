// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Where Claude Code records the tools the AI was given, each with the description its author wrote
 * (`2026-10-21-the-plan-and-the-recap.md` PNB10, measured 2026-10-21 over 930 transcripts): on `attachment` lines of three
 * kinds, each holding a list of definitions `{ name, description, … }` - `prompt_snapshot` under `tools` (690 lines,
 * 13,373 definitions), `deferred_tools_record` under `entries` (689), and `deferred_tools_delta` under
 * `surfacedDefinitions`, each item's `definition` (561). 742 of 765 MCP calls had their tool's description earlier in
 * the same transcript. The `api-request-*` lines hold copies, and are not read.
 *
 * A description is **content**, written by whoever wrote the tool: it crosses the redaction boundary before anything
 * shows it.
 */
export const TOOL_DEFINITIONS = {
  attachment: 'attachment',
  attachmentType: 'type',
  lists: [
    { kind: 'prompt_snapshot', list: 'tools' },
    { kind: 'deferred_tools_record', list: 'entries' },
    { kind: 'deferred_tools_delta', list: 'surfacedDefinitions', inner: 'definition' },
  ],
  lineType: 'attachment',
  name: 'name',
  description: 'description',
} as const;
