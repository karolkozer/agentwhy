import { FileAccessError } from '../../../ports/file-access-error.js';
/**
 * The conversations of one listing (X5): every root, with the files whose parents lead to it, and every file whose
 * relation did not resolve, which is listed on its own rather than hidden as a thread of nothing. A resolved descendant
 * is never a row: lists show the root only. `keep` chooses the rows by their first file, before any file is looked at:
 * only the files of the rows kept are.
 */
export async function conversationsIn(listing, directories, keep = () => true) {
    // The files resolved to each root, gathered in one pass: thousands of rollouts are walked once, not once per row.
    const resolvedTo = new Map();
    listing.sources.forEach((source, at) => {
        if (source.relation.kind !== 'resolved')
            return;
        const members = resolvedTo.get(source.relation.root);
        if (members === undefined)
            resolvedTo.set(source.relation.root, [at]);
        else
            members.push(at);
    });
    const rows = listing.sources.flatMap((source, index) => {
        const relation = source.relation;
        if ((relation.kind === 'resolved' && relation.root !== index) || !keep(source))
            return [];
        return [{ source, index, members: relation.kind === 'resolved' ? (resolvedTo.get(index) ?? []) : [index] }];
    });
    return Promise.all(rows.map(async ({ source, index, members }) => {
        const modified = await Promise.all(members.map((at) => modifiedAt(directories, listing.sources[at]?.path ?? '')));
        return {
            source,
            modifiedAt: Math.max(...modified),
            delegations: members.filter((at) => at !== index && listing.sources[at]?.header.origin.kind === 'spawned').length,
        };
    }));
}
async function modifiedAt(directories, path) {
    try {
        return await directories.modifiedAt(path);
    }
    catch (error) {
        if (!(error instanceof FileAccessError))
            throw error;
        return 0;
    }
}
