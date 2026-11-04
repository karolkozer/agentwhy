// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keysInMessage } from '../../../src/core/redaction/redactor.ts';
import { CLASS_A } from '../../../src/core/redaction/secret-patterns.ts';

// Ruleset v3 (`.ai/skills/add-secret-pattern/SKILL.md`): every class A format has a value it must know, built here from
// pieces so that no line of this file reads as a key - to the export's own scan (P9) or to gitleaks. The values are
// made up by a fixed sequence below, never taken from anywhere.

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const HEX = '0123456789abcdef';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DIGITS = '0123456789';
const BECH32 = 'QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L';

let seed = 7;
/** `n` characters of `alphabet`, from a fixed sequence: the same on every run, and no run of one character. */
function chars(alphabet: string, n: number): string {
  let out = '';
  while (out.length < n) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const next = alphabet[seed % alphabet.length] as string;
    if (next !== out.at(-1)) out += next;
  }
  return out;
}
const uuid = (): string => [8, 4, 4, 4, 12].map((n) => chars(HEX, n)).join('-');
const j = (...parts: string[]): string => parts.join('');

const KNOWN: Readonly<Record<string, string>> = {
  'anthropic-key': j('sk-', 'ant-', 'api03-', chars(ALNUM, 93), 'AA'),
  'openai-key': j('sk-', chars(ALNUM, 48)),
  'openrouter-key': j('sk-', 'or-v1-', chars(HEX, 64)),
  'huggingface-token': j('hf', '_', chars(LETTERS, 34)),
  'perplexity-key': j('pplx', '-', chars(ALNUM, 48)),
  'groq-key': j('gsk', '_', chars(ALNUM, 52)),
  'replicate-token': j('r8', '_', chars(ALNUM, 37)),
  'langsmith-key': j('lsv2', '_pt_', chars(HEX, 32), '_', chars(HEX, 10)),
  'pinecone-key': j('pcsk', '_', chars(ALNUM, 60)),
  'github-token': j('ghp', '_', chars(ALNUM, 36)),
  'gitlab-token': j('glpat', '-', chars(ALNUM, 20)),
  'npm-token': j('npm', '_', chars(ALNUM, 36)),
  'pypi-token': j('pypi-', 'AgEIcHlwaS5vcmc', chars(ALNUM, 60)),
  'rubygems-key': j('rubygems', '_', chars(HEX, 48)),
  'clojars-token': j('CLOJARS', '_', chars(ALNUM, 60)),
  'docker-token': j('dckr', '_pat_', chars(ALNUM, 27)),
  'artifactory-key': j('AKCp', chars(ALNUM, 69)),
  'postman-key': j('PMAK', '-', chars(HEX, 24), '-', chars(HEX, 34)),
  'sourcegraph-token': j('sgp', '_', chars(HEX, 40)),
  'readme-key': j('rdme', '_', chars(LOWER, 70)),
  'prefect-key': j('pnu', '_', chars(ALNUM, 36)),
  'pulumi-token': j('pul', '-', chars(HEX, 40)),
  'terraform-token': j(chars(ALNUM, 14), '.atlas', 'v1.', chars(ALNUM, 65)),
  'vault-token': j('hvs', '.', chars(ALNUM, 100)),
  'doppler-token': j('dp', '.pt.', chars(ALNUM, 43)),
  'onepassword-token': j('ops', '_eyJ', chars(ALNUM, 260)),
  'age-secret-key': j('AGE-', 'SECRET-KEY-1', chars(BECH32, 58)),
  'infracost-token': j('ico', '-', chars(ALNUM, 32)),
  'openshift-token': j('sha256', '~', chars(ALNUM, 43)),
  'aws-access-key-id': j('AKIA', chars(UPPER, 16)),
  'aws-bedrock-key': j('ABSK', chars(ALNUM, 120)),
  'google-key': j('AIza', chars(ALNUM, 35)),
  'azure-storage-key': j('AccountKey', '=', chars(ALNUM, 86), '=='),
  'alibaba-key': j('LTAI', chars(ALNUM, 20)),
  'cloudflare-ca-key': j('v1.0', '-', chars(HEX, 24), '-', chars(HEX, 146)),
  'digitalocean-token': j('dop', '_v1_', chars(HEX, 64)),
  'heroku-key': j('HRKU', '-AA', chars(ALNUM, 58)),
  'flyio-token': j('fo1', '_', chars(ALNUM, 43)),
  'netlify-token': j('nfp', '_', chars(ALNUM, 36)),
  'scalingo-token': j('tk-us', '-', chars(ALNUM, 48)),
  'databricks-token': j('dapi', chars(HEX, 32)),
  'dynatrace-token': j('dt0c01', '.', chars(ALNUM, 24), '.', chars(ALNUM, 64)),
  'grafana-token': j('glsa', '_', chars(ALNUM, 32), '_', chars(HEX, 8)),
  'newrelic-key': j('NRAK', '-', chars(UPPER, 27)),
  'sentry-token': j('sntryu', '_', chars(HEX, 64)),
  'supabase-key': j('sbp', '_', chars(ALNUM, 40)),
  'planetscale-token': j('pscale', '_tkn_', chars(ALNUM, 43)),
  'airtable-token': j('pat', chars(ALNUM, 14), '.', chars(HEX, 64)),
  'stripe-key': j('sk', '_live_', chars(ALNUM, 24)),
  'square-token': j('sq0atp', '-', chars(ALNUM, 22)),
  'shopify-token': j('shpat', '_', chars(HEX, 32)),
  'flutterwave-key': j('FLWSECK', '_TEST-', chars('abcdefgh0123456789', 32), '-X'),
  'shippo-token': j('shippo', '_live_', chars(HEX, 40)),
  'easypost-key': j('EZAK', chars(ALNUM, 54)),
  'duffel-token': j('duffel', '_live_', chars(ALNUM, 43)),
  'adobe-secret': j('p8e', '-', chars(ALNUM, 32)),
  'maxmind-key': j(chars(ALNUM, 6), '_', chars(ALNUM, 29), '_mmk'),
  'sendgrid-key': j('SG', '.', chars(ALNUM, 22), '.', chars(ALNUM, 43)),
  'brevo-key': j('xkeysib', '-', chars(HEX, 64), '-', chars(ALNUM, 16)),
  'mailchimp-key': j(chars(HEX, 32), '-us', '14'),
  'twilio-key': j('SK', chars(HEX, 32)),
  'slack-token': j('xoxb', '-', chars(DIGITS, 12), '-', chars(DIGITS, 12), '-', chars(ALNUM, 24)),
  'slack-webhook': j('hooks.slack', '.com/services/', chars(ALNUM, 44)),
  'discord-webhook': j('discord', '.com/api/webhooks/', chars(DIGITS, 18), '/', chars(ALNUM, 68)),
  'telegram-bot-token': j(chars(DIGITS, 10), ':AA', chars(ALNUM, 33)),
  'teams-webhook': j('https://', 'contoso', '.webhook.office.com/webhookb2/', uuid(), '@', uuid(), '/IncomingWebhook/', chars(LOWER, 32), '/', uuid()),
  'facebook-token': j('EAAM', chars(ALNUM, 120)),
  'atlassian-token': j('ATATT3', chars(ALNUM, 186)),
  'linear-key': j('lin', '_api_', chars(ALNUM, 40)),
  'notion-token': j('ntn', '_', chars(DIGITS, 11), chars(ALNUM, 35)),
  'figma-token': j('figd', '_', chars(ALNUM, 40)),
  'contentful-token': j('CFPAT', '-', chars(ALNUM, 43)),
  'frameio-token': j('fio-u', '-', chars(ALNUM, 64)),
  'settlemint-token': j('sm', '_pat_', chars(ALNUM, 16)),
  'private-key': j('-----BEGIN ', 'PRIVATE KEY-----\n', chars(ALNUM, 64), '\n-----END ', 'PRIVATE KEY-----'),
  jwt: j('eyJ', chars(ALNUM, 20), '.eyJ', chars(ALNUM, 20), '.', chars(ALNUM, 30)),
  'npmrc-auth-token': j('//registry.npmjs.org/', ':_auth', 'Token=', chars(ALNUM, 36)),
};

