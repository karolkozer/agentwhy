import type { SessionModel } from './session-model.ts';

/**
 * What the core needs from the outside world: a session, already in the core's own terms. The core declares it,
 * an adapter implements it, and the dependency points inwards - `src/core/` imports nothing from `src/adapter/`.
 */
export interface SessionSource {
  /** `input` is whatever names a session to that adapter; the adapter reports what it could not find as gaps. */
  read(input: string): Promise<SessionModel>;
}
