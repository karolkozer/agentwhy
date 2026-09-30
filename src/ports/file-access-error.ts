export type AccessFailure = 'not-found' | 'unreadable';

/** The only failure a file port reports. Implementations translate their own errors into it. */
export class FileAccessError extends Error {
  readonly failure: AccessFailure;
  readonly path: string;

  constructor(failure: AccessFailure, path: string, options?: ErrorOptions) {
    super(`${failure}: ${path}`, options);
    this.name = 'FileAccessError';
    this.failure = failure;
    this.path = path;
  }
}
