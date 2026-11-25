// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { unquote } from '../redaction/value-shapes.js';
/** CT3: a line long enough, and worded enough, to be a file's own rather than any file's. */
const SHORTEST_LINE = 20;
const WORDED = /\p{L}{3}/u;
/**
 * `2026-10-19-what-it-did-next.md` DND4: a table's field long enough to be someone's data. DNB10-DNB11: of the fields of
 * their own found after a read, 3 of 58 were shorter, all single words.
 */
const SHORTEST_FIELD = 6;
/** The most fields one table is read for: a walk runs in hooks too (CT7). */
const MOST_FIELDS = 5_000;
/** What a table splits its lines on: the first of these every line - four in five - splits into the same number of fields. */
const DELIMITERS = [',', ';', '\t', '|'];
/** Code splits on commas too and is no table (DNB8 measured it apart, and DND6 keeps it out). */
const CODE = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.rs', '.java', '.rb', '.php', '.sh', '.c', '.h', '.cpp', '.cs', '.swift', '.kt', '.sql']);
/**
 * `2026-10-11-the-file-by-its-text.md` CT1-CT6: the project's private files, known by their text. Each holds the lines
 * no other text file of the project holds (CT3), only as hashes salted for this run (CT6): what reaches a report is which
 * file a call's output showed, never a line. Found 2026-10-11 by the maintainer's rounds: a private file's text printed by
 * a line the command reader did not know said *Only saw a name* (CTB1), and the file's own lines were in the output.
 */
