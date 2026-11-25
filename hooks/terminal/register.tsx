// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Register } from 'claude-code';
import { payloadOf, type Payload } from './answer.js';
import { cardLines, INDENT } from './card.js';

/**
 * agentwhy's answer as a card in Claude Code's terminal (`.ai/specs/2026-11-24-talking-about-agentwhy.md` CV4, CV12, CV13). It draws and
 * does nothing else: its one event is `ui.render`, for agentwhy's own tool; it reads no file, starts no program and changes no call.
 * Whatever it is not sure of - another surface, a shape it does not know, a call still running or in error - it leaves to Claude Code,
 * which shows the same answer in words.
 *
 * The answer arrives on the tool result's text block, as `_meta['agentwhy/answer']`: measured on 2.1.308, a block's own `_meta` is in the
 * hook's `output` and is not sent to the model, the result's `_meta` is not in `output` at all, and a `structuredContent` would take the
 * place of the text the model reads.
 */
const TOOL = 'mcp__plugin_agentwhy_agentwhy__what_happened';

interface Cells { readonly Box: any; readonly Text: any; }
/** The lines as Claude Code draws them: a `Text` a line, cut and never wrapped. */
function drawCard(payload: Payload, columns: number, { Box, Text }: Cells): any {
  return (
    <Box flexDirection="column" paddingLeft={INDENT}>
      {cardLines(payload, columns).map((line) => (
        <Text wrap="truncate-end">
          {line.length === 0 ? ' ' : line.map((each) => <Text {...(each.c === undefined ? {} : { color: each.c })} {...(each.bg === undefined ? {} : { backgroundColor: each.bg })} {...(each.b === true ? { weight: 'bold' } : {})}>{each.s}</Text>)}
        </Text>
      ))}
    </Box>
  );
}

const columnsOf = (e: any): number => (typeof e.viewport?.columns === 'number' && e.viewport.columns > 0 ? e.viewport.columns : 80);

export const register: Register = (on) => {
  on('ui.render', { component: 'ToolUse', props: { tool: TOOL } } as never, (async ($: any, e: any, next: any) => {
    if (e.surface !== 'terminal' || e.props.isRunning || e.props.isErrored || e.props.isInterrupted || e.props.isExpanded === true) return next(e);
    const payload = payloadOf(e.props.output);
    return payload === undefined ? next(e) : drawCard(payload, columnsOf(e), $.ui.resolve(e));
  }) as never);

  // 2.1.308 folds every MCP call of a turn into one line and draws no row for it: the card stands in the line's place, or under it
  // where other tools' calls are in it too.
  on('ui.render', { component: 'ToolGroup' } as never, (async ($: any, e: any, next: any) => {
    if (e.surface !== 'terminal' || e.props.isExpanded === true || !Array.isArray(e.props.calls)) return next(e);
    const own = e.props.calls.filter((call: any) => call?.tool === TOOL);
    const cards = own.map((call: any) => (call.isRunning || call.isErrored || call.isInterrupted ? undefined : payloadOf(call.output))).filter((each: Payload | undefined) => each !== undefined);
    if (cards.length === 0) return next(e);
    const table = $.ui.resolve(e);
    const { Box } = table;
    const drawn = cards.map((each: Payload) => drawCard(each, columnsOf(e), table));
    const alone = e.props.isCallsOnly === true && cards.length === e.props.calls.length;
    return <Box flexDirection="column" rowGap={1} marginTop={alone ? 1 : 0}>{alone ? undefined : await next(e)}{drawn}</Box>;
  }) as never);
};
