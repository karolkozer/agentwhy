import { MEASURED_PROFILES, UNKNOWN_MODE_ANSWERS, UNMEASURED_PROFILES } from '../contract/capabilities.js';
/**
 * The questions a file answers, declared per source (X23): its build and history mode choose the contract's profile, and
 * what its reading found adds to it. An unrecognised part or an interrupted turn makes the action stream `unmeasured`
 * beside whatever the profile says, and never less.
 */
export function capabilitiesOf(header, source, agentId, facts) {
    const agent = agentId === undefined ? {} : { agentId };
    const answers = { ...answersFor(header) };
    if (facts.hiddenReasoning)
        answers.reasoning = 'absent';
    if (facts.permissionsRecorded)
        answers.permissions = facts.permissionsIncomplete ? 'unmeasured' : 'supported';
    const records = Object.entries(answers).map(([question, state]) => ({
        question: question, state: state, source, ...agent,
    }));
    if (facts.unrecognised || facts.interrupted)
        records.push({ question: 'actions', state: 'unmeasured', source, ...agent });
    return records;
}
function answersFor(header) {
    if (header.historyMode === 'unknown')
        return UNKNOWN_MODE_ANSWERS;
    const measured = MEASURED_PROFILES.find((profile) => header.version !== undefined && profile.builds.includes(header.version) && profile.historyModes.includes(header.historyMode));
    return measured?.answers ?? UNMEASURED_PROFILES[header.historyMode];
}
