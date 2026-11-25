// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Anything but these is not a name this store wrote: a project's key is turned into one before it is used. */
const UNSAFE = /[^A-Za-z0-9._-]/g;
/**
 * The running page server of each project (`2026-10-02-a-page-not-a-file.md` PF2), in the person's own agentwhy
 * folder: one small file a project, readable by its owner alone, since the address holds the page's token. Never
 * throws: a record that cannot be read or written is no record, and a new server is started instead.
 */
export class FilePageServers {
    #directory;
    constructor(agentwhyDirectory) {
        this.#directory = join(agentwhyDirectory, 'servers');
    }
    async read(project) {
        try {
            const parsed = JSON.parse(await readFile(this.#fileFor(project), 'utf8'));
            return isRecord(parsed) ? parsed : undefined;
        }
        catch {
            return undefined;
        }
    }
    async write(project, record) {
        try {
            await mkdir(this.#directory, { recursive: true, mode: 0o700 });
            await writeFile(this.#fileFor(project), JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
        }
        catch {
            // No record is a server that is not reused: the next open starts its own.
        }
    }
    async remove(project, pid) {
        const known = await this.read(project);
        if (known?.pid !== pid)
            return;
        await rm(this.#fileFor(project), { force: true }).catch(() => undefined);
    }
    #fileFor(project) {
        const safe = project.replace(UNSAFE, '-').slice(0, 200);
        return join(this.#directory, `${safe === '' ? 'project' : safe}.json`);
    }
}
function isRecord(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const record = value;
    return typeof record.url === 'string' && Number.isInteger(record.pid) && typeof record.startedAt === 'number' &&
        (record.version === undefined || typeof record.version === 'string');
}
