import { conversationWeeks } from './conversations/weeks.js';
import { PROJECTS_WINDOW } from './projects/projects-window.js';
/**
 * The sidebar's pages, the same on every page `start` writes, with the counts computed once: every conversation, and
 * every file still to fix (O10). Settings is this machine's, so a shared page does not offer it
 * (`worth-running-every-day` R48); nor does a page of the home directory, which is no project to set up
 * (`which-project.md` V7, V8).
 */
export function appNav(index, active, links) {
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
export function projectName(path) {
    return path.split(/[\\/]/).filter((part) => part !== '').pop() ?? path;
}
/**
 * What the sidebar's card says about the project, the same on every page `start` writes: its folder's name and where
 * it is (`.ai/specs/2026-09-27-which-project.md` V1). Nothing on a shared page, which names no project.
 */
export function sidebarProject(index) {
    // GD15: the computer's page says so on its card, which opens the projects window as a project's card does.
    if (index.scope === 'computer')
        return { computer: true, ...(index.projects === undefined ? {} : { projectsWindow: PROJECTS_WINDOW }) };
    if (index.project === undefined)
        return {};
    return {
        project: projectName(index.project),
        ...(index.place === undefined ? {} : { place: index.place }),
        // which-project V2: the card opens the person's projects, where the page carries them.
        ...(index.projects === undefined ? {} : { projectsWindow: PROJECTS_WINDOW }),
    };
}
