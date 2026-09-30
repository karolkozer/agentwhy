/**
 * The marker planted in every free-text position of a committed fixture, by the redaction that built it and by hand
 * in tests/fixtures/synthetic/. No output of the tool may ever contain it: a fixture that reaches the report is a
 * leak path, whatever the fixture happens to say.
 */
export const CANARY_MARKER = 'AGENTWHY_CANARY';
