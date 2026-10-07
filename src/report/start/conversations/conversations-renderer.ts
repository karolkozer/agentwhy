// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Renderer } from '../../../shared/renderer.ts';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.ts';
import { inLanguages } from '../../render/report-copy.ts';
import { appSidebar } from '../../render/ui/app-sidebar.ts';
import { ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../../render/ui/ask-panel.ts';
import { pageShell } from '../../render/ui/page-shell.ts';
import { appNav, sidebarProject, type AppLinks } from '../app-nav.ts';
import { projectsWindows } from '../projects/projects-window.ts';
import type { SessionIndex } from '../session-index.ts';
import { periodSection, PERIOD_PAGE_LIBRARIES, PERIOD_PAGE_SCRIPTS, PERIOD_PAGE_STYLES, TECH_TOGGLE } from './period-section.ts';
import { emptyWeek, EMPTY_WEEK_STYLE } from './empty-week.ts';
import { filesWindow, FILES_WINDOW_SCRIPTS, FILES_WINDOW_STYLES } from './files-window.ts';
import { weekTitle, weekView } from './week-view.ts';
import { conversationWeeks } from './weeks.ts';
import { pageNotice } from '../page-notice.ts';
import { scopeSwitch } from '../computer-scope-switch.ts';

/**
 * The Conversations page `start` writes as `index.html` (`for-people-who-build-with-ai.md` §3 A; design file
 * *agentwhy Sessions v2*): one week at a time, the answer first, then where to start, then the days, then what needs
 * attention and, folded, the rest. It is made of the UI kit's pieces and adds only what is its own - the week view,
 * the table's columns and the script that switches weeks (`.ai/plans/2026-09-23-conversations-redesign.md`).
 */
export class ConversationsRenderer implements Renderer<SessionIndex> {
  readonly #links: AppLinks;

  constructor(links: AppLinks) {
    this.#links = links;
  }

  render(index: SessionIndex): string {
    const { weeks } = conversationWeeks(index);

    return pageShell({
      // which-project V2, V11: the person's projects, opened from the sidebar's card.
      windows: projectsWindows(index, this.#links.onboarding),
      title: 'conv.title',
      // nothing-updates-by-itself U4: the update notice, where the project's hooks run an older release.
      ...pageNotice(index),
      // GD21: on the computer's page, Outside projects | All, at the head of the content.
      ...scopeSwitch(index),
      policy: INDEX_CONTENT_SECURITY_POLICY_META,
      styles: [...PERIOD_PAGE_STYLES, ...FILES_WINDOW_STYLES, EMPTY_WEEK_STYLE, ASK_PANEL_STYLE],
      libraries: PERIOD_PAGE_LIBRARIES,
      scripts: [...PERIOD_PAGE_SCRIPTS, ...FILES_WINDOW_SCRIPTS, ASK_PANEL_SCRIPT],
      sidebar: appSidebar({
        ...sidebarProject(index),
        home: this.#links.conversations,
        items: appNav(index, 'conversations', this.#links),
      }),
      main: TECH_TOGGLE + weeks.map((week, at) => periodSection(weeks, at, index, {
        kind: 'week',
        eyebrow: weekTitle(week),
        view: weekView(weeks, at),
        zero: 'conv.hero.fact.zero',
        clean: inLanguages((t) => t('conv.clean.title')),
        whole: 'conv.day.clear',
        lists: true,
        ...(week.conversations.length === 0 ? { empty: emptyWeek(weeks, at, index, this.#links) } : {}),
      })).join('') + filesWindow(),
    });
  }
}