test('ruleset v3: every class A format has a value it must know', () => {
  assert.deepEqual(CLASS_A.map(({ name }) => name).filter((name) => KNOWN[name] === undefined), []);
  assert.deepEqual(Object.keys(KNOWN).filter((name) => !CLASS_A.some((rule) => rule.name === name)), []);
});

test('ruleset v3: each format is known in a message, by its own name, and never as a sample', () => {
  for (const [name, value] of Object.entries(KNOWN)) {
    const message = `Can you check why this fails?\nconst client = new Client("${value}")\n`;
    const keys = keysInMessage(message);
    assert.deepEqual(keys.map((key) => key.kind), [name], name);
    assert.equal(keys[0]?.sample, false, `${name} reads as a sample`);
  }
});

// A format's other shapes, each its own branch of the pattern.
const ALSO: readonly (readonly [string, string])[] = [
  ['openai-key', j('sk-', 'svcacct-', chars(ALNUM, 30), '_', chars(ALNUM, 27), 'T3Blbk', 'FJ', chars(ALNUM, 58))],
  ['google-key', j('GOCSPX', '-', chars(ALNUM, 28))],
  ['supabase-key', j('sb', '_secret_', chars(ALNUM, 32))],
  ['stripe-key', j('rk', '_test_', chars(ALNUM, 24))],
  ['gitlab-token', j('gldt', '-', chars(ALNUM, 20))],
  ['gitlab-token', j('glrt', '-', chars(ALNUM, 20))],
  ['gitlab-token', j('GR1348941', chars(ALNUM, 20))],
  ['slack-token', j('xapp', '-1-', chars(UPPER, 11), '-', chars(DIGITS, 13), '-', chars(HEX, 64))],
  ['aws-access-key-id', j('ABIA', chars(UPPER, 16))],
  ['flyio-token', j('fm2', '_', chars(ALNUM, 120))],
  ['vault-token', j('hvb', '.', chars(ALNUM, 150))],
  ['grafana-token', j('glc', '_', chars(ALNUM, 40))],
  ['onepassword-token', j('A3', '-', chars(UPPER, 6), '-', chars(UPPER, 11), '-', chars(UPPER, 5), '-', chars(UPPER, 5), '-', chars(UPPER, 5))],
  ['square-token', j('EAAA', chars(ALNUM, 40))],
  ['digitalocean-token', j('dor', '_v1_', chars(HEX, 64))],
  ['sentry-token', j('sntrys', '_eyJpYXQiO', chars(ALNUM, 40), '_', chars(ALNUM, 43))],
  ['huggingface-token', j('api', '_org_', chars(LETTERS, 34))],
];

