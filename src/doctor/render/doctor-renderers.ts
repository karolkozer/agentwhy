import type { DoctorReport } from '../../adapter/claude-code/probe/doctor-report.ts';
import type { Renderer } from '../../shared/renderer.ts';
import type { OutputFormat } from './output-format.ts';

/**
 * One renderer strategy per output format. A `Record` over the format union makes a new format a compile error
 * until its renderer is registered — and registering it touches no existing renderer and no selection logic.
 */
export type DoctorRenderers = Readonly<Record<OutputFormat, Renderer<DoctorReport>>>;
