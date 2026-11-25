export class MissingMainTranscriptRule {
    findings({ sources }) {
        return sources.mainTranscript === 'present' ? [] : [`main transcript: ${sources.mainTranscript}`];
    }
}
