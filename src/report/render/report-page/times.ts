import type { Lang } from '../report-copy.ts';

/**
 * How the report page says a time (the report page spec M4, Q1): a record's clock time in the machine's time zone, for
 * display beside the record's order and never instead of it (P13, P51). An unknown zone name is read as UTC rather
 * than failing a page: a page that says UTC is a page.
 */
export interface Clock {
  /** `10:05:12`, in 24 hours, the same in every language. */
  readonly time: (epoch: number) => string;
  /** `Tuesday, 23 September`, as the language says a day. */
  readonly day: (epoch: number, lang: Lang) => string;
}

const LOCALES: Readonly<Record<Lang, string>> = { en: 'en-GB', pl: 'pl-PL', de: 'de-DE' };

export function clockIn(zone: string | undefined): Clock {
  const known = (candidate: string | undefined): string => {
    if (candidate === undefined) return 'UTC';
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: candidate });
      return candidate;
    } catch {
      return 'UTC';
    }
  };
  const timeZone = known(zone);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone });
  const days = new Map<Lang, Intl.DateTimeFormat>();
  return {
    time: (epoch) => time.format(new Date(epoch)),
    day: (epoch, lang) => {
      const format = days.get(lang) ?? new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long', timeZone });
      days.set(lang, format);
      return format.format(new Date(epoch));
    },
  };
}
