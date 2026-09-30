import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  NO_PREFERENCES,
  preferencesFor,
  readPreferences,
  withProjectChoices,
  writtenPreferences,
} from '../../../src/report/watch/preferences.ts';

const read = (text: string) => readPreferences(text);

// R22: what a person chose, kept where a hook's command line is not.
test('a file says what was chosen, and nothing about what was not', () => {
  const answer = read('{"defaults":{"clean":"every-turn"},"projects":{"/work/app":{"on":"reached","notify":["chat","os"]}}}');

  assert.deepEqual(answer, {
    kind: 'read',
    preferences: {
      defaults: { clean: 'every-turn' },
      projects: { '/work/app': { on: 'reached', notify: ['chat', 'os'] } },
    },
  });
});

test('no file at all is not an unreadable one: nobody has chosen anything yet', () => {
  assert.deepEqual(readPreferences(undefined), { kind: 'read', preferences: NO_PREFERENCES });
  assert.deepEqual(read('{}'), { kind: 'read', preferences: NO_PREFERENCES });
});

/*
 * R24: a shape nobody recognises is not a shape to guess at. A threshold read out of `"on": "everything"` would be
 * a person told less than they asked to be, and quietly - the one failure this channel must not have.
 */
test('anything this version does not recognise makes the whole file unusable', () => {
  for (const text of [
    'not json at all',
    '[]',
    '{"defaults":{"on":"everything"}}',
    '{"defaults":{"clean":"sometimes"}}',
    '{"defaults":{"notify":["email"]}}',
    '{"defaults":{"notify":[]}}',
    '{"defaults":"quiet"}',
    '{"projects":[]}',
    '{"projects":{"/work/app":{"on":1}}}',
    '{"defaults":{"lang":"fr"}}',
  ]) {
    assert.deepEqual(read(text), { kind: 'unusable' }, text);
  }
});

// R24: this project over this person, and a flag over both - the flag is applied by the caller, not here.
test('a project answers over a person, and a directory inside it counts as the project', () => {
  const { preferences } = read('{"defaults":{"on":"value","clean":"once"},"projects":{"/work/app":{"on":"reached"},"/work/app/api":{"clean":"off"}}}') as {
    preferences: Parameters<typeof preferencesFor>[0];
  };

  assert.deepEqual(preferencesFor(preferences, '/work/app'), { on: 'reached', clean: 'once' });
  assert.deepEqual(preferencesFor(preferences, '/work/app/web/src'), { on: 'reached', clean: 'once' }, 'inside the project');
  // The longest match wins, so a project inside a project answers for itself and inherits nothing from the shorter one.
  assert.deepEqual(preferencesFor(preferences, '/work/app/api'), { on: 'value', clean: 'off' });
  assert.deepEqual(preferencesFor(preferences, '/work/other'), { on: 'value', clean: 'once' }, 'the person answers');
  assert.deepEqual(preferencesFor(preferences, undefined), { on: 'value', clean: 'once' });
  // A directory whose name merely begins with a project's is not inside it.
  assert.deepEqual(preferencesFor(preferences, '/work/apple'), { on: 'value', clean: 'once' });
});

test('what is written can be read back, and a project with nothing chosen is not written at all', () => {
  const one = withProjectChoices(NO_PREFERENCES, '/work/app', { on: 'refused' });
  const two = withProjectChoices(one, '/work/other', { clean: 'off' });
  const back = withProjectChoices(two, '/work/other', {});

  assert.deepEqual(readPreferences(writtenPreferences(two)), { kind: 'read', preferences: two });
  assert.deepEqual(Object.keys(back.projects), ['/work/app'], 'an empty set of answers takes the project out');
  assert.match(writtenPreferences(two), /^\{\n {2}"defaults"/, 'written to be read by a person, and by hand if need be');
});

// the-agent-tells-you R29: the language of the line is a choice like the others, kept in the same file.
test('the language of the line is read like any other choice', () => {
  assert.deepEqual(read('{"defaults":{"lang":"pl"},"projects":{"/work/app":{"lang":"de"}}}'), {
    kind: 'read',
    preferences: { defaults: { lang: 'pl' }, projects: { '/work/app': { lang: 'de' } } },
  });
});
