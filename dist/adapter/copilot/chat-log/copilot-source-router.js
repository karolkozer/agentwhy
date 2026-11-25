import { FileAccessError } from '../../../ports/file-access-error.js';
import { readChatLogHeader } from './chat-log-header.js';
/**
 * Whether an input is a VS Code chat log (VCD1): a file whose first line is a chat's snapshot. A folder is none - a
 * workspace's folders hold other files, and a chat is reported on by its log.
 */
export async function recogniseVsCodeChat(directories, files, input) {
    try {
        if ((await directories.kindOf(input)) === 'directory')
            return 'unknown';
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return 'unavailable';
        throw error;
    }
    const read = await readChatLogHeader(files, input);
    return read.kind === 'recognised' ? 'recognised' : read.kind === 'unavailable' ? 'unavailable' : 'unknown';
}
/**
 * VCD1: one AI, two records - the runtime's, which the desktop app and the CLI write, and the log VS Code keeps - both
 * Copilot's. The runtime's first-line rule is asked first, then VS Code's; an input either could not read to tell is
 * unavailable only where neither recognised it.
 */
export function recogniseCopilotRecord(runtime, vsCode) {
    return async (input) => {
        const first = await runtime(input);
        if (first === 'recognised')
            return first;
        const second = await vsCode(input);
        if (second === 'recognised')
            return second;
        return first === 'unavailable' || second === 'unavailable' ? 'unavailable' : 'unknown';
    };
}
/** Reads a Copilot input with the source of its record (VCD1): VS Code's chat log by its reader, anything else the runtime's. */
export class CopilotSourceRouter {
    #runtime;
    #vsCode;
    #isVsCodeChat;
    constructor(dependencies) {
        this.#runtime = dependencies.runtime;
        this.#vsCode = dependencies.vsCode;
        this.#isVsCodeChat = dependencies.isVsCodeChat;
    }
    async read(input) {
        return (await this.#isVsCodeChat(input)) === 'recognised' ? this.#vsCode.read(input) : this.#runtime.read(input);
    }
}
/** What a person recognises a Copilot conversation by, read from its own record (VCD1): a chat log's by VS Code's titles. */
export class CopilotTitlesRouter {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async recognise(session) {
        const { runtime, vsCode, isVsCodeChat } = this.#dependencies;
        return (await isVsCodeChat(session.path)) === 'recognised' ? vsCode.recognise(session) : runtime.recognise(session);
    }
}