test('ruleset v3: a format\'s other shapes are known by its name too', () => {
  for (const [name, value] of ALSO) {
    assert.deepEqual(keysInMessage(`token: ${value}\n`).map((key) => key.kind), [name], value.slice(0, 8));
  }
});

// The skill's false-positive fixtures: what a format's prefix meets in ordinary code, logs and prose - one too short, a
// word that only starts alike, an identifier, a hash. None is a key.
const ORDINARY: readonly string[] = [
  j('hf', '_hub_download'), j('api', '_org_name'), j('pplx', '-api'), j('gsk', '_test'), j('r8', '_cache'),
  j('glc', '_layout'), j('pat', 'ternMatches.length'), j('SK', chars(HEX, 31)), chars(HEX, 40), uuid(), chars(HEX, 32),
  j('sha256', '~', chars(ALNUM, 20)), j('ico', '-arrow-left'), j('dapi', chars(HEX, 31)), j('sk-', 'admin-dashboard-settings-wrapper-component'),
  j('tk-us', '-east-1'), j('AccountKey', '=', chars(ALNUM, 20)), j('v1.0', '-beta'), j('EAAA', 'xyz'), j('sm', '_pat_short'),
  j('CLOJARS', '_URL'), j('A3', '-ABCDEF'), j('AGE-', 'SECRET-KEY-1', chars(LOWER, 58)), j(chars(DIGITS, 8), ':AB', chars(ALNUM, 33)),
  j('hooks.slack', '.com/services/T00/B00'), j(chars(HEX, 32), '-eu1'), j('shpat', '_', chars(HEX, 31)), j('lin', '_api_docs'),
  j('ntn', '_notes'), j('figd', '_x'), j('CFPAT', '-short'), j('NRAK', '-ABC'), j('pul', '-request'), j('ops', '_eyJ', chars(ALNUM, 40)),
  j('rubygems', '_org'), j('docker', '_pat_example'), j('PMAK', '-', chars(HEX, 10)), j('fo1', '_short'), j('nfp', '_x'),
  j('hvs', '.short'), j('dp', '.pt.short'), j('ABSK', 'short'), j('LTAI', 'short'), j('sq0atp', '-short'), j('p8e', '-short'),
  j('xkeysib', '-short'), j('sb', '_secret_short'), j('GOCSPX', '-short'), j('pscale', '_tkn_short'), j('sgp', '_short'),
  'git commit -m "fix: the settings page"', 'https://example.com/path?query=value', '#3b82f6', 'v1.2.3', 'en-US',
];

test('ruleset v3: what a prefix meets in ordinary text is no key', () => {
  for (const text of ORDINARY) {
    const hits = CLASS_A.filter(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text)).map(({ name }) => name);
    assert.deepEqual(hits, [], text);
  }
});
