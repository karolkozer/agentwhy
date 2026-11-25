import { transcriptScopes } from '../transcript-scopes.js';
export class DamagedTranscriptsRule {
    findings(report) {
        return transcriptScopes(report).flatMap(([scope, stats]) => [
            ...(stats.unparsableLines > 0 ? [`unparsable lines in ${scope}: ${stats.unparsableLines}`] : []),
            ...(stats.unreadableFiles > 0 ? [`unreadable transcript files in ${scope}: ${stats.unreadableFiles}`] : []),
        ]);
    }
}
