// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { realpath } from 'node:fs/promises';
import type { ChosenPlace, PlaceChooser, PlaceKind } from '../ports/place-chooser.ts';
import { runProgram, type RunScript } from './folder-window.ts';

/** What AppleScript answers when the person closes the window with Cancel. */
const MAC_CANCELLED = /-128\b/;

/**
 * IP2, IPB12: the Mac's `NSOpenPanel` through JavaScript for Automation, choosing files and folders together, several at
 * once. Measured by the maintainer on 2026-10-07: started from a terminal the window was not seen at all; made an
 * accessory app (no Dock icon), brought forward, and lifted to the floating level above the browser, it opened, and both
 * kinds were chosen together. The prompt and the folder it starts in travel as arguments, never inside the source. The
 * answer is JSON: each path and whether it is a folder.
 */
const MAC_SCRIPT = [
  'function run(argv) {',
  "  ObjC.import('Cocoa');",
  '  const app = $.NSApplication.sharedApplication;',
  '  app.setActivationPolicy(1);',
  '  app.activateIgnoringOtherApps(true);',
  '  const panel = $.NSOpenPanel.openPanel;',
  '  panel.setCanChooseFiles(true);',
  '  panel.setCanChooseDirectories(true);',
  '  panel.setAllowsMultipleSelection(true);',
  '  panel.setMessage(argv[0]);',
  '  panel.setLevel(3);',
  '  if (argv[1]) panel.setDirectoryURL($.NSURL.fileURLWithPath(argv[1]));',
  '  if (Number(panel.runModal) !== 1) return "cancelled";',
  '  const urls = panel.URLs; const chosen = [];',
  '  for (let i = 0; i < urls.count; i++) { const url = urls.objectAtIndex(i); chosen.push({ path: url.path.js, folder: url.hasDirectoryPath }); }',
  '  return JSON.stringify(chosen);',
  '}',
].join('\n');

/** Text as PowerShell receives it: base64 of its UTF-8, so nothing the page says is ever read as PowerShell. */
function encoded(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** What the Windows script exits with when the person closes the window with Cancel. */
const WINDOWS_CANCELLED = 3;

/**
 * IP2 on Windows, not measured (IPB13, VB7): a file window choosing several, or a folder window choosing one - Windows'
 * own windows do not mix the two. Owned by an unseen window that stays on top, as the folder window is. The answer is
 * JSON in base64 of its UTF-8, since the console's code page would change a name that is not plain ASCII.
 */
function windowsScript(prompt: string, kind: 'files' | 'folder', startIn: string | undefined): string {
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
    ...(kind === 'files'
      ? [
        '  $dialog = New-Object System.Windows.Forms.OpenFileDialog',
        '  $dialog.Title = $prompt',
        '  $dialog.Multiselect = $true',
        "  if ($start -ne '' -and (Test-Path -LiteralPath $start -PathType Container)) { $dialog.InitialDirectory = $start }",
        '  $result = $dialog.ShowDialog($owner)',
        '  $owner.Dispose()',
        `  if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit ${WINDOWS_CANCELLED} }`,
        '  $chosen = @($dialog.FileNames | ForEach-Object { @{ path = $_; folder = $false } })',
      ]
      : [
        '  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        '  $dialog.Description = $prompt',
        "  if ($start -ne '' -and (Test-Path -LiteralPath $start -PathType Container)) { $dialog.SelectedPath = $start }",
        '  $result = $dialog.ShowDialog($owner)',
        '  $owner.Dispose()',
        `  if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit ${WINDOWS_CANCELLED} }`,
        '  $chosen = @(@{ path = $dialog.SelectedPath; folder = $true })',
      ]),
    '  [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $chosen -Compress))))',
    '  exit 0',
    '} catch {',
    "  [Console]::Out.Write('failed:' + $_.Exception.Message)",
    '  exit 1',
    '}',
  ].join('\n');
}

/** The places a window answered, each with every link followed; one that is not there any more is left out. */
async function placesFrom(json: string): Promise<{ readonly chosen: readonly ChosenPlace[] } | { readonly cancelled: true } | { readonly failed: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { failed: 'The window answered something that is not a list of places.' };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const chosen: ChosenPlace[] = [];
  for (const one of list) {
    if (typeof one !== 'object' || one === null || typeof (one as { path?: unknown }).path !== 'string') continue;
    const path = await realpath((one as { path: string }).path).catch(() => undefined);
    if (path !== undefined) chosen.push({ path, folder: (one as { folder?: unknown }).folder === true });
  }
  return chosen.length === 0 ? { cancelled: true } : { chosen };
}

/**
 * The system's own window for choosing places (IP2): the Mac's, files and folders together; Windows', one kind at a time.
 * Elsewhere there is no window this code knows, and none is offered - a place is typed instead.
 */
export class SystemPlaceChooser implements PlaceChooser {
  readonly kinds?: 'both' | 'separate';
  readonly #platform: string;
  readonly #run: RunScript;

  constructor(platform: string, run?: RunScript) {
    this.#platform = platform;
    if (platform === 'darwin') this.kinds = 'both';
    else if (platform === 'win32') this.kinds = 'separate';
    this.#run = run ?? ((args) => runProgram(platform === 'win32' ? 'powershell.exe' : 'osascript', args));
  }

  async choose(prompt: string, kind: PlaceKind, startIn?: string): Promise<{ readonly chosen: readonly ChosenPlace[] } | { readonly cancelled: true } | { readonly failed: string }> {
    if (this.kinds === undefined) return { failed: 'This computer has no window agentwhy can open: type the place instead.' };
    try {
      if (this.#platform === 'darwin') {
        const answer = await this.#run(['-l', 'JavaScript', '-e', MAC_SCRIPT, prompt, ...(startIn === undefined ? [] : [startIn])]);
        if (answer.code !== 0) return MAC_CANCELLED.test(answer.stderr) ? { cancelled: true } : { failed: answer.stderr.trim() || 'The window could not open.' };
        const out = answer.stdout.trim();
        return out === '' || out === 'cancelled' ? { cancelled: true } : placesFrom(out);
      }
      const answer = await this.#run(['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(windowsScript(prompt, kind === 'folder' ? 'folder' : 'files', startIn), 'utf16le').toString('base64')]);
      if (answer.code === WINDOWS_CANCELLED) return { cancelled: true };
      const written = answer.stdout.trim();
      if (answer.code !== 0) return { failed: written.startsWith('failed:') ? written.slice('failed:'.length).trim() || 'The window could not open.' : answer.stderr.trim() || 'The window could not open.' };
      return placesFrom(Buffer.from(written, 'base64').toString('utf8'));
    } catch (error) {
      return { failed: error instanceof Error ? error.message : String(error) };
    }
  }
}
