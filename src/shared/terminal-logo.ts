import { paint } from './colour.ts';

/**
 * The agentwhy wordmark for a terminal: the letters of `agentwhy-logo-transparent.svg` in two rows of block
 * characters, "agent" in the text colour and "why" in the brand indigo, as the page draws them.
 */
const ROWS = [
  { agent: '▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀', why: '█ █ █ █ █ █▄█' },
  { agent: '█▀█ █▄█ ██▄ █ ▀█  █ ', why: '▀▄▀▄▀ █▀█  █ ' },
] as const;

/** The name in letters, for a terminal trusted with ASCII alone (§7.5 constraint 2). */
const NAME = 'agentwhy';

/** Between the mark and the words beside it. */
const BESIDE = '   ';

/** What the tool is for, in the words its package describes it with. Said beside the mark wherever it is drawn. */
export const TAGLINE = 'why an agent reached for protected data';

/** How many columns the mark takes, gap included, before the words beside it start. */
export function logoWidth(ascii: boolean): number {
  const mark = ascii ? NAME.length : Math.max(...ROWS.map(({ agent, why }) => agent.length + 1 + why.length));
  return mark + BESIDE.length;
}

export interface LogoView {
  /** Whether the mark may be coloured. Decided once, in the shell, like every other colour (R15). */
  readonly colour: boolean;
  /** Letters instead of block characters. */
  readonly ascii: boolean;
}

/**
 * The mark, one string per row, with up to two lines of words beside it: the mark shares its rows rather than
 * pushing everything below it further down. Colour only repeats what is drawn - removing the escapes gives exactly
 * the rows drawn without it.
 */
export function terminalLogo(beside: readonly string[], view: LogoView): string[] {
  if (view.ascii) {
    if (beside.length === 0) return [NAME];
    return beside.map((words, row) => `${row === 0 ? NAME : ' '.repeat(NAME.length)}${BESIDE}${words}`);
  }

  return ROWS.map(({ agent, why: letters }, row) => {
    const words = beside[row] ?? '';
    // A row with nothing beside it ends where the letters do, not in the padding that keeps two rows level.
    const why = words === '' ? letters.trimEnd() : letters;
    const mark = view.colour ? `${paint(agent, 'bold')} ${paint(why, 'indigo')}` : `${agent} ${why}`;
    if (words === '') return mark;
    return `${mark}${BESIDE}${view.colour ? paint(words, 'dim') : words}`;
  });
}
