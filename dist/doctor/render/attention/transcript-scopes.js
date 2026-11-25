export function transcriptScopes({ main, subagents }) {
    return [
        ['main session', main],
        ['subagents', subagents],
    ];
}
