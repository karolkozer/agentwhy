export const DEFAULT_WIDTH = 100;

/** Narrower than this the layout stops being a layout; wider, a line is too long to run an eye back along. */
const WIDTH_BOUNDS = { least: 60, most: 120 } as const;

/**
 * The width a report is drawn at when `--width` is not given: the terminal's, kept inside bounds. With no terminal
 * - piped, redirected, in CI - it is `DEFAULT_WIDTH`, so a script's output does not change with the window.
 */
export function widthFor(columns: number | undefined): number {
  if (columns === undefined || !Number.isFinite(columns)) return DEFAULT_WIDTH;
  return Math.min(Math.max(Math.trunc(columns), WIDTH_BOUNDS.least), WIDTH_BOUNDS.most);
}

export const REPORT_USAGE = `Usage: agentwhy report --input <session-dir | session.jsonl> [options]

  --input <path>      the session to read: a directory or its <session-id>.jsonl
  --policy <file>     the policy that says which paths are protected
  --settings <file>   a settings file whose deny rules stand in for a policy
  --html <file>       also write the report as one self-contained HTML file
  --open              open the HTML report in whatever this machine opens HTML with.
                      Without --html it is written to a temporary file first
  --quiet             say where the report is and nothing else. The summary names paths and
                      what became of each, which is not what an agent should be handed when it
                      opens a report because you said yes
  --share             a report fit to hand to someone else: paths are shown relative to the
                      project root and nothing above it appears. This reduces exposure; it does
                      not anonymise - a path inside the repository still names what the
                      repository names
  --full              every section in detail: for each file, who reached it, what they had
                      been asked to do, what they ran and which record says so. Without it
                      the terminal gets a summary, and its last line says how to see the rest
  --ascii             draw the tree with + - | instead of box-drawing characters
  --no-color          no colour, even at a terminal. It is also off under NO_COLOR, with
                      --ascii, and whenever the output is not a terminal
  --width <columns>   width of the output. At a terminal it follows the window, between
                      ${WIDTH_BOUNDS.least} and ${WIDTH_BOUNDS.most} columns; piped or redirected it is ${DEFAULT_WIDTH}
  -h, --help          this text

Without --policy or --settings the built-in default is used, and the report says so.
The summary is printed either way; --html adds a file, it does not replace the output.
Values never appear in the output: they are replaced on the way into the report, not on the way out.
`;
