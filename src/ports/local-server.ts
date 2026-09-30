/** One request as the page's server sees it: nothing a handler has to parse from a socket. */
export interface LocalRequest {
  readonly method: string;
  /** The path, without the query. */
  readonly path: string;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}

export interface LocalResponse {
  readonly status: number;
  readonly type: string;
  readonly body: string;
  /**
   * What to do once the answer has been sent whole - closing the server a page was just moved away from
   * (`which-project.md` V14): closing before would cut the answer the page is waiting for.
   */
  readonly after?: () => void;
  /** Where the page is sent instead (a redirect): an address of the same origin. */
  readonly location?: string;
}

export interface Serving {
  /** `http://127.0.0.1:<port>` - the one origin requests are accepted from. */
  readonly origin: string;
  /** Settles when the server has stopped: idle for too long, or closed. */
  readonly closed: Promise<void>;
  close(): void;
}

/**
 * A server on the loopback address only, for the page `start` opened (`worth-running-every-day` R50-R54). It knows no
 * routes: every request goes to the handler, whose answer is sent as it is.
 */
export interface LocalServer {
  serve(handle: (request: LocalRequest) => Promise<LocalResponse>, options: { readonly idleMs: number; readonly maxBody: number }): Promise<Serving>;
}
