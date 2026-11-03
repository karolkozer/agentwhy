// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A path that starts at a drive - `C:\Users\someone\lessons\notes.md` - as Claude Code on Windows records the file a tool
 * was handed and the folder a call ran in (`2026-10-12-windows-paths.md` WPB1, measured on 2.1.295). A rule is written
 * with `/` (`**` + `/notes.md`), so such a path is matched, and compared with the project's folder, in its form with `/`
 * (WP1, WP2). Without it a `Read` of a blocked file that a deny rule refused was "Nothing private", and a tracked file read
 * whole was never said in the chat.
 */
const AT_A_DRIVE = /^[A-Za-z]:[\\/]/;

export function startsAtDrive(path: string): boolean {
  return AT_A_DRIVE.test(path);
}

/**
 * A path that starts at a drive, with `/` between its parts and its drive letter in capitals: `c:\a` and `C:/a` are one
 * folder to Windows. Every other path as written - on macOS and Linux a backslash is part of a name, or an escape
 * (`grep '\.env'`), and is never read as a separator.
 */
export function withSlashes(path: string): string {
  return startsAtDrive(path) ? path.charAt(0).toUpperCase() + path.slice(1).replaceAll('\\', '/') : path;
}

/**
 * Whether two folders are one (WP2, WP5): two at a drive whatever their separators and case, as Windows names them - the
 * VS Code panels record `c:\…` where a terminal is in `C:\…` (WPB7, WPB8). Any other pair as written.
 */
export function sameFolder(a: string, b: string): boolean {
  return startsAtDrive(a) && startsAtDrive(b) ? withSlashes(a).toLowerCase() === withSlashes(b).toLowerCase() : a === b;
}
