// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export const LAYOUT = {
    transcriptSuffix: '.jsonl',
    subagentsDir: 'subagents',
    toolResultsDir: 'tool-results',
    toolResultSuffix: '.txt',
};
const SUBAGENT_FILE_SUFFIX = {
    transcript: '.jsonl',
    meta: '.meta.json',
};
const SUBAGENT_FILE = /^agent-([A-Za-z0-9]+)(\.jsonl|\.meta\.json)$/;
const TOOL_RESULT_REFERENCE = /tool-results\/([A-Za-z0-9_-]+\.txt)/g;
export function parseSubagentFileName(name) {
    const match = SUBAGENT_FILE.exec(name);
    const fileId = match?.[1];
    if (fileId === undefined)
        return undefined;
    return { fileId, kind: match?.[2] === SUBAGENT_FILE_SUFFIX.meta ? 'meta' : 'transcript' };
}
export function subagentFileName(fileId, kind) {
    return `agent-${fileId}${SUBAGENT_FILE_SUFFIX[kind]}`;
}
export function isToolResultFileName(name) {
    return name.endsWith(LAYOUT.toolResultSuffix);
}
/** File names of spilled results that a piece of transcript text points at. */
export function toolResultReferences(text) {
    return Array.from(text.matchAll(TOOL_RESULT_REFERENCE), (match) => match[1] ?? '').filter((name) => name !== '');
}
