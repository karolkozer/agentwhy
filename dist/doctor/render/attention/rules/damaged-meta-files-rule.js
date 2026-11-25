export class DamagedMetaFilesRule {
    findings({ meta }) {
        return [
            ...(meta.unparsableFiles > 0 ? [`unparsable meta.json files: ${meta.unparsableFiles}`] : []),
            ...(meta.unreadableFiles > 0 ? [`unreadable meta.json files: ${meta.unreadableFiles}`] : []),
        ];
    }
}
