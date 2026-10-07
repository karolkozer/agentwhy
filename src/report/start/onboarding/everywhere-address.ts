// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The address of the onboarding's computer-wide *Files* step (`.ai/specs/2026-10-05-protected-everywhere.md` G10):
 * `onboarding.html#everywhere` opens there - the projects window's way to everything on this computer. A module of its
 * own, with no imports: the projects window is drawn on every page, and reaching it through the onboarding's script
 * closed a loop of imports that left one of them unread when the other ran.
 */
export const EVERYWHERE_STEP = 'everywhere';

/**
 * What a page asks `api/switch-project` for to show the computer's own view (`everything-on-this-computer.md` step 4,
 * GD15): the home folder's run, which is the computer's. No project's id can be it - a project is listed under its
 * folder's encoded name, which begins with a separator.
 */
export const COMPUTER_SWITCH = ':computer';
