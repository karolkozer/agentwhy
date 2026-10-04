// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { NavItem } from '../render/ui/app-sidebar.ts';
import { conversationWeeks } from './conversations/weeks.ts';
import { PROJECTS_WINDOW } from './projects/projects-window.ts';
import type { SessionIndex } from './session-index.ts';

/** Where the pages the sidebar leads to are. Chosen in the composition root, with the pages that draw them. */
export interface AppLinks {
  readonly conversations: string;
  readonly toFix: string;
  readonly month: string;
  readonly settings: string;
  /** The onboarding, where a run writes it (`.ai/specs/2026-09-24-onboarding.md` W25): Settings leads back to it. */
  readonly onboarding?: string;
}

/**
 * The sidebar's pages, the same on every page `start` writes, with the counts computed once: every conversation, and
 * every file still to fix (O10). Settings is this machine's, so a shared page does not offer it
 * (`worth-running-every-day` R48); nor does a page of the home directory, which is no project to set up
 * (`which-project.md` V7, V8).
 */
export function appNav(index: SessionIndex, active: 'conversations' | 'to-fix' | 'month' | 'settings', links: AppLinks): NavItem[] {
  const { total, toFix } = conversationWeeks(index);
  return [
    { name: 'app.nav.conversations', href: links.conversations, count: total, ...(active === 'conversations' ? { active: true } : {}) },
    { name: 'app.nav.toFix', href: links.toFix, count: toFix, countTone: 'coral', ...(active === 'to-fix' ? { active: true } : {}) },
    { name: 'app.nav.month', href: links.month, ...(active === 'month' ? { active: true } : {}) },
    ...(index.settings === undefined || index.shared || index.notAProject !== undefined
      ? []
      : [{ name: 'app.nav.settings', href: links.settings, ...(active === 'settings' ? { active: true } : {}) }]),
  ];
}

/** The project's folder name, as the sidebar shows it. */
export function projectName(path: string): string {
  return path.split(/[\\/]/).filter((part) => part !== '').pop() ?? path;
}

/**
 * What the sidebar's card says about the project, the same on every page `start` writes: its folder's name and where
 * it is (`.ai/specs/2026-09-27-which-project.md` V1). Nothing on a shared page, which names no project.
 */
export function sidebarProject(index: SessionIndex): { readonly project?: string; readonly place?: string; readonly projectsWindow?: string } {
  if (index.project === undefined) return {};
  return {
    project: projectName(index.project),
    ...(index.place === undefined ? {} : { place: index.place }),
    // which-project V2: the card opens the person's projects, where the page carries them.
    ...(index.projects === undefined ? {} : { projectsWindow: PROJECTS_WINDOW }),
  };
}
