/** The gap each unanswered question leaves: absent and unmeasured stay different answers to a reader. */
export function capabilityGaps(records) {
    return records.flatMap((record) => record.state === 'supported'
        ? []
        : [{
                kind: record.state === 'absent' ? 'capability-absent' : 'capability-unmeasured',
                question: record.question,
                source: record.source,
                ...(record.agentId === undefined ? {} : { agentId: record.agentId }),
            }]);
}
