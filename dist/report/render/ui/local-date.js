const DAY = 86_400_000;
const LOCALES = { en: 'en-US', pl: 'pl-PL', de: 'de-DE' };
/** The calendar date a day number stands for. Day numbers are arithmetic only; no zone applies to them. */
export function dayOf(number) {
    const date = new Date(number * DAY);
    return { number, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: (date.getUTCDay() + 6) % 7 };
}
/**
 * Reads a moment as a calendar day and a time in one zone. An unknown zone name is read as UTC rather than failing a
 * run: a page that says UTC is a page, and a run that stops over a clock setting is not.
 */
export function localClock(zone) {
    const options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    let format;
    try {
        format = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone });
    }
    catch {
        format = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    }
    return (epoch) => {
        const parts = Object.fromEntries(format.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
        const number = Math.floor(Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day'])) / DAY);
        return { day: dayOf(number), time: (parts['hour'] ?? '00').padStart(2, '0') + ':' + (parts['minute'] ?? '00').padStart(2, '0') };
    };
}
const at = (day) => new Date(day.number * DAY);
/** Each way a day is written out: what the formatter of it is made with, beside the language and UTC. */
const WRITTEN = {
    day: { weekday: 'short', month: 'short', day: 'numeric' },
    tile: { weekday: 'short', day: 'numeric' },
    range: { month: 'short', day: 'numeric' },
    month: { month: 'long', year: 'numeric' },
    weekday: { weekday: 'short' },
};
/**
 * The formatters of this module, each made once and kept, as `core/policy/glob.ts` keeps its compiled patterns
 * (`.ai/specs/2026-10-13-drawn-when-it-changed.md` DC1). Making one is what costs: measured 2026-10-13, 20 000 day names
 * took 2.4 s with a formatter made for each and 11 ms with one kept, and a page of 294 conversations names a day three
 * times a row - a third of the time the computer's pages took to be drawn again was spent here. Filled when first
 * asked and not when the module loads: the first formatter of a process costs 15 ms, which a hook that names no day
 * should not pay. A formatter holds no state between two names, so the same one answers both alike.
 */
const KEPT = new Map();
function formatOf(lang, way) {
    const key = lang + ' ' + way;
    let kept = KEPT.get(key);
    if (kept === undefined) {
        kept = new Intl.DateTimeFormat(LOCALES[lang], { timeZone: 'UTC', ...WRITTEN[way] });
        KEPT.set(key, kept);
    }
    return kept;
}
/** "Mon, Sep 21" - a day that is neither today nor yesterday. */
export function dayName(day, lang) {
    return formatOf(lang, 'day').format(at(day));
}
/** "Mon 21" - the label of a day tile. */
export function tileName(day, lang) {
    const parts = formatOf(lang, 'tile').formatToParts(at(day));
    const part = (type) => parts.find((each) => each.type === type)?.value ?? '';
    return part('weekday') + ' ' + part('day');
}
/** "Sep 21 – 27", "Sep 28 – Oct 4" - a week, in the order each language writes a range. */
export function rangeName(first, last, lang) {
    return formatOf(lang, 'range').formatRange(at(first), at(last));
}
/** "September 2026" - a month, as each language names one standing alone. */
export function monthName(day, lang) {
    const name = formatOf(lang, 'month').format(at(day));
    return name.charAt(0).toLocaleUpperCase(LOCALES[lang]) + name.slice(1);
}
/** "Mon" … "Sun" - the head of a calendar, Monday first. 2024-01-01 was a Monday. */
export function weekdayNames(lang) {
    const format = formatOf(lang, 'weekday');
    return Array.from({ length: 7 }, (_unused, offset) => format.format(new Date(Date.UTC(2024, 0, 1 + offset))));
}
/** The first and the last day of the month a day falls in. */
export function monthOf(day) {
    return {
        first: dayOf(Math.floor(Date.UTC(day.year, day.month - 1, 1) / DAY)),
        last: dayOf(Math.floor(Date.UTC(day.year, day.month, 0) / DAY)),
    };
}
