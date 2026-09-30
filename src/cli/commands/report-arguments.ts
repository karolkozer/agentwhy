import { parseArgs } from 'node:util';
import type { ReportOptions } from '../../report/report-use-case.ts';
import { widthFor } from './report-usage.ts';

export type ReportArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'usage-error'; readonly message: string }
  | { readonly kind: 'options'; readonly options: ReportOptions };

/**
 * Parses the arguments after `report`. Never throws: bad input is a usage error. `columns` is what the terminal
 * reported, and is used only when `--width` says nothing.
 */
export function parseReportArguments(args: readonly string[], columns?: number): ReportArguments {
  let values: ReturnType<typeof parseValues>;
  try {
    values = parseValues(args);
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error));
  }

  if (values.help) return { kind: 'help' };

  const width = values.width === undefined ? widthFor(columns) : Number(values.width);
  if (!Number.isInteger(width) || width < 40) return usageError('--width must be a whole number of at least 40');

  // `--input` is optional: without it the command reads the newest session of the current project, which is
  // what someone standing in their repository means by "report".
  return {
    kind: 'options',
    options: {
      ...(values.input === undefined || values.input === '' ? {} : { input: values.input }),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
      ...(values.html === undefined ? {} : { htmlPath: values.html }),
      ascii: values.ascii === true,
      full: values.full === true,
      colour: values['no-color'] !== true,
      open: values.open === true,
      ...(values.quiet === true ? { quiet: true as const } : {}),
      share: values.share === true,
      width,
    },
  };
}

function parseValues(args: readonly string[]) {
  return parseArgs({
    args: [...args],
    options: {
      input: { type: 'string' },
      policy: { type: 'string' },
      settings: { type: 'string' },
      html: { type: 'string' },
      ascii: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      'no-color': { type: 'boolean', default: false },
      open: { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      share: { type: 'boolean', default: false },
      width: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
}

function usageError(message: string): ReportArguments {
  return { kind: 'usage-error', message };
}
