import type { SessionDiscovery } from '../adapter/claude-code/discovery/discovered-session.ts';
import type { SessionProbe } from '../adapter/claude-code/probe/session-probe.ts';
import type { DoctorOptions, DoctorResult, DoctorUseCase } from './doctor-use-case.ts';
import type { DoctorRenderers } from './render/doctor-renderers.ts';

export interface SessionDoctorDependencies {
  readonly discovery: SessionDiscovery;
  readonly probe: SessionProbe;
  readonly renderers: DoctorRenderers;
}

/** Discovers a session, measures it and renders the report. Returns the result; writing it is the shell's job. */
export class SessionDoctor implements DoctorUseCase {
  readonly #dependencies: SessionDoctorDependencies;

  constructor(dependencies: SessionDoctorDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: DoctorOptions): Promise<DoctorResult> {
    const { discovery, probe, renderers } = this.#dependencies;
    const session = await discovery.discover(options.input);
    const report = await probe.probe(session);

    return {
      outcome: session.mainTranscript.present ? 'complete' : 'main-transcript-missing',
      output: renderers[options.format].render(report),
    };
  }
}
