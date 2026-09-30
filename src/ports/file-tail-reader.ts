/** The end of a file. Session titles need this and nothing more: a title is rewritten as a session goes on. */
export interface FileTailReader {
  /**
   * Up to `bytes` bytes from the end of the file, decoded as UTF-8, or the whole file when it is shorter. The first
   * line is usually cut and the last may still be being written, so a caller parses whole records only. Throws
   * FileAccessError when the file does not exist or cannot be read.
   */
  readTail(path: string, bytes: number): Promise<string>;
}
