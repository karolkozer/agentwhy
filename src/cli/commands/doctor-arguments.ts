import { parseArgs } from 'node:util';
import type { DoctorOptions } from '../../doctor/doctor-use-case.ts';

export type DoctorArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'usage-error'; readonly message: string }
  | { readonly kind: 'options'; readonly options: DoctorOptions };

/** Parses the arguments after `doctor`. Never throws: bad input is a usage error. */
export function parseDoctorArguments(args: readonly string[]): DoctorArguments {
  let values: ReturnType<typeof parseValues>;
  try {
    values = parseValues(args);
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error));
  }

  if (values.help) return { kind: 'help' };
  if (values.input === undefined || values.input === '') {
    return usageError('doctor needs --input <session-dir | session.jsonl>');
  }
  return { kind: 'options', options: { input: values.input, format: values.json ? 'json' : 'text' } };
}

function parseValues(args: readonly string[]) {
  return parseArgs({
    args: [...args],
    options: {
      input: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
}

function usageError(message: string): DoctorArguments {
  return { kind: 'usage-error', message };
}
