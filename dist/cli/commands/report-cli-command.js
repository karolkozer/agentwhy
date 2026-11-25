import { EXIT_CODE } from '../exit-codes.js';
import { parseReportArguments } from './report-arguments.js';
import { REPORT_USAGE } from './report-usage.js';
// A Record over the outcome union: a new outcome does not compile until it has an exit code. An incomplete
// report still exits 0 - it said what was missing, which is the report doing its job.
export const EXIT_CODE_BY_OUTCOME = {
    complete: EXIT_CODE.ok,
    incomplete: EXIT_CODE.ok,
    'policy-refused': EXIT_CODE.usage,
    'session-unreadable': EXIT_CODE.mainTranscriptMissing,
    'no-session': EXIT_CODE.mainTranscriptMissing,
};
export class ReportCliCommand {
    name = 'report';
    usage = REPORT_USAGE;
    #report;
    /** The terminal's width, read once in the shell. `undefined` where there is no terminal to read. */
    #columns;
    constructor(report, columns) {
        this.#report = report;
        this.#columns = columns;
    }
    async execute(args) {
        const parsed = parseReportArguments(args, this.#columns);
        switch (parsed.kind) {
            case 'help':
                return { kind: 'help', usage: this.usage };
            case 'usage-error':
                return { kind: 'usage-error', message: parsed.message, usage: this.usage };
            case 'options': {
                const result = await this.#report.run(parsed.options);
                return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
            }
        }
    }
}
