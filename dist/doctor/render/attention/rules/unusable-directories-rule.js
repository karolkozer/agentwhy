export class UnusableDirectoriesRule {
    findings({ sources }) {
        const directories = [
            ['subagents directory', sources.subagentsDirectory],
            ['tool-results directory', sources.toolResultsDirectory],
        ];
        // `not-found` is normal: a session without subagents or spilled results has no such directory.
        return directories
            .filter(([, state]) => state === 'unreadable' || state === 'wrong-kind')
            .map(([name, state]) => `${name}: ${state}`);
    }
}
