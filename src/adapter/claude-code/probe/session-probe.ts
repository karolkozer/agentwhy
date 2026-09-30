import type { DiscoveredSession } from '../discovery/discovered-session.ts';
import type { DoctorReport } from './doctor-report.ts';

/** Measures the structure of a discovered session. */
export interface SessionProbe {
  probe(session: DiscoveredSession): Promise<DoctorReport>;
}
