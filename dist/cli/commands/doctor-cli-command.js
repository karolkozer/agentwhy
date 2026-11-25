import { EXIT_CODE } from '../exit-codes.js';
import { parseDoctorArguments } from './doctor-arguments.js';
import { DOCTOR_USAGE } from './doctor-usage.js';
// A Record over the outcome union: a new outcome does not compile until it has an exit code.
const EXIT_CODE_BY_OUTCOME = {
    complete: EXIT_CODE.ok,
    'main-transcript-missing': EXIT_CODE.mainTranscriptMissing,
    // No session found, for the same reason a missing transcript is: nothing here is a report on a session.
    'unknown-format': EXIT_CODE.mainTranscriptMissing,
};
export class DoctorCliCommand {
    name = 'doctor';
    usage = DOCTOR_USAGE;
    #doctor;
    constructor(doctor) {
        this.#doctor = doctor;
    }
    async execute(args) {
        const parsed = parseDoctorArguments(args);
        switch (parsed.kind) {
            case 'help':
                return { kind: 'help', usage: this.usage };
            case 'usage-error':
                return { kind: 'usage-error', message: parsed.message, usage: this.usage };
            case 'options': {
                const result = await this.#doctor.run(parsed.options);
                return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
            }
        }
    }
}
