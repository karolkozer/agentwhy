import type { ReportModel } from '../../src/report/report-model.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';

/**
 * The page of a report, for tests that are about what the report says rather than about where its file landed.
 * The way back is off unless a test asks for it, which is what every producer but `start` passes.
 */
export const renderPage = (report: ReportModel, withIndexLink = false): string =>
  new ReportPageRenderer().render({ report, withIndexLink });
