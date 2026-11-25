import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.js';
import { appSidebar } from '../../render/ui/app-sidebar.js';
import { pageShell } from '../../render/ui/page-shell.js';
import { appNav, sidebarProject } from '../app-nav.js';
import { projectsWindows } from '../projects/projects-window.js';
import { filesWindow, FILES_WINDOW_SCRIPTS, FILES_WINDOW_STYLES } from '../conversations/files-window.js';
import { periodSection, PERIOD_PAGE_LIBRARIES, PERIOD_PAGE_SCRIPTS, PERIOD_PAGE_STYLES } from '../conversations/period-section.js';
import { monthTitle, monthView, MONTH_VIEW_STYLE } from './month-view.js';
import { conversationMonths } from './months.js';
import { pageNotice } from '../page-notice.js';
import { scopeSwitch } from '../computer-scope-switch.js';
/**
 * This month, written as `month.html` beside the index (`.ai/plans/2026-09-23-month-redesign.md`): the Conversations
 * page read a month at a time: the same answer and the same day tiles, in the same words, laid out as a calendar,
 * each day with work opening in a window that lists its conversations, and each of those opening every file it
 * reached in the window Conversations opens them in.
 */
export class MonthRenderer {
    #links;
    constructor(links) {
        this.#links = links;
    }
    render(index) {
        const months = conversationMonths(index);
        return pageShell({
            // which-project V2, V11: the person's projects, opened from the sidebar's card.
            windows: projectsWindows(index, this.#links.onboarding),
            title: 'month.title',
            // nothing-updates-by-itself U4: the update notice, where the project's hooks run an older release.
            ...pageNotice(index),
            // GD21: on the computer's page, Outside projects | All, at the head of the content.
            ...scopeSwitch(index),
            policy: INDEX_CONTENT_SECURITY_POLICY_META,
            styles: [...PERIOD_PAGE_STYLES, ...FILES_WINDOW_STYLES, MONTH_VIEW_STYLE],
            libraries: PERIOD_PAGE_LIBRARIES,
            scripts: [...PERIOD_PAGE_SCRIPTS, ...FILES_WINDOW_SCRIPTS],
            sidebar: appSidebar({
                ...sidebarProject(index),
                home: this.#links.conversations,
                items: appNav(index, 'month', this.#links),
            }),
            main: months.map((month, at) => periodSection(months, at, index, {
                kind: 'month',
                eyebrow: monthTitle(month),
                view: monthView(months, at, index.widen, !index.shared),
                zero: 'month.hero.zero',
                // A month is read for its shape: it opens whole (T4), and a day opens in a window (T5). Nothing is drawn under
                // the calendar - no guide card (T7), no lists (T8): what a day holds is in its window.
                lists: false,
            })).join('') + filesWindow(),
        });
    }
}
