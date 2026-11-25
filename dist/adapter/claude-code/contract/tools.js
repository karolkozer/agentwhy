function profile(pathKeys, commandKeys, result, writes) {
    return { pathKeys, commandKeys, searchWholeInput: false, result, ...(writes === undefined ? {} : { writes }) };
}
export const TOOL_PROFILES = {
    Read: profile(['file_path'], [], 'content'),
    Edit: profile(['file_path'], [], 'none', { removedTextKeys: ['old_string'] }),
    Write: profile(['file_path'], [], 'none', { removedTextKeys: [] }),
    NotebookEdit: profile(['notebook_path'], [], 'none'),
    Bash: profile([], ['command'], 'listing'),
    // `2026-10-12-powershell-on-windows.md` PWB1: Claude Code's shell on Windows, a PowerShell line in `command`.
    PowerShell: { ...profile([], ['command'], 'listing'), commandLanguage: 'powershell' },
    Grep: profile(['path'], [], 'listing'),
    Glob: profile(['path'], [], 'listing'),
    Agent: profile([], [], 'none'),
    Skill: profile([], [], 'none'),
    ToolSearch: profile([], [], 'none'),
    WebFetch: profile([], [], 'none'),
    WebSearch: profile([], [], 'none'),
};
/**
 * An unknown tool is treated as the noisiest possibility rather than passed over: everything it was given may
 * name a target, and its result may enumerate what it reached. Callers are told the tool was not recognised, so
 * a report can say so instead of presenting the guess as knowledge.
 */
export const UNKNOWN_TOOL = { pathKeys: [], commandKeys: [], searchWholeInput: true, result: 'listing' };
export function profileOf(toolName) {
    // `Object.hasOwn`, because a tool named `toString` or `constructor` would otherwise find something on the
    // prototype, report itself as known, and hand back a profile with no keys at all.
    if (!Object.hasOwn(TOOL_PROFILES, toolName))
        return { profile: UNKNOWN_TOOL, known: false };
    const profile = TOOL_PROFILES[toolName];
    return profile === undefined ? { profile: UNKNOWN_TOOL, known: false } : { profile, known: true };
}
/**
 * Claude Code names an MCP server's tool `mcp__<server>__<tool>` (`2026-10-14-the-value-a-tool-carried.md` TVB1: the
 * record holds the call as a `tool_use` of that name). Undefined for any other name, and for one missing either part.
 */
export function mcpToolOf(toolName) {
    const [prefix, server, ...rest] = toolName.split(MCP_SEPARATOR);
    const tool = rest.join(MCP_SEPARATOR);
    return prefix === MCP_PREFIX && server !== undefined && server !== '' && tool !== '' ? { server, tool } : undefined;
}
const MCP_PREFIX = 'mcp';
const MCP_SEPARATOR = '__';
/**
 * The Grep tool prints the lines it matched only when its input asks for them; by default it prints file names
 * (`search-hits-are-reads` H1). Measured on the maintainer's transcripts of 2026-09-24: no call of it at all - every
 * search there went through the shell - so this is written from the tool's documented input, not from a record.
 */
export const GREP_TOOL = { name: 'Grep', outputModeKey: 'output_mode', contentMode: 'content' };
/**
 * What a `Write` or an `Edit` that ran keeps on its result line's `toolUseResult` (`2026-11-23-a-write-over-the-key.md` WK7):
 * the file as it was before the call, and what the call put in. Key names counted on the committed corpus - 7 of 7 `Write`
 * payloads hold `content`, `filePath`, `originalFile`, `structuredPatch`, `type`, `userModified`; 44 of 45 `Edit` payloads hold
 * `filePath`, `newString`, `oldString`, `originalFile`, `replaceAll`, `structuredPatch`, `userModified`, and the 45th is an
 * error's string. `originalFile` is a string (13) or null (38): null is no file before it known, so nothing is said of it.
 */
export const WRITE_RESULT = {
    originalFile: 'originalFile',
    /** A `Write`'s: the whole file it wrote. */
    content: 'content',
    /** An `Edit`'s: the text it took out, the text it put in, and whether it did so at every place. */
    oldString: 'oldString',
    newString: 'newString',
    replaceAll: 'replaceAll',
};
