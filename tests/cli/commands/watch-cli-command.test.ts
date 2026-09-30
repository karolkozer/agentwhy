import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { WatchCliCommand } from '../../../src/cli/commands/watch-cli-command.ts';
import type { NoticeChannel, WatchOptions } from '../../../src/report/watch/subagent-watch.ts';
import type { WatchNotice } from '../../../src/report/watch/watch-notice.ts';

function commandWith(interactive = false) {
  const ran: WatchOptions[] = [];
  const announced: { notice: WatchNotice; channels: readonly NoticeChannel[] }[] = [];
  const command = new WatchCliCommand({
    watch: {
      run: async (options) => {
        ran.push(options);
        return { notice: { kind: 'quiet' }, output: '' };
      },
      announce: async (notice, channels) => {
        announced.push({ notice, channels });
        return { notice, output: 'announced' };
      },
    },
    interactive,
  });
  return { command, ran, announced };
}

// The default is the line in the conversation and nothing that pops up: three notices for one finding is what a
// user asked to be rid of (`a-notice-in-the-conversation.md` R12).
test('with nothing given, only a value alerts, in the conversation, under the default policy', async () => {
  const { command, ran } = commandWith();

  assert.deepEqual(await command.execute([]), { kind: 'completed', output: '', exitCode: 0 });
  // Nothing written is nothing chosen: the use case settles it from what the person set, then from the defaults.
  assert.deepEqual(ran, [{}]);
});

test('the flags arrive as the use case expects them', async () => {
  const { command, ran } = commandWith();

  await command.execute(['--settings', '/work/app/.claude/settings.json', '--policy', 'policy.json', '--on', 'reached', '--clean', 'every-turn', '--notify', 'os']);

  assert.deepEqual(ran, [{ on: 'reached', clean: 'every-turn', channels: ['os'], policyPath: 'policy.json', settingsPath: '/work/app/.claude/settings.json' }]);
});

// Spec R8 and §2 D4: exit 2 from a SubagentStop hook is an instruction to the agent, so a misconfigured hook says so
// to the user and exits 0.
for (const args of [['--unknown'], ['--on', 'everything'], ['--clean', 'sometimes'], ['positional'], ['--notify', 'email'], ['--notify', '']]) {
  test(`arguments it cannot use (${args.join(' ')}) exit 0 with a notice, and nothing runs`, async () => {
    const { command, ran, announced } = commandWith();

    const result = await command.execute(args);

    assert.deepEqual(result, { kind: 'completed', output: 'announced', exitCode: 0 });
    assert.equal(announced[0]?.notice.kind === 'not-checked' ? announced[0].notice.reason : undefined, 'arguments');
    assert.deepEqual(ran, []);
  });
}

// A usable channel list still carries a notice about a threshold it cannot use, and only there.
test('a bad threshold is announced on the channels that were asked for', async () => {
  const { command, announced } = commandWith();

  await command.execute(['--on', 'everything', '--notify', 'terminal']);

  assert.deepEqual(announced[0]?.channels, ['terminal']);
});

// R13: at a terminal there is no hook, and nobody for exit 2 to instruct.
test('run at a terminal it is a usage error, and reads nothing', async () => {
  const { command, ran } = commandWith(true);

  assert.equal((await command.execute([])).kind, 'usage-error');
  assert.deepEqual(ran, []);
});

// R12.
test('--help prints the hook entry to paste, and says nothing is installed', async () => {
  const { command } = commandWith();

  const result = await command.execute(['--help']);

  assert.equal(result.kind, 'help');
  const usage = result.kind === 'help' ? result.usage : '';
  assert.match(usage, /"SubagentStop"/);
  assert.match(usage, /agentwhy watch --settings \\"\$CLAUDE_PROJECT_DIR\/\.claude\/settings\.json\\"/);
  assert.match(usage, /watch itself installs nothing/);
  // worth-running-every-day R7: the way to have it installed, by a person's own act.
  assert.match(usage, /run agentwhy init in the project, which asks before it writes/);
});
