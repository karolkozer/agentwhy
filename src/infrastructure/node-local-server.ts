// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LocalRequest, LocalResponse, LocalServer, Serving } from '../ports/local-server.ts';

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
export class NodeLocalServer implements LocalServer {
  #listening: { readonly server: Server; readonly origin: string } | undefined;
  #current: { readonly handle: (request: LocalRequest) => Promise<LocalResponse>; readonly settle: () => void; readonly maxBody: number } | undefined;
  #timer: NodeJS.Timeout | undefined;
  #idleMs = 0;

  async serve(handle: (request: LocalRequest) => Promise<LocalResponse>, options: { readonly idleMs: number; readonly maxBody: number }): Promise<Serving> {
    let settle: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const run = { handle, settle, maxBody: options.maxBody };
    this.#idleMs = options.idleMs;
    const listening = this.#listening ?? await this.#listen();
    this.#current = run;
    this.#restart();
    let done = false;
    const close = (): void => {
      if (done) return;
      done = true;
      if (this.#current === run) {
        this.#stop();
        return;
      }
      settle();
    };
    return { origin: listening.origin, closed, close };
  }

  async #listen(): Promise<{ readonly server: Server; readonly origin: string }> {
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
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, LOOPBACK, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    this.#listening = { server, origin: `http://${LOOPBACK}:${port}` };
    return this.#listening;
  }

  /** The newest run ends, and with it the listener: nothing is left to answer. */
  #stop(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
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

  #restart(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#stop(), this.#idleMs);
    this.#timer.unref();
  }
}

async function answer(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  handle: (request: LocalRequest) => Promise<LocalResponse>,
  maxBody: number,
): Promise<void> {
  const send = (response: LocalResponse): void => {
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
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += (chunk as Buffer).length;
      if (size > maxBody) {
        send({ status: 413, type: 'text/plain; charset=utf-8', body: 'Too large.' });
        incoming.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const url = incoming.url ?? '/';
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(incoming.headers)) headers[name] = Array.isArray(value) ? value.join(', ') : value;
    send(await handle({ method: incoming.method ?? 'GET', path: url.split('?')[0] ?? '/', headers, body: Buffer.concat(chunks).toString('utf8') }));
  } catch {
    if (!outgoing.headersSent) send({ status: 500, type: 'text/plain; charset=utf-8', body: 'Something went wrong.' });
  }
}
