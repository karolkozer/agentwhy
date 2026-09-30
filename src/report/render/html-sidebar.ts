import { labelAttributes, type Translate } from './report-copy.ts';
import { BRAND_MARK } from './ui/brand-mark.ts';

/**
 * One item of the column. It is either a link somewhere, or the label of the radio that shows one view of the page
 * it sits on - the sessions index switches its views with no script at all, and a label is how (`a-way-back` R7).
 */
export interface SidebarItem {
  /** The whole `<svg class="icon">`, drawn rather than loaded (§7.5 constraint 1). */
  readonly icon: string;
  /** The name, already written in every language the page ships with. */
  readonly name: string;
  /** What a label names, and the aria-label a collapsed column needs, per language. */
  readonly label: (t: Translate) => string;
  readonly count?: number;
  readonly href?: string;
  readonly radio?: string;
  /** Marks the item on the page it leads to, so the column says where you are. */
  readonly view?: string;
}

/**
 * The column both pages carry: the mark, what you are looking at, the way around or the way out, and the one
 * standing fact about where the work happened.
 *
 * It lives here and not twice. The index and the report each grew their own copy of it - two widths, two brands,
 * two sets of nearly-identical rules - which is how the same column came to look like a different component
 * depending on which page you were on. One module, one block of CSS, and the width is a token neither page sets.
 */
export function sidebar(options: {
  /** Where the mark leads. A mark and not a link when absent: a report that wrote no index has nowhere to send it. */
  readonly home?: string;
  readonly card: { readonly icon: string; readonly title: string; readonly sub: string; readonly hint?: string };
  /** The words over the items. */
  readonly label: string;
  readonly items: readonly SidebarItem[];
  readonly note: { readonly text: string; readonly sub: string };
}): string {
  const mark = BRAND_MARK + '<span class="brand-name">agent<em>why</em></span>';
  return '<aside class="sidebar">' +
    (options.home === undefined
      ? '<span class="brand" role="img" aria-label="agentwhy">' + mark + '</span>'
      : '<a class="brand" href="' + options.home + '" aria-label="agentwhy">' + mark + '</a>') +
    // The mark and the count lead, and the name has the whole width of the card under them. Beside the mark the
    // name had about half a column to wrap inside, and a real project folder - `test-project-for-agentwhy` -
    // came apart over three lines in it. The line above is short in every language, so the mark costs it nothing.
    '<div class="workspace"><span class="workspace-meta"><span class="workspace-icon">' + options.card.icon +
    '</span><small>' + options.card.sub + '</small></span>' +
    '<b' + (options.card.hint === undefined ? '' : ' title="' + options.card.hint + '"') + '>' +
    options.card.title + '</b></div>' +
    (options.items.length === 0 ? '' :
      '<p class="nav-label" aria-hidden="true">' + options.label + '</p>' +
      '<nav class="nav"' + labelAttributes((t) => t('rail.nav')) + '>' + options.items.map(item).join('') + '</nav>') +
    '<div class="sidebar-bottom"><p class="local-note"><span class="dot" aria-hidden="true"></span>' +
    options.note.text + '<small>' + options.note.sub + '</small></p></div>' +
    '</aside>';
}

/**
 * The name is written twice: as text, and as a label, because a column narrow enough to hide that text leaves a
 * control with no name at all (R4).
 */
function item(entry: SidebarItem): string {
  const inside = entry.icon + '<span class="nav-name">' + entry.name + '</span>' +
    (entry.count === undefined || entry.count === 0 ? '' : '<span class="nav-count">' + entry.count + '</span>');
  const marks = labelAttributes(entry.label) + (entry.view === undefined ? '' : ' data-view="' + entry.view + '"');
  return entry.radio === undefined
    ? '<a class="nav-item" href="' + (entry.href ?? '') + '"' + marks + '>' + inside + '</a>'
    : '<label class="nav-item" for="' + entry.radio + '"' + marks + '>' + inside + '</label>';
}
