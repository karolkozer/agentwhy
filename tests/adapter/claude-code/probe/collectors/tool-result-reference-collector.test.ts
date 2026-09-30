import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ToolResultReferenceCollector } from '../../../../../src/adapter/claude-code/probe/collectors/tool-result-reference-collector.ts';
import { lineOf, unparsableLine } from '../../../../helpers/transcript-line.ts';

test('counts spilled results referenced from result positions only, each file once', () => {
  const collector = new ToolResultReferenceCollector();

  collector.collect(lineOf({ toolUseResult: 'saved to /w/tool-results/a1.txt' }));
  collector.collect(
    lineOf({ message: { content: [{ type: 'tool_result', content: 'see /w/tool-results/b2.txt and tool-results/a1.txt' }] } }),
  );
  collector.collect(
    lineOf({
      message: {
        content: [
          { type: 'text', text: 'tool-results/c3.txt' },
          { type: 'tool_use', input: { command: 'cat tool-results/d4.txt' } },
        ],
      },
    }),
  );
  collector.collect(lineOf({ message: { content: 'a prompt mentions tool-results/e5.txt' } }));
  collector.collect(unparsableLine('{"toolUseResult":"tool-results/f6.txt'));

  assert.deepEqual(collector.stats(['a1.txt']), { referenced: 2, missing: 1 });
});
