/** Writing files. The report needs one; `start` needs a directory to put several in. */
export interface FileWriter {
  /** Throws FileAccessError when the file cannot be written. */
  writeText(path: string, text: string): Promise<void>;
  /** Creates the directory and any parent it lacks. Throws FileAccessError when it cannot be created. */
  ensureDirectory(path: string): Promise<void>;
}
