const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const LONGEST = 200;
/** Splits what was typed on commas, and separates what can be written from what cannot. */
export function patternsIn(typed) {
    return patternsOf(typed.split(',').map((pattern) => pattern.trim()));
}
/** The same rules for patterns given one at a time, as `--protect` gives them. */
export function patternsOf(given) {
    const patterns = [];
    const refused = [];
    for (const pattern of given.map((one) => one.trim())) {
        if (pattern === '')
            continue;
        const reason = reasonToRefuse(pattern);
        if (reason !== undefined)
            refused.push({ pattern, reason });
        else if (!patterns.includes(pattern))
            patterns.push(pattern);
    }
    return { patterns, refused };
}
function reasonToRefuse(pattern) {
    if (pattern.includes('(') || pattern.includes(')'))
        return 'a deny rule is written as Read(...), so a bracket cannot be part of the path';
    if (CONTROL.test(pattern))
        return 'it holds a character that cannot be in a file name';
    if (pattern.length > LONGEST)
        return `it is longer than ${LONGEST} characters`;
    return undefined;
}
