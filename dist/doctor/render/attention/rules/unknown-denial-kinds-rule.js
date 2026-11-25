export class UnknownDenialKindsRule {
    findings({ denials }) {
        return denials.unknownKinds.map((kind) => `UNKNOWN toolDenialKind: ${kind} (${denials.byKind[kind] ?? 0})`);
    }
}
