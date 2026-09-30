import type { EventOutcome } from '../../core/event.ts';
import type { GraphAgent, ReportAction, ReportModel } from '../report-model.ts';
import { inLanguages, labelAttributes, type Translate } from './report-copy.ts';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

const OUTCOME_SYMBOL: Readonly<Record<EventOutcome, string>> = { succeeded: '!', blocked: '✓', unknown: '?' };

const EXPAND_GLYPH =
  '<svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14"><path d="M9.5 1.5h5v5M14.5 1.5 9 7' +
  'M6.5 14.5h-5v-5M1.5 14.5 7 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"' +
  ' stroke-linejoin="round"/></svg>';

/**
 * A table, with a way to give it the width of the page. The button is an enhancement and says so: with no
 * script the container still scrolls, which is the whole behaviour a reader needs. The dialog only helps where
 * scrolling a column at a time is the thing that makes a table hard to read.
 */
export function scrollTable(table: string): string {
  return '<div class="table-wrap"><button type="button" class="table-open js-only" data-table-open' +
    labelAttributes((t) => t('table.expand')) + '>' + EXPAND_GLYPH + '</button>' +
    '<div class="table-scroll">' + table + '</div></div>';
}

export function badge(outcome: EventOutcome): string {
  return '<span class="badge ' + outcome + '"><span aria-hidden="true">' + OUTCOME_SYMBOL[outcome] + '</span> ' +
    inLanguages((t) => t('outcome.' + outcome)) + '</span>';
}

export function agentName(agent: GraphAgent, report: ReportModel): string {
  return agent.ordinal === undefined ? 'Main agent' : 'Agent ' + agent.ordinal;
}

export function actionsFor(agent: GraphAgent, report: ReportModel): readonly ReportAction[] {
  if (agent.index === report.graph.main.index) return report.mainAgent;
  return report.delegations.find((entry) => entry.childAgentIndex === agent.index)?.actions ??
    report.unattributedAgents.find((entry) => entry.agentIndex === agent.index)?.actions ?? [];
}

export function actionTable(actions: readonly ReportAction[], prefix: string): string {
  const heading = (key: string): string => '<th scope="col">' + inLanguages((t) => t(key)) + '</th>';
  if (actions.length === 0) return '<p class="empty-note">' + inLanguages((t) => t('table.empty')) + '</p>';
  return scrollTable('<table><caption>' + inLanguages((t) => t('table.caption')) + '</caption><thead><tr>' +
    heading('table.step') + heading('table.tool') + heading('table.path') + heading('table.outcome') + heading('table.evidence') +
    '</tr></thead><tbody>' + actions.map((action, index) =>
      '<tr id="' + prefix + '-action-' + index + '" class="' + action.outcome + '"><td>' + action.sequence +
      '</td><td>' + escapeHtml(action.tool) + '</td><td>' +
      (action.target === undefined ? '<span class="muted">' + inLanguages((t) => t('table.notDetected')) + '</span>'
        : '<code>' + escapeHtml(action.target) + '</code>') +
      '</td><td>' + (action.outcome === 'succeeded' ? '<span class="neutral-outcome">' + inLanguages((t) => t('outcome.succeeded')) + '</span>' : badge(action.outcome)) +
      '</td><td><code>' + escapeHtml(action.evidence) + '</code></td></tr>',
    ).join('') + '</tbody></table>');
}

/** The agent's own name is the tool's vocabulary, not the transcript's, so it is written per language. */
export const agentLabel = (t: Translate, name: string): string => (name === 'Main agent' ? t('col.main') : name);
