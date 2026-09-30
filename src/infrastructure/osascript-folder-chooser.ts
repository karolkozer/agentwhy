import type { FolderChooser } from '../ports/folder-chooser.ts';
import { chosenFolder, runProgram, type RunScript } from './folder-window.ts';

export type { RunScript } from './folder-window.ts';

/** What AppleScript answers when the person closes the window with Cancel. */
const CANCELLED = /-128\b/;

/**
 * The script: forward through AppKit, which is quick (VB1), then Standard Additions' folder window, headed by the first
 * argument and opened at the second where there is one. Its answer is the folder's path.
 */
const CHOOSE_FOLDER = [
  'function run(argv) {',
  "  ObjC.import('AppKit');",
  '  $.NSApplication.sharedApplication.activateIgnoringOtherApps(true);',
  '  const app = Application.currentApplication();',
  '  app.includeStandardAdditions = true;',
  '  const options = { withPrompt: argv[0] };',
  '  if (argv[1]) options.defaultLocation = Path(argv[1]);',
  '  return app.chooseFolder(options).toString();',
  '}',
].join('\n');

/**
 * The folder window of macOS, opened through `osascript` (`.ai/specs/2026-09-27-which-project.md` V12, VD3), in front
 * of the browser that asked for it. The prompt and the folder it starts in travel as arguments to the script, never inside
 * its source, as `OsNotifier`'s words do. The answer is the folder's path with every link followed. Elsewhere there is no
 * window this code has measured, and none is offered.
 *
 * VB1, measured 2026-09-28 on the maintainer's computer, from the moment `osascript` is started to the moment its window
 * is on screen: AppleScript's `activate` then `choose folder` took 2.5 s and the window was still not in front; without
 * `activate` 0.5 s, behind the browser; JavaScript for Automation bringing itself forward through AppKit, 0.6 s and in
 * front. It is the last. The window starts in the folder it is given: left to itself it opens where it was last left,
 * which on that computer is a folder iCloud keeps.
 */
export class OsascriptFolderChooser implements FolderChooser {
  readonly available: boolean;
  readonly #run: RunScript;

  constructor(platform: string, run: RunScript = (args) => runProgram('osascript', args)) {
    this.available = platform === 'darwin';
    this.#run = run;
  }

  async choose(prompt: string, startIn?: string): Promise<{ readonly chosen: string } | { readonly cancelled: true } | { readonly failed: string }> {
    if (!this.available) return { failed: 'This computer has no folder window agentwhy can open.' };
    let answer;
    try {
      answer = await this.#run(['-l', 'JavaScript', '-e', CHOOSE_FOLDER, prompt, ...(startIn === undefined ? [] : [startIn])]);
    } catch (error) {
      return { failed: error instanceof Error ? error.message : String(error) };
    }
    if (answer.code !== 0) return CANCELLED.test(answer.stderr) ? { cancelled: true } : { failed: answer.stderr.trim() || 'The folder window could not open.' };
    const path = answer.stdout.trim();
    return path === '' ? { cancelled: true } : chosenFolder(path);
  }
}
