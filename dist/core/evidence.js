export function mainSource() {
    return { kind: 'main' };
}
export function agentSource(agentId) {
    return { kind: 'agent', agentId };
}
export function reviewSource(reviewId) {
    return { kind: 'review', reviewId };
}
