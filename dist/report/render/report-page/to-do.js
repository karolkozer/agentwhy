import { actionsOf, holdsKeys } from '../../check/session-actions.js';
import { readIn, readsOf } from '../../flow-reads.js';
import { ruleKey } from './item-names.js';
import { nameWords, providerOfName, providerOfPattern } from './providers.js';
/** Shapes many keys share, as against a key's own format: only a key of such a shape is judged by its line's name. */
const SHAPES = new Set(['jwt', 'high-entropy value', 'value beside a sensitive name']);
const SECRET_WORDS = new Set(['SECRET', 'SERVICE', 'PRIVATE', 'PASSWORD', 'PASS', 'PWD', 'ADMIN', 'MASTER']);
const PUBLIC_WORDS = new Set(['ANON', 'PUBLISHABLE']);
const TEST_WORDS = new Set(['TEST', 'SANDBOX']);
/**
 * A key line's urgency (the report page spec P20b). A key's own format - a live Stripe key, a private key block - is a
 * secret. So is a name that says it is one (`SERVICE_ROLE`, `SECRET`, `PASSWORD`), even under a framework's public
 * prefix, where a secret is already shown to everyone and changing it is most urgent. A name a framework ships to the
 * browser (`NEXT_PUBLIC_`, `VITE_`), or an anon, publishable or public key, is public; a test or sandbox key is less
 * urgent. From names, so a guess, and said as one.
 */
export function urgencyOf(line) {
    if (!SHAPES.has(line.key))
        return 'secret';
    const { words, shipped } = nameWords(line.name);
    const test = words.some((word) => TEST_WORDS.has(word));
    if (words.some((word) => SECRET_WORDS.has(word)))
        return test ? 'test' : 'secret';
    if (shipped || words.some((word) => PUBLIC_WORDS.has(word)) || words.join('_').includes('PUBLIC_KEY'))
        return 'public';
    return test ? 'test' : 'secret';
}
/**
 * The to-do list, in the order F21 gives: files a value went further from first, then files of keys, then files whose
 * contents cannot be changed; within each, in the order the session first reached them.
 */
export function toDoItems(report) {
    const actions = actionsOf(report);
    const seen = new Map(actions.rotate.map((file) => [file.path, file.template]));
    const further = furtherPaths(report);
    const patternOf = new Map(report.findings.map((finding) => [finding.path, finding.pattern]));
    // `2026-10-09-the-file-not-its-name.md` FNB25: a private file whose text the AI was handed (S3) that no Track rule let
    // it read - its block did not hold - is to see to whether or not a value was traced out of it. Codex printed a blocked
    // folder's files through a loop, and the page said "All good" and "you let it read" over them.
    // Read off the flows, which hold only what the agent's model was handed (X10, `filesRead`): a value only in what a
    // process printed, as a runtime recorded it, is no read.
    const told = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
    const readHeld = new Set(report.flows.flatMap((flow) => flow.steps)
        .flatMap((step) => (step.kind === 'reached' ? readsOf(step) : []))
        .map((path) => path)
        .filter((path) => !told.has(path)));
    const items = report.privateFiles
        .filter((file) => seen.has(file.path) || readHeld.has(file.path))
        .map((file) => {
        const pattern = patternOf.get(file.path);
        return toDoItem(file.path, file, {
            template: seen.get(file.path) === true,
            further: further.has(file.path),
            readers: readersOf(report, file.path),
            ...(pattern === undefined ? {} : { pattern }),
        });
    });
    const rank = (item) => (item.further ? 0 : item.kind === 'keys' ? 1 : 2);
    return items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(({ item }) => item);
}
/**
 * One file as the Fix it wizard draws it, from what was read from it - the report page from its session, To fix from
 * every session that read it (`FileRead`, merged).
 */
