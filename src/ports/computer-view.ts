// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What the computer's page shows (`.ai/specs/2026-10-05-protected-everywhere.md` GD20, GD21, GD27, GD28): the
 * conversations no set-up project's view shows - `outside` - or the set-up projects' own - `projects`. Each conversation
 * is in one of the two, whole.
 */
export type ComputerScope = 'outside' | 'projects';

export const COMPUTER_SCOPES: readonly ComputerScope[] = ['outside', 'projects'];

/**
 * GD21: the person's last choice between the two, kept by agentwhy in their own folder - a served page's address changes
 * its port every run, so a browser would forget it - and the default the next time.
 */
export interface ComputerView {
  /** `undefined` where nothing was chosen yet, or the record cannot be read: the page then shows GD21's first default. */
  read(): Promise<ComputerScope | undefined>;
  /** `false` where it could not be written; the page says so, and shows what it showed. */
  write(scope: ComputerScope): Promise<boolean>;
}
