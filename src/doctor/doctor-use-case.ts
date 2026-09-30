import type { OutputFormat } from './render/output-format.ts';

export interface DoctorOptions {
  readonly input: string;
  readonly format: OutputFormat;
}

/**
 * The report is rendered either way; a missing main transcript is what the caller must be told about, and so is an input
 * that is no session either format reads (`2026-09-27-what-codex-wrote.md` X2).
 */
export type DoctorOutcome = 'complete' | 'main-transcript-missing' | 'unknown-format';

export interface DoctorResult {
  readonly outcome: DoctorOutcome;
  readonly output: string;
}

/** What callers of `doctor` depend on — never a concrete class. */
export interface DoctorUseCase {
  run(options: DoctorOptions): Promise<DoctorResult>;
}
