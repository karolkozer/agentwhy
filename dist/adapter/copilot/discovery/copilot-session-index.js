/**
 * One listing of the sessions root at a time: a listing asked for while one of the same folder is being taken is that
 * one, so a page that lists a project's conversations and the person's projects at once walks the root once. Nothing is
 * kept past it - every listing is taken anew - so a session started since is in the next one.
 */
export class CopilotSessionIndex {
    #discovery;
    #taking;
    constructor(discovery) {
        this.#discovery = discovery;
    }
    async list(root) {
        const taking = this.#taking;
        if (taking !== undefined && taking.root === root)
            return taking.listing;
        const listing = this.#discovery.list(root);
        this.#taking = { root, listing };
        try {
            return await listing;
        }
        finally {
            if (this.#taking?.listing === listing)
                this.#taking = undefined;
        }
    }
}
