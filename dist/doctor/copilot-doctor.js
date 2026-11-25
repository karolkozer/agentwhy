/** `doctor` on Copilot's runtime records (plan step 5): measures, renders, and says when nothing given was a Copilot session. */
export class CopilotDoctor {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        const report = await this.#dependencies.probe.probe(options.input);
        return {
            outcome: report.files.recognised > 0 ? 'complete' : 'unknown-format',
            output: this.#dependencies.renderers[options.format].render(report),
        };
    }
}
