export class MissingSpilledResultsRule {
    findings({ toolResultReferences }) {
        const { missing } = toolResultReferences;
        return missing > 0 ? [`referenced spilled results missing: ${missing}`] : [];
    }
}
