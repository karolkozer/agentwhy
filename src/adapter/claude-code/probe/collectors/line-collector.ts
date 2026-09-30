import type { TranscriptLine } from '../transcript-line.ts';

/** Strategy for one structural measurement. A tally is composed of collectors and feeds each of them every line. */
export interface LineCollector {
  collect(line: TranscriptLine): void;
}
