import type { FolderChooser } from '../ports/folder-chooser.ts';
import { chosenFolder, runProgram, type RunScript } from './folder-window.ts';

/** What the script exits with when the person closes the window with Cancel. */
const CANCELLED = 3;

/** Text as the script receives it: base64 of its UTF-8, so nothing the page says is ever read as PowerShell. */
function encoded(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * The script: Windows Forms' folder window, headed by the prompt and opened at the folder given where it is there, owned
 * by an unseen window that stays on top, so it is not opened behind the browser that asked for it. The folder chosen is
 * written as base64 of its UTF-8, since the console's code page would change a name that is not plain ASCII; Cancel exits
 * with 3, and anything that went wrong is written after `failed:` - an error PowerShell wrote itself would reach stderr as
 * serialized XML, which says nothing to a person.
 */
function script(prompt: string, startIn: string | undefined): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'try {',
    '  Add-Type -AssemblyName System.Windows.Forms',
    '  [System.Windows.Forms.Application]::EnableVisualStyles()',
    `  $prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(prompt)}'))`,
    `  $start = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(startIn ?? '')}'))`,
    '  $owner = New-Object System.Windows.Forms.Form',
    '  $owner.TopMost = $true',
    '  $owner.ShowInTaskbar = $false',
    '  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '  $dialog.Description = $prompt',
    '  $dialog.ShowNewFolderButton = $true',
    "  if ($start -ne '' -and (Test-Path -LiteralPath $start -PathType Container)) { $dialog.SelectedPath = $start }",
    '  $result = $dialog.ShowDialog($owner)',
    '  $owner.Dispose()',
    `  if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit ${CANCELLED} }`,
    '  [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)))',
    '  exit 0',
    '} catch {',
    "  [Console]::Out.Write('failed:' + $_.Exception.Message)",
    '  exit 1',
    '}',
  ].join('\n');
}

/**
 * The folder window of Windows (`.ai/specs/2026-09-27-which-project.md` V12; VD3 amended 2026-09-28: "write it for Windows
 * too"), opened through Windows PowerShell, which every Windows 10 and 11 has. The script travels as `-EncodedCommand` -
 * UTF-16 in base64, as PowerShell reads it - and the prompt and the folder it starts in inside it as base64 too, so
 * nothing the page sent is spliced into code.
 *
 * VB7, not measured: whether the window comes in front of the browser, how long PowerShell takes to open it, and what
 * a folder with a name that is not plain ASCII comes back as. WSL is not this: there the platform is Linux, and no window
 * is offered.
 */
export class PowershellFolderChooser implements FolderChooser {
  readonly available: boolean;
  readonly #run: RunScript;

  constructor(platform: string, run: RunScript = (args) => runProgram('powershell.exe', args)) {
    this.available = platform === 'win32';
    this.#run = run;
  }

  async choose(prompt: string, startIn?: string): Promise<{ readonly chosen: string } | { readonly cancelled: true } | { readonly failed: string }> {
    if (!this.available) return { failed: 'This computer has no folder window agentwhy can open.' };
    let answer;
    try {
      answer = await this.#run(['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(script(prompt, startIn), 'utf16le').toString('base64')]);
    } catch (error) {
      return { failed: error instanceof Error ? error.message : String(error) };
    }
    if (answer.code === CANCELLED) return { cancelled: true };
    const written = answer.stdout.trim();
    if (answer.code !== 0) return { failed: written.startsWith('failed:') ? written.slice('failed:'.length).trim() || 'The folder window could not open.' : answer.stderr.trim() || 'The folder window could not open.' };
    const path = Buffer.from(written, 'base64').toString('utf8');
    return path === '' ? { cancelled: true } : chosenFolder(path);
  }
}
