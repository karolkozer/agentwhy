/**
 * The CLI's `1.0.94` and `1.0.95` and the desktop app's `1.0.94-3` (spec §2.8-§2.17, 32 files of one fictional project).
 * The other builds of their line take it too (CPD13, `MEASURED_LINE`). Every call
 * has a start and, unless a person refused it, a completion (CPB16, CPB34); a call's result is what it returned (CPB15,
 * CPB42), past a large output's preview a gap (CPB26); the agent's words are its own messages; a refusal names its
 * source (CPB18, CPB34). Reasoning is encrypted with readable parts on some messages, and when it is is CPO4, so no
 * part is read as a reason (CP16); the permission settings recorded (`session.permissions_changed`) are not read.
 */
export const MEASURED_PROFILES = [
    {
        builds: ['1.0.94', '1.0.94-3', '1.0.95'],
        answers: {
            actions: 'supported',
            access: 'supported',
            'output-delivery': 'supported',
            'own-words': 'supported',
            reasoning: 'unmeasured',
            refusals: 'supported',
            permissions: 'unmeasured',
        },
    },
];
/**
 * CPD13 (accepted 2026-10-12): the CLI updates itself, so a build of the measured `1.0.x` line - its desktop `-n` builds
 * alike - takes the measured profile until its file holds a record type, or a key at a record's own level, the contract
 * does not know. A new minor line is measured with the probe before it takes any profile.
 */
export const MEASURED_LINE = /^1\.0\.\d+(?:-\d+)?$/;
/** Any other build: recognised and read, and nothing about it is measured. */
export const UNMEASURED_ANSWERS = {
    actions: 'unmeasured',
    access: 'unmeasured',
    'output-delivery': 'unmeasured',
    'own-words': 'unmeasured',
    reasoning: 'unmeasured',
    refusals: 'unmeasured',
    permissions: 'unmeasured',
};
