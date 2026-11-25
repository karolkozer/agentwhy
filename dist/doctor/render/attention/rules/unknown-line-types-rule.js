import { transcriptScopes } from '../transcript-scopes.js';
export class UnknownLineTypesRule {
    findings(report) {
        return transcriptScopes(report).flatMap(([scope, stats]) => stats.unknownLineTypes.map((type) => `UNKNOWN line type in ${scope}: ${type} (${stats.lineTypes[type] ?? 0})`));
    }
}
