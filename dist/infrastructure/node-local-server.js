// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:http';
const LOOPBACK = '127.0.0.1';
/**
 * `node:http` on 127.0.0.1 and a port the system picks. It stops after a stretch with no request, so a page left open in
 * a tab does not keep a process running for ever (R54). Headers every answer carries are set here, once.
 *
 * One listener for the process (`.ai/specs/2026-09-27-which-project.md` V14, V18, amended 2026-09-28): a run a page
 * switched to serves at the same address as the run it replaced, so the pages of the project shown before - in a tab's
 * history, or a tab left open - still reach this process, and are told what happened instead of reaching nothing. Every
 * `serve` is a run; requests go to the newest. Closing an older run settles it and nothing else; closing the newest - or
 * a stretch with no request - stops the listener.
 */
export class NodeLocalServer {
    #listening;
    #current;
    #timer;
    #idleMs = 0;
    async serve(handle, options) {
        let settle = () => undefined;
        const closed = new Promise((resolve) => {
            settle = resolve;
        });
        const run = { handle, settle, maxBody: options.maxBody };
        this.#idleMs = options.idleMs;
        const listening = this.#listening ?? await this.#listen();
        this.#current = run;
        this.#restart();
        let done = false;
        const close = () => {
            if (done)
                return;
            done = true;
            if (this.#current === run) {
                this.#stop();
                return;
            }
            settle();
        };
        return { origin: listening.origin, closed, close };
    }
    async #listen() {
        const server = createServer((incoming, outgoing) => {
            this.#restart();
            const run = this.#current;
            if (run === undefined) {
                outgoing.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                outgoing.end('No project is being shown.');
                return;
            }
            void answer(incoming, outgoing, run.handle, run.maxBody);
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, LOOPBACK, () => resolve());
        });
        const { port } = server.address();
        this.#listening = { server, origin: `http://${LOOPBACK}:${port}` };
        return this.#listening;
    }
    /** The newest run ends, and with it the listener: nothing is left to answer. */
    #stop() {
        if (this.#timer !== undefined)
            clearTimeout(this.#timer);
        const run = this.#current;
        const listening = this.#listening;
        this.#current = undefined;
        this.#listening = undefined;
        if (listening === undefined) {
            run?.settle();
            return;
        }
        listening.server.close(() => run?.settle());
        listening.server.closeAllConnections();
    }
    #restart() {
        if (this.#timer !== undefined)
            clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.#stop(), this.#idleMs);
        this.#timer.unref();
    }
}
async function answer(incoming, outgoing, handle, maxBody) {
    const send = (response) => {
        outgoing.writeHead(response.status, {
            'Content-Type': response.type,
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            ...(response.location === undefined ? {} : { Location: response.location }),
        });
        outgoing.end(response.body, () => response.after?.());
    };
    try {
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
            size += chunk.length;
            if (size > maxBody) {
                send({ status: 413, type: 'text/plain; charset=utf-8', body: 'Too large.' });
                incoming.destroy();
                return;
            }
            chunks.push(chunk);
        }
        const url = incoming.url ?? '/';
        const headers = {};
        for (const [name, value] of Object.entries(incoming.headers))
            headers[name] = Array.isArray(value) ? value.join(', ') : value;
        send(await handle({ method: incoming.method ?? 'GET', path: url.split('?')[0] ?? '/', headers, body: Buffer.concat(chunks).toString('utf8') }));
    }
    catch {
        if (!outgoing.headersSent)
            send({ status: 500, type: 'text/plain; charset=utf-8', body: 'Something went wrong.' });
    }
}
