/** At most this many variable names are kept per file: enough to name every line a person has to change. */
export const NAMES_PER_FILE = 20;
/**
 * PN8: one tool's identity across a report - its name, and an MCP call's server and tool, since Codex names every MCP
 * call `McpToolCall` (a first build gave all of a conversation's MCP tools one note, the last one's).
 */
export function toolKey(tool, mcp) {
    return mcp === undefined ? tool : `${tool}\u0000${mcp.server}\u0000${mcp.tool}`;
}
