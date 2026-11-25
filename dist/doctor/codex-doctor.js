/** `doctor` on Codex rollouts (X26): measures, renders, and says when nothing it was given was a Codex session. */
export class CodexDoctor {
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
