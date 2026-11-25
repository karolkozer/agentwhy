// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { withoutOpenCall } from '../core/without-open-call.js';
import { basename, join } from 'node:path';
import { withProjects } from '../core/policy/another-project.js';
import { rulesOfConversation } from './rules-elsewhere.js';
import { displayPath, insideProject } from '../core/project-root.js';
import { withSlashes } from '../core/drive-path.js';
import { sessionKey } from '../core/session-catalogue.js';
import { FileAccessError } from '../ports/file-access-error.js';
import { fileStamp } from '../shared/file-stamp.js';
import { buildReport, writtenNamesOf } from './build-report.js';
import { actionsOf } from './check/session-actions.js';
import { silentTrait } from './gap-reasons.js';
import { fileStory } from './render/report-page/file-story.js';
import { listedFiles } from './render/report-page/files.js';
import { choosePolicy, policyRefusal, projectOfSettings } from './choose-policy.js';
import { computerRules, heldDenyRules } from './project-rules.js';
import { refuseProjectAbove } from '../adapter/claude-code/settings/refuse-project.js';
/** Reads a session, decides under which policy to read it, and renders what can be said. */
export class SessionReport {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        // AYD12: asked to, the policy is chosen once the record says where its project is - after it is read.
        const fromRecord = options.rulesFromRecord === true && options.policy === undefined;
        const chosen = options.policy !== undefined
            ? { policy: options.policy }
            : fromRecord ? undefined : await choosePolicy(options, this.#dependencies.files, this.#dependencies.tell, this.#dependencies.home, this.#dependencies.workingDirectory);
        if (chosen !== undefined && 'errors' in chosen)
            return { outcome: 'policy-refused', output: policyRefusal(chosen.errors) };
        const { reader, createRedactor, createRenderer, htmlRenderer, files } = this.#dependencies;
        const input = await this.#input(options);
        if ('message' in input)
            return { outcome: 'no-session', output: input.message };
        const read = await reader.read(input.path);
        // X2: a file no AI's format recognises is read by none, and saying so beats a report of nothing.
        if (read.kind === 'unknown-format') {
            return { outcome: 'no-session', output: `No session to report on: ${input.path} is not a Claude Code, Codex or Copilot session.\n` };
        }
        const model = options.withoutCall === undefined ? read.model : withoutOpenCall(read.model, options.withoutCall);
        // AYD12: the folder this run's rules are read from - the record's root where asked and known, else this run's own.
        const folder = fromRecord && model.projectRoot.kind === 'known' ? model.projectRoot.path : this.#dependencies.workingDirectory;
        const policy = chosen ?? (await choosePolicy(options, files, this.#dependencies.tell, this.#dependencies.home, folder));
        if ('errors' in policy)
            return { outcome: 'policy-refused', output: policyRefusal(policy.errors) };
        // `2026-10-11-the-rules-where-the-file-is.md` RW1: the folder the policy was chosen for, where *Blocked* is read too -
        // never the session's own recorded folder, which a conversation started elsewhere does not share with its rules.
        const named = options.policy === undefined && options.policyPath === undefined && options.settingsPath !== undefined ? projectOfSettings(options.settingsPath) : undefined;
        const rulesFrom = options.rulesFrom ?? named ?? folder;
        // RW7: each file read under the rules of the project it is in too, found from the paths the conversation named.
        const elsewhere = await rulesOfConversation(files, this.#dependencies.home, model, rulesFrom, folder, {
            ...(options.walked === undefined ? {} : { seen: options.walked }),
            ...(options.mayHold === undefined ? {} : { mayHold: options.mayHold }),
        });
        const rules = withProjects(policy.policy, elsewhere.projects);
        // One redactor for the whole run, so the same value carries the same pseudonym in both renderings.
        const fingerprints = await this.#dependencies.fingerprints?.of(model.projectRoot, rules);
        const { names, home } = this.#dependencies;
        const absent = names === undefined ? undefined : await names.absent(writtenNamesOf(model, rules, home), model.projectRoot);
        const report = buildReport(model, rules, createRedactor(model.projectRoot, options.share), {
            share: options.share,
            projectRoot: model.projectRoot,
            home,
            ...(fingerprints === undefined ? {} : { fingerprints }),
            ...(absent === undefined || absent.size === 0 ? {} : { absent }),
        });
        // `--open` needs a file, so asking to see a report is asking to write one; without `--html` it is written
        // somewhere temporary rather than into whatever directory the command was run from.
        const htmlPath = options.htmlPath ??
            (options.open ? join(this.#dependencies.temporaryDirectory, this.#temporaryName(model.sessionId, model.provider, options.share)) : undefined);
        // M3: what the project's own settings deny now, read from the folder its rules were chosen for (RW1), so a row can
        // say whether Claude Code would refuse the file. Only a page is drawn from it; the report itself is the session's.
        // G15: the computer's own rules beside them, read at the same time.
        const [own, everywhere] = htmlPath === undefined
            ? [undefined, undefined]
            : await Promise.all([
                heldDenyRules(files, rulesFrom, this.#dependencies.home),
                computerRules(files, this.#dependencies.home, this.#dependencies.tell?.pathsFor(undefined).computer, rulesFrom),
            ]);
        // RW8: what each other project's rules block and track - written whole, and from the record's root where the project
        // lies under it, since a row's path is written from there.
        const root = model.projectRoot.kind === 'known' ? model.projectRoot.path : undefined;
        const projects = elsewhere.shown.map((one) => ({ name: basename(one.folder), blocked: fromRoot(one.blocked, root), told: fromRoot(one.told, root) }))
            .filter((one) => one.blocked.length > 0 || one.told.length > 0);
        const denied = own === undefined ? undefined : { ...own, patterns: [...own.patterns, ...projects.flatMap((one) => one.blocked)] };
        // CB10, CB16: read for a page about a Copilot conversation, never for a shared one, which says nothing of this machine.
        // For Copilot a block is `refuse` alone (CB10): its check follows a project's rules only where that project's Claude
        // Code settings run `refuse`, so deny rules with no `refuse` beside them keep nothing from Copilot. Found by the review
        // of step 4: such a page said *Protected* while Copilot's check let the read run. A file only the computer's rules hold
        // is kept from Copilot there too, and is said as not covered - less than is true, never more.
        const checkRuns = htmlPath === undefined || options.share || model.provider !== 'copilot' || this.#dependencies.copilotCheck === undefined
            ? undefined
            : (await this.#dependencies.copilotCheck()) === 'on' && (await refuseProjectAbove(files, rulesFrom, this.#dependencies.home)) !== undefined;
        const written = htmlPath === undefined
            ? undefined
            : await this.#write(htmlPath, htmlRenderer.render({
                report,
                withIndexLink: options.withIndexLink === true,
                ...(options.marks === undefined ? {} : { marks: options.marks }),
                ...(options.served === true ? { served: true } : {}),
                ...(options.project === undefined || options.share ? {} : { project: options.project }),
                ...(options.title === undefined || options.share ? {} : { title: options.title }),
                ...(options.heldIn === undefined || options.share ? {} : { heldIn: options.heldIn }),
                ...(denied === undefined ? {} : { denied: denied.patterns, ...(Object.keys(denied.at).length === 0 ? {} : { deniedAt: denied.at }) }),
                ...(everywhere === undefined || (everywhere.blocked.length === 0 && everywhere.told.length === 0) ? {} : { everywhere }),
                // RW8: a shared page names no project.
                ...(projects.length === 0 || options.share ? {} : { elsewhere: projects }),
                ...(this.#dependencies.timeZone === undefined ? {} : { timeZone: this.#dependencies.timeZone }),
                ...(checkRuns === undefined ? {} : { checkRuns }),
            }), files, whereFor(htmlPath, options.share, model.projectRoot));
        const shown = written?.ok === true && options.open ? await this.#show(htmlPath ?? '') : '';
        // A session that could not be read at all must not exit 0 with a report saying nothing was found: a typo in
        // a path would read as a clean bill of health. `doctor` exits 1 on the same input, and so does this.
        const unreadable = model.gaps.some((gap) => gap.kind === 'session-missing');
        const actions = actionsOf(report);
        const told = [...new Set([...actions.rotate.map((file) => file.path), ...actions.unknown.map(String)])];
        // Why the record is not whole, for the row that says it could not be checked fully (the maintainer, 2026-10-07):
        // the report's own reading, so the row and the page it opens decide F17 alike.
        // A record whose only gaps are its format's silence on thinking and permission settings is whole for the row, as for the
        // page (`gap-reasons.ts` NO_FINDING_RESTS_ON): Copilot's always is, and was otherwise "Couldn't check fully".
        const whole = model.completeness === 'complete' || model.gaps.every(silentTrait);
        const gaps = whole ? undefined : report.gapReasons;
        return {
            outcome: unreadable ? 'session-unreadable' : whole ? 'complete' : 'incomplete',
            tally: report.tally,
            actions,
            stories: { sessionId: report.scope.sessionId, files: new Map(told.map((path) => [path, fileStory(report, path)])) },
            reached: listedFiles(report),
            ...(report.fileCounts === undefined ? {} : { fileCounts: report.fileCounts }),
            ...(gaps === undefined ? {} : { gaps }),
            ...(gaps?.noResult === undefined ? {} : { openCalls: model.events.filter((event) => event.result === undefined).map((event) => event.id) }),
            ...(elsewhere.read.length === 0 ? {} : { elsewhere: elsewhere.read }),
            ...(written === undefined ? {} : { htmlWritten: written.ok }),
            /*
             * The summary comes out whatever else was asked for (§7.5) - unless silence was asked for by name. `--quiet`
             * leaves where the report is and takes the findings out, for the one caller that is not a person reading a
             * terminal: an agent running this because the person said yes to opening it (R19).
             */
            output: options.quiet === true
                // The blank line before it separated the message from a summary that is no longer there.
                ? `${written?.message ?? ''}${shown}`.replace(/^\n+/, '')
                : `${createRenderer(options).render(report)}${written?.message ?? ''}${shown}`,
        };
    }
    /**
     * Which session to read. Given one, that one; otherwise the newest of this project, named in the output so
     * nobody has to guess which session they are looking at.
     */
    async #input(options) {
        const { catalogue, workingDirectory } = this.#dependencies;
        if (options.input !== undefined) {
            // `agentwhy sessions` ends with "report --input <the id above>", so an id of this project is taken as the session
            // it names - matched whole, never as a prefix. Anything holding a separator, or not an id listed here, is a path.
            // A session is named by its key (`codex-…` for Codex), or by its bare id where only one AI holds that id.
            if (!/[\\/]/.test(options.input)) {
                const sessions = (await catalogue.list(workingDirectory)).sessions;
                const byKey = sessions.find((session) => sessionKey(session) === options.input);
                const byId = sessions.filter((session) => session.id === options.input);
                if (byKey !== undefined)
                    return { path: byKey.path };
                if (byId.length === 1 && byId[0] !== undefined)
                    return { path: byId[0].path };
                if (byId.length > 1) {
                    // Two AIs' sessions are told apart by their keys; two of one AI's - a copied file - only by their paths.
                    const ais = new Set(byId.map((session) => session.provider)).size;
                    return {
                        message: `${byId.length} sessions hold the id ${options.input}.\n` +
                            (ais > 1 ? 'Name it by its key, as agentwhy sessions lists it, or by its path.\n' : 'Name it by its path.\n'),
                    };
                }
            }
            return { path: options.input };
        }
        const listing = await catalogue.list(workingDirectory);
        const newest = listing.sessions[0];
        if (newest === undefined) {
            return {
                message: `No session of this project to report on.\nLooked in ${listing.directory}\nGive one with --input, or run: agentwhy sessions\n`,
            };
        }
        return { path: newest.path };
    }
    /**
     * Opening is best effort and never changes the outcome: a machine with no opener still has the file, and its
     * path has already been printed. Saying nothing happened beats a command that looks like it failed.
     */
    async #show(path) {
        return (await this.#dependencies.browser.open(path)) ? '' : `Nothing on this machine opened it.\n`;
    }
    /**
     * Whether the file is there, and what to tell the reader. The two are reported apart because a caller has to
     * act on the first: deciding from the message alone once meant opening a file that had not been written,
     * since there is a message either way.
     */
    async #write(path, html, files, where) {
        const place = where === undefined ? '; the shared view does not print where' : ` to ${where}`;
        try {
            await files.writeText(path, html);
            return { ok: true, message: `\nHTML report written${place}\n` };
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            // The analysis still stands; only the file did not get written, and saying so beats failing silently.
            return { ok: false, message: `\nThe HTML report could not be written${place}\n` };
        }
    }
    /**
     * A file shown and not kept. The full view names it after its session, so a second look finds the same file.
     * The shared view names it after the moment: a file name is printed, and in that view the id is not shown.
     */
    #temporaryName(sessionId, provider, share) {
        return share ? `agentwhy-shared-${fileStamp(this.#dependencies.now)}.html` : `agentwhy-${sessionKey({ id: sessionId, provider })}.html`;
    }
}
/**
 * Where a file went, as the view may say it. The full view says it as written. The shared view says it relative to
 * the project where the file is inside one, and not at all where it is not.
 *
 * **Corrected 2026-09-14 after a review:** `--share --open` printed the temporary file's absolute path, and the
 * file was named after the session - both things the shared view promises not to show.
 */
/**
 * RW8: another project's patterns as a row's path may be written - whole, and from the record's root where the project
 * lies under it (`<root>/lessons/**` + `/x` read as `lessons/**` + `/x`), since a path inside the root is shown from there.
 */
function fromRoot(patterns, root) {
    // `2026-10-12-windows-paths.md` WP1: a root at a drive with `/`, as another project's patterns are written.
    const base = root === undefined ? undefined : withSlashes(root).replace(/\/+$/, '');
    return patterns.flatMap((pattern) => (base !== undefined && pattern.startsWith(`${base}/`) ? [pattern, pattern.slice(base.length + 1)] : [pattern]));
}
function whereFor(path, share, root) {
    if (!share)
        return path;
    return insideProject(path, root) ? displayPath(path, root) : undefined;
}
