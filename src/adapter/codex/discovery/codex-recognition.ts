import type { Recognition } from '../../../core/session-format.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { CodexSessionDiscovery } from './codex-session-discovery.ts';

/**
 * Whether an input is Codex's (X2): a file whose first line is a Codex `session_meta`, or a folder holding at least one
 * such rollout. Only first lines are read, and a folder's only until the first rollout recognised.
 */
export async function recogniseCodex(discovery: CodexSessionDiscovery, directories: DirectoryReader, input: string): Promise<Recognition> {
  let kind;
  try {
    kind = await directories.kindOf(input);
  } catch (error) {
    if (error instanceof FileAccessError) return 'unavailable';
    throw error;
  }
  if (kind === 'directory') return (await discovery.holdsSession(input)) ? 'recognised' : 'unknown';
  const read = await discovery.readHeader(input);
  return read.kind === 'recognised' ? 'recognised' : read.kind === 'unknown' ? 'unknown' : 'unavailable';
}
