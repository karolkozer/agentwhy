export class IncompleteSubagentPairsRule {
    findings({ sources }) {
        const { incompletePairs } = sources.subagentFiles;
        return incompletePairs > 0 ? [`subagents with an incomplete file pair: ${incompletePairs}`] : [];
    }
}
