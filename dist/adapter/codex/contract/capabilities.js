/**
 * `codex exec` 0.157.0, `paginated` (§2.8): XB5 and XB10 answered; XB7 found actions and refused attempts that leave no
 * item, so the action stream is never all of it; XB1 found no typed refusal.
 */
export const MEASURED_PROFILES = [
    {
        builds: ['0.157.0'],
        historyModes: ['paginated'],
        answers: { actions: 'absent', refusals: 'absent', 'own-words': 'supported', 'output-delivery': 'supported' },
    },
    /**
     * 0.160.0 `paginated` (§2.10, §2.13; 58 files from the terminal app, the VS Code panel and `codex exec`): XB5's rule
     * measured on its 79 outputs; own words by id in the terminal and exec (75 of 75) and by unique text in the panel (82
     * of 86, XD9); a refused attempt leaves no item (XB7); no typed refusal (XB1). 0.160.1 and 0.162.0-alpha.2 wrote too
     * few files to be a corpus, and keep the unmeasured answers.
     */
    {
        builds: ['0.160.0'],
        historyModes: ['paginated'],
        answers: { actions: 'absent', refusals: 'absent', 'own-words': 'supported', 'output-delivery': 'supported' },
    },
];
/**
 * Every other build of a known mode. `paginated`: items exist, but what escapes them and which message source is
 * canonical are not measured for it. `legacy`: its cells are recorded and nothing they ran is (§2.3, XD4). No build has a
 * typed refusal (§2.5, §2.8).
 */
export const UNMEASURED_PROFILES = {
    paginated: { actions: 'absent', refusals: 'absent', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured' },
    legacy: { actions: 'absent', access: 'absent', refusals: 'absent', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured' },
};
/** A history mode the contract does not list: nothing about it is known (X23, X24). */
export const UNKNOWN_MODE_ANSWERS = {
    actions: 'unmeasured', access: 'unmeasured', refusals: 'unmeasured', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured',
};
