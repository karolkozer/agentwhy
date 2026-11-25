import { unquote } from '../redaction/value-shapes.js';
import { codeReadsNamedFile, printsContentOnly } from './command-line.js';
import { printedOutput } from './printed-output.js';
import { readsContentBesideNames } from './protected-access.js';
const KEYED = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*[=:]\s*(.*)$/;
const JSON_KEYED = /^"[^"]+"\s*:\s*("[^"]*"|[^,\s]+)/;
/**
 * An `.npmrc` setting scoped to a registry, as npm documents it: `//registry.npmjs.org/:_authToken=value`. Found by
 * `docs/detection.md` (`npmrc`): read as a line of its own, the whole setting looked like an address and was dropped as
 * an ordinary value, so a token `cat ~/.npmrc` printed was never traced.
 */
const REGISTRY_KEYED = /^\/\/\S+?:[A-Za-z_][A-Za-z0-9_-]*\s*=\s*(.*)$/;
/** A `Read` numbers the lines it returns. */
const LINE_NUMBER = /^\s*\d+→/;
/**
 * Every value read out of a protected resource by a call that succeeded, each once per agent and file:
 *
 * - from the content a call returned when it named the resource and printed what was in it - a `Read`, a `cat`;
 * - from what an interpreter printed when the code it was handed names the resource - `python3 -c "print(open('.env').read())"`;
 * - from a listing line that names a protected path - `path:line:KEY=value`, the motivating case.
 *
 * A line shaped `KEY=value` or `"key": "value"` gives its value; any other line gives itself.
 *
 * A call's content is read **once for the call**, against every protected path it named. `cat .env .env.local`
 * concatenates two files with nothing between them, and a line of that output came from one of them; recording
 * it once against each, as if each file held it, puts a file in the report that the value was never read from.
 * A listing line carries its own path, so those are attributed one by one and stay exact.
 *
 * **Known limit.** A search that names one file prints its matches without the file's name - `grep KEY .env`
 * answers `12:KEY=value` - and those lines are neither content nor a listing line naming a path, so their values
 * are not read. Recorded rather than guessed at, until a measurement says how often it happens.
 */
export function protectedValues(model, accesses) {
    const events = new Map(model.events.map((event) => [event.id, event]));
    const seen = new Set();
    const values = [];
    const add = (agentId, paths, line) => {
        const value = valueOf(line);
        const key = JSON.stringify([agentId, paths, value]);
        if (value === undefined || seen.has(key))
            return;
        seen.add(key);
        values.push({ agentId, paths, value });
    };
    for (const [eventId, group] of byEvent(accesses)) {
        const event = events.get(eventId);
        // FNB44: what the one command printed where the record keeps it apart - the text after Codex's header in the VS Code
        // panel (XD4c), the `output` its result object carries (XD11) - and never the header itself: `Script completed`, the
        // first line of every panel cell, was traced as a tracked file's value and found in every other cell.
        const content = printedOutput(event);
        if (event === undefined || content === undefined)
            continue;
        const inputs = group.filter((access) => access.source === 'input');
        const named = [...new Set(inputs.map((access) => access.path))];
        if (named.length > 0 && (event.resultShape === 'content' || printsContentOnly(event.commands))) {
            for (const line of content.split('\n'))
                add(event.agentId, named, line);
        }
        else if (named.length > 0 && readsContentBesideNames(event)) {
            // SWO1: a file's text beside a directory's names. Only a `KEY=value` line is the file's: a name `ls` printed is not
            // a value, and tracing one would find it in every answer that mentions the file.
            for (const line of keyedLines(content))
                add(event.agentId, named, line);
        }
        else {
            // An interpreter whose own code opened the file: its output is read as the file's, against the files it named.
            // FN11: code names a file by the word the line wrote; the value lands on the path recorded for it.
            const opened = [...new Set(inputs.filter((access) => codeReadsNamedFile(event.commands, access.word ?? access.path)).map((access) => access.path))];
            if (opened.length > 0)
                for (const line of content.split('\n'))
                    add(event.agentId, opened, line);
        }
        for (const access of group) {
            if (access.source !== 'result')
                continue;
            for (const line of listedLines(content, access.path))
                add(access.agentId, [access.path], line);
        }
    }
    return values;
}
/**
 * The lines of a call's output shaped `KEY=value`, `"key": "value"` or `//registry/:key=value` (SWO1): where a file's
 * text is printed beside a directory's names, these are the file's, and no line `ls` prints has that shape.
 */
export function keyedLines(content) {
    return content.split('\n').filter((raw) => {
        const line = raw.replace(LINE_NUMBER, '').trim();
        return !line.startsWith('#') && (JSON_KEYED.test(line) || KEYED.test(line) || REGISTRY_KEYED.test(line));
    });
}
/** The succeeded accesses of each call, in the order the calls were met: one call's content is read once. */
function byEvent(accesses) {
    const groups = new Map();
    for (const access of accesses) {
        if (access.outcome !== 'succeeded')
            continue;
        const group = groups.get(access.eventId);
        if (group === undefined)
            groups.set(access.eventId, [access]);
        else
            group.push(access);
    }
    return groups;
}
/**
 * The value of a `KEY=value`, `"key": "value"` or `//registry/:key=value` line, or the line itself; nothing for a blank
 * line or a comment.
 */
function valueOf(raw) {
    const line = raw.replace(LINE_NUMBER, '').trim();
    if (line === '' || line.startsWith('#'))
        return undefined;
    const json = JSON_KEYED.exec(line);
    const keyed = json === null ? (KEYED.exec(line) ?? REGISTRY_KEYED.exec(line)) : null;
    const value = json !== null ? unquote(json[1] ?? '') : keyed !== null ? unquote((keyed[1] ?? '').trim()) : line;
    return value === '' ? undefined : value;
}
/** The lines of a listing that name this path, with the path and a line number taken off the front. */
function listedLines(content, path) {
    return content
        .split('\n')
        .filter((line) => line.startsWith(`${path}:`))
        .map((line) => line.slice(path.length + 1).replace(/^\d+:/, ''));
}
