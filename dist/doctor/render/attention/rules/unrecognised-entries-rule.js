export class UnrecognisedEntriesRule {
    findings({ sources }) {
        const { unrecognisedEntries } = sources;
        return unrecognisedEntries > 0 ? [`entries the format contract does not recognise: ${unrecognisedEntries}`] : [];
    }
}
