// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { onAMac, startsAtDrive, withSlashes } from '../drive-path.js';
import { matchesGlob } from './glob.js';
/**
 * The entry that protects this path, or undefined. An exception wins over every protecting pattern, so a path
 * someone deliberately excluded stays excluded however many rules would otherwise cover it.
 */
export function protectionOf(policy, written) {
    // `2026-10-12-windows-paths.md` WP1: a rule is written with `/`, and a path at a drive is matched in that form - Claude
    // Code on Windows hands `Read` `C:\…\notes.md`, which no `**` + `/notes.md` ever met.
    const path = withSlashes(written);
    // A directory is written both ways - `ls secrets` and `cat secrets/x` - while `**/secrets/**` only matches
    // the form with the separator. Both are tried, so how the command happened to be typed does not decide.
    const forms = path.endsWith('/') ? [path] : [path, `${path}/`];
    // G15: a block written for the whole computer is answered before any exception, so a project may add to what is
    // kept from the agent and never take away from it - a file somebody blocked on this computer stays blocked whether
    // or not a project's tell list or a policy file's `allowed` names it. Only an entry marked `everywhere` is read
    // this way; a project's own rules resolve exceptions first, exactly as they did.
    const computerWide = policy.protected.find((entry) => entry.everywhere === true && forms.some((form) => holds(entry, form)));
    if (computerWide !== undefined)
        return computerWide;
    // RW4: another project's block is answered next, as the computer's is - this policy's told list was written about its
    // own files, and its `**/note.md` would otherwise let through a `note.md` another project keeps from the agent. That
    // project's own exceptions, and they alone, lift it.
    const stands = (entry) => entry.project === undefined || entry.mode === 'tell' || !liftedIn(policy, entry.project, forms);
    const elsewhere = policy.protected.find((entry) => entry.project !== undefined && entry.mode !== 'tell' && forms.some((form) => holds(entry, form)) && stands(entry));
    if (elsewhere !== undefined)
        return elsewhere;
    if (forms.some((form) => policy.allowed.some((pattern) => matchesGlob(form, pattern, startsAtDrive(form)))))
        return undefined;
    return policy.protected.find((entry) => stands(entry) && forms.some((form) => holds(entry, form)));
}
/** RW4: whether another project's own exceptions - its `allowedIn`, or a told entry of its own - hold the path. */
function liftedIn(policy, project, forms) {
    const allowed = policy.allowedIn?.[project] ?? [];
    return forms.some((form) => allowed.some((pattern) => matchesGlob(form, pattern, startsAtDrive(form)))) ||
        policy.protected.some((entry) => entry.project === project && entry.mode === 'tell' && forms.some((form) => holds(entry, form)));
}
/**
 * FN14: whether an entry holds a path. One held in a folder (`at`) holds there alone - by the path from the folder
 * (`notes.md`, `./notes.md`) or by the whole path (`<at>/notes.md`) - never by its pattern anywhere: a rule for the
 * root's `notes.md` had blocked `docs/notes.md` too, and a told one had let a blocked `docs/notes.md` through (FNB26).
 */
