import type { CodexDoctorReport } from '../adapter/codex/probe/codex-doctor-report.ts';
import type { CodexProbe } from '../adapter/codex/probe/codex-probe.ts';
import type { Renderer } from '../shared/renderer.ts';
import type { DoctorOptions, DoctorResult, DoctorUseCase } from './doctor-use-case.ts';
import type { OutputFormat } from './render/output-format.ts';

export interface CodexDoctorDependencies {
  readonly probe: CodexProbe;
  readonly renderers: Readonly<Record<OutputFormat, Renderer<CodexDoctorReport>>>;
}

/** `doctor` on Codex rollouts (X26): measures, renders, and says when nothing it was given was a Codex session. */
export class CodexDoctor implements DoctorUseCase {
  readonly #dependencies: CodexDoctorDependencies;

  constructor(dependencies: CodexDoctorDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: DoctorOptions): Promise<DoctorResult> {
    const report = await this.#dependencies.probe.probe(options.input);
    return {
      outcome: report.files.recognised > 0 ? 'complete' : 'unknown-format',
      output: this.#dependencies.renderers[options.format].render(report),
    };
  }
}
