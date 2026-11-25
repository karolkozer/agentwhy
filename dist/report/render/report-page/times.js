const LOCALES = { en: 'en-GB', pl: 'pl-PL', de: 'de-DE' };
export function clockIn(zone) {
    const known = (candidate) => {
        if (candidate === undefined)
            return 'UTC';
        try {
            new Intl.DateTimeFormat('en-GB', { timeZone: candidate });
            return candidate;
        }
        catch {
            return 'UTC';
        }
    };
    const timeZone = known(zone);
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone });
    const days = new Map();
    return {
        time: (epoch) => time.format(new Date(epoch)),
        day: (epoch, lang) => {
            const format = days.get(lang) ?? new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long', timeZone });
            days.set(lang, format);
            return format.format(new Date(epoch));
        },
    };
}
