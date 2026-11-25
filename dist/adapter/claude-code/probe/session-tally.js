import { AgentToolInputKeyCollector } from './collectors/agent-tool-input-key-collector.js';
import { DenialKindCollector } from './collectors/denial-kind-collector.js';
import { TaskNotificationCollector } from './collectors/task-notification-collector.js';
import { ToolResultReferenceCollector } from './collectors/tool-result-reference-collector.js';
import { ToolVersionCollector } from './collectors/tool-version-collector.js';
import { WorkingDirectoryCollector } from './collectors/working-directory-collector.js';
/** Measurements that span the whole session: every transcript, main and subagents alike, feeds the same collectors. */
export class SessionTally {
    #toolVersions = new ToolVersionCollector();
    #agentToolInputKeys = new AgentToolInputKeyCollector();
    #denialKinds = new DenialKindCollector();
    #toolResultReferences = new ToolResultReferenceCollector();
    #workingDirectories = new WorkingDirectoryCollector();
    #taskNotifications = new TaskNotificationCollector();
    collectors = [
        this.#toolVersions,
        this.#agentToolInputKeys,
        this.#denialKinds,
        this.#toolResultReferences,
        this.#workingDirectories,
        this.#taskNotifications,
    ];
    toolVersions() {
        return this.#toolVersions.counts();
    }
    workingDirectories() {
        return this.#workingDirectories.stats();
    }
    agentToolInputKeys() {
        return this.#agentToolInputKeys.counts();
    }
    denials() {
        return this.#denialKinds.stats();
    }
    taskNotifications() {
        return this.#taskNotifications.stats();
    }
    toolResultReferences(availableFiles) {
        return this.#toolResultReferences.stats(availableFiles);
    }
}
