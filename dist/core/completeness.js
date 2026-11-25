/**
 * A gap that leaves a relation unjoined makes the whole thing `unresolved`; any other gap makes it `partial`.
 * The distinction matters because an unresolved relation means the event gets no outcome at all (§4.3 rule 6),
 * while a partial one means the picture has holes we can name.
 */
export function completenessOf(gaps) {
    if (gaps.some((gap) => gap.kind === 'relation-unresolved'))
        return 'unresolved';
    return gaps.length === 0 ? 'complete' : 'partial';
}
