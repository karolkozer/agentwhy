import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.js';
import { inLanguages } from '../../render/report-copy.js';
import { appSidebar } from '../../render/ui/app-sidebar.js';
import { ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../../render/ui/ask-panel.js';
import { callout, CALLOUT_STYLE } from '../../render/ui/callout.js';
import { FILE_CHIP_STYLE } from '../../render/ui/file-chip.js';
import { pageShell } from '../../render/ui/page-shell.js';
import { appNav, sidebarProject } from '../app-nav.js';
import { projectsWindows } from '../projects/projects-window.js';
import { periodSection, PERIOD_PAGE_LIBRARIES, PERIOD_PAGE_SCRIPTS, PERIOD_PAGE_STYLES, TECH_TOGGLE } from './period-section.js';
import { emptyWeek, EMPTY_WEEK_STYLE } from './empty-week.js';
import { oftenSection, OFTEN_STYLE } from './often-section.js';
import { filesWindow, FILES_WINDOW_SCRIPTS, FILES_WINDOW_STYLES } from './files-window.js';
import { weekTitle, weekView } from './week-view.js';
import { conversationWeeks } from './weeks.js';
import { pageNotice } from '../page-notice.js';
import { scopeSwitch } from '../computer-scope-switch.js';
/**
 * The Conversations page `start` writes as `index.html` (`for-people-who-build-with-ai.md` §3 A; design file
 * *agentwhy Sessions v2*): one week at a time, the answer first, then where to start, then the days, then what needs
 * attention and, folded, the rest. It is made of the UI kit's pieces and adds only what is its own - the week view,
 * the table's columns and the script that switches weeks (`.ai/plans/2026-09-23-conversations-redesign.md`).
 */
const VS_CODE_NOTE_STYLE = '.conv-vscode{margin:28px 0 0}';
/**
 * `what-vs-code-copilot-wrote` VC6: the project's Copilot chats in VS Code are rows, read from the log VS Code keeps of
 * each; one whose log no row can read is not, and the page says so, in grey, under the list: nothing to do, only why it is
 * missing. Where agentwhy's check runs in Copilot, that a block holds there too.
 */
function vsCodeNote(index) {
    const n = index.vsCodeChats;
    if (n === undefined || n === 0)
        return '';
    const blocked = index.settings?.hooks?.copilot === 'on';
    return '<div class="conv-vscode">' + callout({ tone: 'grey', body: inLanguages((t) => t('conv.vscode', { n }) + (blocked ? ' ' + t('conv.vscode.blocked') : '')) }) + '</div>';
}
export class ConversationsRenderer {
    #links;
    constructor(links) {
        this.#links = links;
    }
    render(index) {
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
            styles: [...PERIOD_PAGE_STYLES, ...FILES_WINDOW_STYLES, EMPTY_WEEK_STYLE, ASK_PANEL_STYLE, CALLOUT_STYLE, VS_CODE_NOTE_STYLE, FILE_CHIP_STYLE, OFTEN_STYLE],
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
            })).join('') + oftenSection(index) + vsCodeNote(index) + filesWindow(),
        });
    }
}
