// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CopilotDoctorReport } from '../adapter/copilot/probe/copilot-doctor-report.ts';
import type { CopilotProbe } from '../adapter/copilot/probe/copilot-probe.ts';
import type { Renderer } from '../shared/renderer.ts';
import type { DoctorOptions, DoctorResult, DoctorUseCase } from './doctor-use-case.ts';
import type { OutputFormat } from './render/output-format.ts';

export interface CopilotDoctorDependencies {
  readonly probe: CopilotProbe;
  readonly renderers: Readonly<Record<OutputFormat, Renderer<CopilotDoctorReport>>>;
}

/** `doctor` on Copilot's runtime records (plan step 5): measures, renders, and says when nothing given was a Copilot session. */
export class CopilotDoctor implements DoctorUseCase {
  readonly #dependencies: CopilotDoctorDependencies;

  constructor(dependencies: CopilotDoctorDependencies) {
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
