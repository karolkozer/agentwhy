/** Discovers a session, measures it and renders the report. Returns the result; writing it is the shell's job. */
export class SessionDoctor {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        const { discovery, probe, renderers } = this.#dependencies;
        const session = await discovery.discover(options.input);
        const report = await probe.probe(session);
        return {
            outcome: session.mainTranscript.present ? 'complete' : 'main-transcript-missing',
            output: renderers[options.format].render(report),
        };
    }
}