export class ContentFingerprints {
    #salt;
    /** A distinctive line's hash, and the private file whose it is. */
    #owners;
    /** How many distinctive lines each private file has. */
    #distinct;
    /** DND4: each private table with fields of its own, by its whole path. */
    #tables;
    constructor(salt, owners, distinct, tables) {
        this.#salt = salt;
        this.#owners = owners;
        this.#distinct = distinct;
        this.#tables = tables;
    }
    /** From every text file of a project: a line one file holds alone is that file's, kept where the file is private. */
    static of(texts, salt) {
        const all = [...texts];
        const collector = ContentFingerprints.collect(salt, all.filter((text) => text.private));
        for (const text of all)
            collector.add(text);
        return collector.done();
    }
    /**
     * One file at a time, its lines hashed as they come and dropped (CT6): a walk of a project holds no file's text past
     * the file it is reading. The private files are handed over first (DND4): a table among them keeps its fields raw while
     * the walk runs, so every file added after can say whether it holds one, and only their hashes outlast `done`.
     */
    static collect(salt, privates = []) {
        const holders = new Map();
        const privatePaths = new Set();
        const hash = hashing(salt);
        const pending = new Map();
        for (const text of privates) {
            const table = text.private ? tableIn(text.path, [...text.lines]) : undefined;
            if (table !== undefined)
                pending.set(text.path, table);
        }
        return {
            add(text) {
                if (text.private)
                    privatePaths.add(text.path);
                const lines = [...text.lines];
                const own = new Set();
                for (const raw of lines) {
                    const line = raw.trim();
                    if (line.length >= SHORTEST_LINE && WORDED.test(line))
                        own.add(hash(line));
                }
                for (const key of own)
                    holders.set(key, holders.has(key) ? null : text.path);
                // DND4: a field another text file of the project holds is no table's own - a client's name an invoice holds too.
                if (pending.size === 0)
                    return;
                const body = lines.join('\n');
                for (const [path, table] of pending) {
                    if (path === text.path)
                        continue;
                    for (const [field, held] of table.fields)
                        if (!held && body.includes(field))
                            table.fields.set(field, true);
                }
            },
            done() {
                const owners = new Map();
                const distinct = new Map();
                for (const [key, holder] of holders) {
                    if (holder === null || !privatePaths.has(holder))
                        continue;
                    owners.set(key, holder);
                    distinct.set(holder, (distinct.get(holder) ?? 0) + 1);
                }
                const field = fieldHashing(salt);
                const tables = new Map();
                for (const [path, table] of pending) {
                    const fields = new Set([...table.fields].filter(([, held]) => !held).map(([text]) => field(text)));
                    if (privatePaths.has(path) && fields.size > 0)
                        tables.set(path, { delimiter: table.delimiter, header: hash(table.header), fields });
                }
                return new ContentFingerprints(salt, owners, distinct, tables);
            },
        };
    }
    /** How many private files can be known by their text. */
    get files() {
        return this.#distinct.size;
    }
    /**
     * CT1, CT4: the private files whose text one call's output holds - two of its distinctive lines or more, or the one it
     * has where it has only one - its lines read as the AI was shown them, numbers stripped.
     */
    filesShown(outputs) {
        const hash = hashing(this.#salt);
        const found = new Map();
        for (const output of outputs) {
            for (const raw of output.split('\n')) {
                const key = hash(shownLine(raw));
                const owner = this.#owners.get(key);
                if (owner === undefined)
                    continue;
                const keys = found.get(owner) ?? new Set();
                keys.add(key);
                found.set(owner, keys);
            }
        }
        return [...found].filter(([owner, keys]) => keys.size >= Math.min(2, this.#distinct.get(owner) ?? 0)).map(([owner]) => owner).sort();
    }
    /** DND4: whether this run knows the file as a private table with fields of its own. */
    isTable(path) {
        return this.#tables.has(path);
    }
    /**
     * `2026-10-19-what-it-did-next.md` DND4, DND5: the fields of a private table one call's output showed - from the lines
     * there that are the table's own (CT3), its header left out, split as the table splits - kept where no other text file
     * of the project holds them. Raw text out of the output, for a caller to look for and drop; none for a file this run
     * knows as no table.
     */
    fieldsShown(path, outputs) {
        const table = this.#tables.get(path);
        if (table === undefined)
            return [];
        const hash = hashing(this.#salt);
        const field = fieldHashing(this.#salt);
        const found = new Set();
        for (const output of outputs) {
            for (const raw of output.split('\n')) {
                const line = shownLine(raw);
                const key = hash(line);
                if (key === table.header || this.#owners.get(key) !== path)
                    continue;
                for (const text of fieldsIn(line, table.delimiter))
                    if (table.fields.has(field(text)))
                        found.add(text);
            }
        }
        return [...found];
    }
}
/**
 * DND4: a private file that is a table - not code, at least two lines, every line (four in five) split by one delimiter
 * into the same number of fields, two or more - with its first line as its header and the rest's fields, from 6
 * characters - the rule `2026-10-19-what-it-did-next.md` DNB8-DNB11 measured.
 */
function tableIn(path, lines) {
    if (CODE.has(extname(path).toLowerCase()))
        return undefined;
    const kept = lines.map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
    const header = kept[0];
    if (header === undefined || kept.length < 2)
        return undefined;
    const delimiter = DELIMITERS.find((each) => {
        const widths = kept.map((line) => line.split(each).length);
        const width = widths[0] ?? 0;
        return width >= 2 && widths.filter((one) => one === width).length / widths.length >= 0.8;
    });
    if (delimiter === undefined)
        return undefined;
    const fields = new Map();
    for (const line of kept.slice(1)) {
        for (const text of fieldsIn(line, delimiter))
            if (text.length >= SHORTEST_FIELD && fields.size < MOST_FIELDS)
                fields.set(text, false);
    }
    return { delimiter, header, fields };
}
/** A table's line as its fields, each trimmed and unquoted. */
function fieldsIn(line, delimiter) {
    return line.split(delimiter).map((text) => unquote(text.trim()).trim()).filter((text) => text !== '');
}
function fieldHashing(salt) {
    return (field) => createHash('sha256').update(`${salt}:field:${field}`).digest('hex');
}
function hashing(salt) {
    return (line) => createHash('sha256').update(`${salt}:text:${line}`).digest('hex');
}
/**
 * CT4: a line of output as the file holds it - without the number Claude Code's Read puts before it (`  12→`), the one
 * `cat -n` and `nl` put (`    12\t`), or a search's place (`path:12:`, `12:`, `path-12-`).
 */
export function shownLine(raw) {
    return raw.replace(/\r$/, '').replace(/^\s*\d+(?:→|\t)/, '').replace(/^[^\s:]+[:-]\d+[:-]/, '').replace(/^\d+[:-]/, '').trim();
}
