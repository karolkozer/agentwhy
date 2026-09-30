import type { Provider, SessionFormats } from '../core/session-format.ts';
import type { DoctorOptions, DoctorResult, DoctorUseCase } from './doctor-use-case.ts';
import type { OutputFormat } from './render/output-format.ts';

export interface FormatSelectingDoctorDependencies {
  readonly formats: SessionFormats;
  /** One diagnosis per format, keyed: a new format does not compile until its diagnosis is registered. */
  readonly doctors: Readonly<Record<Provider, DoctorUseCase>>;
  /**
   * Whose diagnosis an input goes to when no format could read it to tell: Claude Code's reports a session whose main
   * transcript is not there, as it always did (exit 1), and says what it looked for.
   */
  readonly whenUnavailable: Provider;
}

/**
 * What `doctor` says of an input no format recognised, in each output format. The JSON is a closed schema of its own: it
 * names no provider it guessed and nothing the input held.
 */
const UNKNOWN_FORMAT: Readonly<Record<OutputFormat, string>> = {
  text: 'agentwhy doctor: the input is neither a Claude Code session nor a Codex session, so it was not read.\n',
  json: `${JSON.stringify({ schemaVersion: 1, provider: 'unknown' }, null, 2)}\n`,
};

/**
 * `doctor` on whichever format the input is, told by content through the shared registry (`2026-09-27-what-codex-wrote.md`
 * X2, XD7). This lifts the coupling of `doctor` to the Claude Code adapter (main spec §13.6). An input every format read
 * and none recognised is read by none.
 */
export class FormatSelectingDoctor implements DoctorUseCase {
  readonly #dependencies: FormatSelectingDoctorDependencies;

  constructor(dependencies: FormatSelectingDoctorDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: DoctorOptions): Promise<DoctorResult> {
    const { formats, doctors, whenUnavailable } = this.#dependencies;
    const selection = await formats.select(options.input);
    if (selection.kind === 'recognised') return doctors[selection.provider].run(options);
    if (selection.kind === 'unavailable') return doctors[whenUnavailable].run(options);
    return { outcome: 'unknown-format', output: UNKNOWN_FORMAT[options.format] };
  }
}