export function holds(entry, written) {
    // WP1: asked directly as well - by a page's row and by `refuse`'s reach into a folder - so a path at a drive is matched
    // as `protectionOf` matches it.
    const path = withSlashes(written);
    // WP5: and in either case - Windows names `SECRET.TXT` and `secret.txt` one file, and Claude Code's own deny rule refused
    // both while this read the first as no rule's (WPB6). LC1: and so does a Mac's volume, for a rule LC4 reads so. Any other
    // path keeps its case.
    const caseless = startsAtDrive(path) || (onAMac(path) && namesInEitherCase(entry));
    if (entry.at === undefined)
        return matchesGlob(path, entry.pattern, caseless);
    const [fromFolder, whole] = heldGlobs(entry.pattern, entry.at);
    return matchesGlob(path.replace(/^(?:\.\/)+/, ''), fromFolder, caseless) || matchesGlob(path, whole, caseless);
}
const WILDCARD = /[*?[\]{}]/;
/** A part that names a dotted file or folder, as `.env*` and `.ssh` do: its first letters are its own. */
const DOTTED = /^\.[^.*?[\]{}]/;
const WITH_EXTENSION = /^[^*?[\]{}]*[^.*?[\]{}]\.[A-Za-z0-9]+$/;
const ANY_WITH_EXTENSION = /^\*\.[A-Za-z0-9]+$/;
/**
 * LC4: whether a rule is met in either case on a Mac - one for a dotted name (`.env*`, `.ssh/**`), for one file with an
 * extension (`customers.csv`), for every file of an extension (`*.pem`), or written whole from `/`. Any other keeps its
 * case: a wildcard inside a name holds everyday ones in other letters (`*secret*` and `SecretManager.swift`), a folder's
 * rule the folders a project lies in (`documents/**`), and a bare word what is no file (`token` and `git commit -m Token`).
 * Another project's rule, written whole inside it, is read as that project reads it: without the project's folder.
 */
export function namesInEitherCase({ pattern: written, project }) {
    const pattern = project !== undefined && written.startsWith(`${project}/`) ? written.slice(project.length + 1) : written;
    const whole = pattern.startsWith('/');
    const parts = pattern.replace(/^(?:\*\*)?\/+/, '').split('/');
    const last = parts.at(-1) ?? '';
    // A wildcard above the last part, or inside a name, holds what the rule's own letters do not say.
    if (parts.slice(0, -1).some((part) => WILDCARD.test(part) && !DOTTED.test(part)))
        return false;
    const dotted = parts.some((part) => DOTTED.test(part));
    if (DOTTED.test(last) || WITH_EXTENSION.test(last))
        return true;
    if (last === '**' || last === '*')
        return dotted || (whole && last === '**');
    if (ANY_WITH_EXTENSION.test(last))
        return dotted || parts.length === 1;
    return !WILDCARD.test(last) && (dotted || whole);
}
/** FN14: the two globs an entry held in a folder is matched as - the path from the folder, and the whole path. */
export function heldGlobs(pattern, at) {
    const fromFolder = pattern.replace(/^\*\*\//, '');
    return [fromFolder, at.replace(/\/+$/, '') + '/' + fromFolder];
}
export function protects(policy, path) {
    return protectionOf(policy, path) !== undefined;
}
/**
 * The same policy with only what is kept from the agent: what a hook that stops a command may act on (F57). A told
 * pattern becomes one of the allowed, not merely absent: dropped, a broader blocking pattern answered for the file -
 * `demo.env`, told by its name but inside the blocked `.env` wildcard, was still refused - and a file the person said
 * their AI may read was kept from it (found by the maintainer, 2026-10-02).
 */
export function blockingOnly(policy) {
    // PB1, GD11: the computer's Track, under a project's rules, lifts none of them - a whole path named it, and the
    // project's block of the same file let the command through (the maintainer's data, 2026-10-12).
    const told = policy.protected.filter((entry) => entry.mode === 'tell' && entry.fromComputer !== true);
    // FN14: a told entry held in a folder is an exception there alone, never for every file of its name (FNB26).
    const lifted = (entry) => (entry.at === undefined ? [entry.pattern] : heldGlobs(entry.pattern, entry.at));
    // RW4: another project's told file is that project's exception, lifting its own blocks and none of this policy's.
    const allowedIn = { ...policy.allowedIn };
    for (const entry of told) {
        if (entry.project !== undefined)
            allowedIn[entry.project] = [...(allowedIn[entry.project] ?? []), ...lifted(entry)];
    }
    return {
        ...policy,
        protected: policy.protected.filter((entry) => entry.mode !== 'tell'),
        allowed: [...policy.allowed, ...told.filter((entry) => entry.project === undefined).flatMap(lifted)],
        ...(Object.keys(allowedIn).length === 0 ? {} : { allowedIn }),
    };
}