export function toDoItem(path, file, facts) {
    const { providers, guesses, lines, tests, open, unnamed } = servicesOf(file);
    const kept = file.keyed.filter((line) => !open.includes(line.name));
    // F45, amended 2026-09-24: a file one of the built-in rules protects - `.env*`, `.npmrc`, `secrets/`, SSH keys - is
    // a file of passwords and keys by the rule that matched it, which is a fact. Where no known format was found in it,
    // or its text was never read as its own (a `grep`, a read of several files), its keys are ones we cannot name - it
    // is never asked "what's in this file?", a question for a file only the person's own rule protects.
    const byRule = ruleKey(facts.pattern) !== undefined;
    const keys = holdsKeys(file) || byRule;
    return {
        path,
        kind: keys ? 'keys' : 'data',
        providers,
        guesses,
        lines,
        tests,
        open,
        keyCount: file.keyed.length,
        unnamed,
        names: kept.length > 0 ? kept.map((line) => line.name) : file.names,
        keyedNames: kept.length > 0,
        template: facts.template,
        further: facts.further,
        readers: facts.readers,
        ...(facts.pattern === undefined ? {} : { pattern: facts.pattern }),
    };
}
/** Nothing was read from a file that could be named: no key format, no line. */
export const NOTHING_READ = { keys: [], names: [], keyed: [] };
/**
 * Which services a file's keys are for (F45): by a key's format first, a fact; then, for a key line no format names, by
 * the line's variable name (O11), a guess; and a key line neither names is left to the person, by its name. A key class
 * no key line accounts for - a value that stood beside no name - is one nothing here can place. Lines are taken most
 * urgent first (P20b), and a public one is set apart - unless it is all there is, with nothing to set it apart from.
 */
function servicesOf(file) {
    const providers = new Map();
    for (const key of file.keys) {
        const provider = providerOfPattern(key);
        if (provider !== undefined && !providers.has(provider.name))
            providers.set(provider.name, provider);
    }
    const RANK = { secret: 0, test: 1, public: 2 };
    const ranked = file.keyed.map((line, at) => ({ line, at, urgency: urgencyOf(line) }))
        .sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || a.at - b.at);
    const setApart = providers.size > 0 || ranked.some((each) => each.urgency !== 'public');
    const guesses = new Map();
    const lines = [];
    const tests = [];
    const open = [];
    for (const { line, urgency } of ranked) {
        if (urgency === 'public' && setApart) {
            open.push(line.name);
            continue;
        }
        if (urgency === 'test')
            tests.push(line.name);
        if (providerOfPattern(line.key) !== undefined)
            continue;
        const provider = providerOfName(line.name);
        if (provider === undefined)
            lines.push(line.name);
        else if (!providers.has(provider.name)) {
            const guess = guesses.get(provider.name) ?? { provider, names: [] };
            guess.names.push(line.name);
            guesses.set(provider.name, guess);
        }
    }
    const placed = new Set(file.keyed.map((line) => String(line.key)));
    const unplaced = file.keys.some((key) => providerOfPattern(key) === undefined && !placed.has(key));
    return { providers: [...providers.values()], guesses: [...guesses.values()], lines, tests, open, unnamed: unplaced || file.mixed === true };
}
/** The paths a value went further from: a reply that carried it, a file it was written into, a use of it. */
function furtherPaths(report) {
    const paths = new Set();
    for (const statement of report.returns) {
        if (statement.strength === 'value')
            for (const path of statement.paths)
                paths.add(path);
        for (const path of statement.writtenFrom)
            paths.add(path);
    }
    for (const use of report.uses)
        for (const path of use.files)
            paths.add(path);
    return paths;
}
/** The agents whose own steps carried a value read from this file. */
function readersOf(report, path) {
    const agents = new Set();
    for (const flow of report.flows) {
        for (const step of flow.steps) {
            if ((step.kind === 'reached' && readIn(step, path)) || (step.kind === 'received' && step.files.map(String).includes(path)))
                agents.add(flow.agentIndex);
        }
    }
    return Math.max(agents.size, 1);
}
/**
 * WK7 (`2026-11-23-a-write-over-the-key.md`): the files a write put agentwhy's placeholder over a key in, once each, in the
 * order the record shows them. Each is a to-do of its own - the key is gone from the file - beside the files a value was read
 * from, and no to-do of theirs: nothing of the file was read, and there is no key to change, only one to put back.
 */
export function keyOverwrites(report) {
    const files = (report.keyWrites ?? []).flatMap((finding) => (finding.kind === 'written' && finding.file !== undefined ? [finding.file] : []));
    return [...new Set(files)];
}
