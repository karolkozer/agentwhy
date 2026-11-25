/** The only failure a file port reports. Implementations translate their own errors into it. */
export class FileAccessError extends Error {
    failure;
    path;
    constructor(failure, path, options) {
        super(`${failure}: ${path}`, options);
        this.name = 'FileAccessError';
        this.failure = failure;
        this.path = path;
    }
}
