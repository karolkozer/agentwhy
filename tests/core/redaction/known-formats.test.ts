// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { keysInMessage } from '../../../src/core/redaction/redactor.ts';
import { CLASS_A } from '../../../src/core/redaction/secret-patterns.ts';
import { swapKeys } from '../../../src/core/redaction/swap-keys.ts';

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
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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
  // Ruleset v4.
  'xai-key': j('xai', '-', chars(ALNUM, 77), '7X7'),
  'cerebras-key': j('csk', '-', chars(LOWER, 48)),
  'nvidia-key': j('nvapi', '-', chars(ALNUM, 64)),
  'together-key': j('tgp', '_v1_', '7X7', chars(ALNUM, 40)),
  'minimax-key': j('sk-', 'api-', chars(ALNUM, 119)),
  'elevenlabs-key': j('sk', '_', chars(HEX, 48)),
  'cartesia-key': j('sk', '_car_', chars(ALNUM, 18), '7x'),
  'langfuse-key': j('sk-', 'lf-', uuid()),
  'llamacloud-key': j('llx', '-', chars(ALNUM, 48)),
  'jina-key': j('jina', '_', chars(ALNUM, 60)),
  'tavily-key': j('tvly', '-', chars(ALNUM, 32)),
  'firecrawl-key': j('fc', '-', chars(HEX, 32)),
  'apify-token': j('apify', '_api_', chars(ALNUM, 36)),
  'wandb-key': j('wandb', '_v1_', chars(ALNUM, 77)),
  'runpod-key': j('rpa', '_', chars(UPPER, 40), chars(ALNUM, 6)),
  'devin-key': j('apk', '_', chars(ALNUM, 90)),
  'daytona-key': j('dtn', '_', chars(HEX, 64)),
  'labelbox-key': j('lbx', '_', chars(ALNUM, 43)),
  'sonarqube-token': j('squ', '_', chars(HEX, 40)),
  'circleci-token': j('CCI', 'PAT_', chars(ALNUM, 22), '_', chars(HEX, 40)),
  'buildkite-token': j('bkua', '_', chars(LOWER, 40)),
  'bitbucket-token': j('ATBB', chars(ALNUM, 32)),
  'crates-token': j('cio', '47', chars(ALNUM, 30)),
  'nuget-key': j('oy2', 'b', chars(BASE32, 15), 'q', chars(BASE32, 25), 'a'),
  'packagist-token': j('packagist', '_ort_', chars(HEX, 68)),
  'cloudsmith-key': j('csa', '_', chars(HEX, 30), chars(ALNUM, 6)),
  'harness-key': j('pat', '.', chars(ALNUM, 22), '.', chars(HEX, 24), '.', chars(ALNUM, 20)),
  'octopus-key': j('API', '-', chars(UPPER, 25), '7'),
  'teamcity-token': j('eyJ0eXAi', 'OiAiVENWMiJ9', '.', chars(ALNUM, 36), '.', chars(ALNUM, 48)),
  'stackhawk-key': j('hawk', '.', chars(ALNUM, 20), '.', chars(ALNUM, 18), '7x'),
  'dependency-track-key': j('odt', '_7X7', chars(ALNUM, 37)),
  'aikido-secret': j('AIK', '_SECRET_', chars(ALNUM, 64)),
  'tailscale-key': j('tskey', '-auth-k', chars(ALNUM, 10), 'CNTRL-', chars(ALNUM, 32)),
  'unkey-key': j('unkey', '_', chars(ALNUM, 22), '7X'),
  'zuplo-key': j('zpka', '_', chars(LOWER, 32), '_', chars(HEX, 8)),
  'mergify-key': j('mergify', '_application_key_', chars(ALNUM, 48)),
  'wakatime-key': j('waka', '_', uuid()),
  'devcycle-key': j('dvc', '_server_', chars(LOWER, 28), '7x7x', '_', chars(HEX, 7)),
  'rootly-key': j('rootly', '_', chars(HEX, 64)),
  'defined-networking-key': j('dnkey', '-', chars(UPPER, 26), '-', chars(UPPER, 52)),
  'azure-key': j(chars(ALNUM, 76), '+A', 'St', chars(ALNUM, 5), 'Q=='),
  'azure-bus-key': j('Endpoint=sb://contoso.servicebus.windows.net/;SharedAccessKeyName=Root;SharedAccess', 'Key=', chars(ALNUM, 43), '='),
  'azure-sas': j('https://contoso.blob.core.windows.net/a?sv=', '2024-11-04&ss=b&se=2026-11-24T00:00:00Z&sig', '=', chars(ALNUM, 43), '%3D'),
  'azure-client-secret': j(chars(ALNUM, 3), '8', 'Q~', chars(ALNUM, 34)),
  'cloudflare-token': j('cfut', '_', chars(ALNUM, 40), chars(HEX, 8)),
  'vercel-token': j('vcp', '_', chars(ALNUM, 54), '7X'),
  'render-key': j('rnd', '_', chars(ALNUM, 28)),
  'deno-token': j('ddp', '_', chars(ALNUM, 36)),
  'upcloud-token': j('ucat', '_', chars(ALNUM, 24), '7x'),
  'ionic-token': j('ion', '_', chars(ALNUM, 42)),
  'posthog-key': j('phx', '_7X7', chars(ALNUM, 40)),
  'segment-token': j('sgp', '_', chars(ALNUM, 64)),
  'neon-key': j('napi', '_', chars(ALNUM, 64)),
  'mongodb-secret': j('mdb', '_sa_sk_', chars(ALNUM, 40)),
  'cockroach-key': j('CCDB1', '_', chars(ALNUM, 22), '_', chars(ALNUM, 40)),
  'astra-token': j('Astra', 'CS:', chars(ALNUM, 24), ':', chars(HEX, 64).toUpperCase()),
  'elastic-key': j('essu', '_', chars(ALNUM, 80)),
  'appsync-key': j('da2', '-', chars(LOWER, 26)),
  'laravel-key': j('APP_', 'KEY=base64', ':', chars(ALNUM, 43), '='),
  'valtown-token': j('vtwn', '_7X', chars(ALNUM, 30)),
  'paddle-key': j('pdl', '_live_apikey_', chars(LOWER, 26), '_', chars(ALNUM, 22), '_', chars(ALNUM, 3)),
  'polar-token': j('polar', '_oat_7X7', chars(ALNUM, 40)),
  'plaid-token': j('access', '-production-', uuid()),
  'ramp-secret': j('ramp', '_sec_', chars(ALNUM, 48)),
  'mercury-token': j('mercury', '_production_rma_', chars(ALNUM, 45), '_yrucrem'),
  'xendit-key': j('xnd', '_production_', chars(ALNUM, 60)),
  'asaas-key': j('$aact', '_prod_', chars(ALNUM, 60)),
  'woocommerce-secret': j('cs', '_', chars(HEX, 40)),
  'workos-key': j('sk', '_live_a2V5X', 'zAx', chars(ALNUM, 67)),
  'highnote-key': j('sk', '_live_a2V5X', 'zk', chars(ALNUM, 68)),
  'resend-key': j('re', '_', chars(BASE58, 8), '_', chars(BASE58, 24)),
  'mailersend-token': j('mlsn', '.', chars(HEX, 64)),
  'nylas-key': j('nyk', '_v0_', chars(ALNUM, 64)),
  'onesignal-token': j('os', '_v2_app_', chars(BASE32, 103)),
  'dropbox-token': j('sl', '.', chars(ALNUM, 135)),
  'mapbox-token': j('sk', '.eyJ1', 'Ijoi', chars(ALNUM, 40), '.', chars(ALNUM, 22)),
  'miro-token': j('eyJ', 'taXJv', chars(ALNUM, 30), '_', chars(ALNUM, 27)),
  'typeform-token': j('tfp', '_7X7', chars(ALNUM, 56)),
  'salesforce-token': j('00D', chars(ALNUM, 12), '!', chars(ALNUM, 96)),
  'zoho-token': j('1000', '.', chars(HEX, 32), '.', chars(HEX, 32)),
  'workato-token': j('wrkaus', '-eyJ', chars(ALNUM, 20), '.', chars(ALNUM, 40), '.', chars(ALNUM, 86)),
  'canva-secret': j('cnvca', chars(ALNUM, 51)),
  'cal-key': j('cal', '_live_', chars(HEX, 32)),
  'pinterest-token': j('pina', '_7X7', chars(ALNUM, 80)),
  'twitch-stream-key': j('live', '_', chars(DIGITS, 9), '_', chars(ALNUM, 30)),
  'lichess-token': j('lip', '_7X', chars(ALNUM, 18)),
  'intra42-secret': j('s-', 's4t2ud-', chars(HEX, 64)),
  'samsara-token': j('samsara', '_api_', chars(ALNUM, 30)),
  'persona-key': j('persona', '_production_', uuid()),
  'private-key-base64': j('LS0tLS1CRUdJTi', 'BSU0EgUFJJVkFURSBLRVktLS0t', chars(ALNUM, 80)),
  'wallet-key': j('x', 'prv', chars(BASE58, 107)),
  'private-key': j('-----BEGIN ', 'PRIVATE KEY-----\n', chars(ALNUM, 64), '\n-----END ', 'PRIVATE KEY-----'),
  jwt: j('eyJ', chars(ALNUM, 20), '.eyJ', chars(ALNUM, 20), '.', chars(ALNUM, 30)),
  'npmrc-auth-token': j('//registry.npmjs.org/', ':_auth', 'Token=', chars(ALNUM, 36)),
};

test('class A: every class A format has a value it must know', () => {
  assert.deepEqual(CLASS_A.map(({ name }) => name).filter((name) => KNOWN[name] === undefined), []);
  assert.deepEqual(Object.keys(KNOWN).filter((name) => !CLASS_A.some((rule) => rule.name === name)), []);
});

test('class A: each format is known in a message, by its own name, and never as a sample', () => {
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
  // Ruleset v4.
  ['docker-token', j('dckr', '_oat_', chars(ALNUM, 32))],
  ['docker-token', j('SWMTKN', '-1-', chars(LOWER, 50), '-', chars(LOWER, 25))],
  ['docker-token', j('SWMKEY', '-1-', chars(ALNUM, 43))],
  ['artifactory-key', j('cmVmd', 'Gtu', chars(ALNUM, 56))],
  ['postman-key', j('PMAT', '-', chars(ALNUM, 26))],
  ...['ct', 'sa', 'scim', 'audit'].map((kind) => ['doppler-token', j('dp.', kind, '.', chars(ALNUM, 43))] as const),
  ['doppler-token', j('dp', '.st.dev.', chars(ALNUM, 43))],
  ['aws-bedrock-key', j('bedrock-api-', 'key-YmVkcm9j', 'ay5hbWF6b25hd3MuY29t', chars(ALNUM, 60))],
  ['google-key', j('AQ', '.Ab8RN6', chars(ALNUM, 44))],
  ['google-key', j('GOCSPX', '-', chars(ALNUM, 27), '-')],
  ['heroku-key', j('HRKU', '-', chars(ALNUM, 60))],
  ['newrelic-key', j('NRAA', '-', chars(HEX, 27))],
  ['newrelic-key', j('NRII', '-', chars(ALNUM, 32))],
  ['newrelic-key', j('NRRA', '-', chars(HEX, 42))],
  ['newrelic-key', j('eu01xx', chars(HEX, 30), 'NRAL')],
  ['newrelic-key', j('px', '-api-', uuid())],
  ['grafana-token', j('eyJr', 'Ijoi', chars(ALNUM, 44), 'LCJu', chars(ALNUM, 24))],
  ['shopify-token', j('shptka', '_', chars(HEX, 32))],
  ['flutterwave-key', j('FLWSECK', '-', chars('abcdefgh0123456789', 32), '-X')],
  ['slack-token', j('xoxc', '-', chars(DIGITS, 12), '-', chars(DIGITS, 12), '-', chars(DIGITS, 12), '-', chars(HEX, 64))],
  ['slack-token', j('xoxd', '-', chars(ALNUM, 30), '%2B', chars(ALNUM, 40), '%3D')],
  ['atlassian-token', j('ATATT3', chars(ALNUM, 180), '=', chars(UPPER, 8))],
  ['devin-key', j('cog', '_', chars(BASE32, 52))],
  ['tavily-key', j('tvly', '-dev-', chars(ALNUM, 32))],
  ['circleci-token', j('CCI', 'PRJ_', chars(ALNUM, 22), '_', chars(HEX, 40))],
  ['buildkite-token', j('bkpat', '_', chars(ALNUM, 54))],
  ['bitbucket-token', j('BBDC', '-', chars(ALNUM, 40))],
  ['tailscale-key', j('tskey', '-scim-', chars(ALNUM, 12), '-', chars(ALNUM, 32))],
  ['azure-key', j(chars(ALNUM, 33), '+A', 'Sb', 'A', chars(ALNUM, 5), '=')],
  ['azure-key', j(chars(ALNUM, 42), 'Az', 'SeA', chars(ALNUM, 5))],
  ['azure-key', j(chars(ALNUM, 44), 'Az', 'Fu', chars(ALNUM, 5), 'Q==')],
  ['azure-key', j(chars(ALNUM, 52), 'JQQJ', '99', 'BKAC', chars(ALNUM, 14), 'x', chars(ALNUM, 7))],
  ['mapbox-token', j('tk', '.eyJ1', 'Ijoi', chars(ALNUM, 40), '.', chars(ALNUM, 22))],
  ['private-key-base64', j('LS0tLS1CRUdJTi', 'BPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS', chars(ALNUM, 80))],
  ['private-key', j('-----BEGIN PGP ', 'PRIVATE KEY BLOCK-----\n', chars(ALNUM, 64), '\n-----END PGP ', 'PRIVATE KEY BLOCK-----')],
];

test('class A: a format\'s other shapes are known by its name too', () => {
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
  // Ruleset v4: code, identifiers, public keys and ids the new prefixes meet.
  j('xai', '-sdk-python'), j('csk', '-', chars(LOWER, 19)), j('nvapi', '-client'), j('tgp', '_v1_short'), j('sk', '_', chars(HEX, 40)),
  j('sk', '_car_model_training_set'), j('pk-', 'lf-', uuid()), j('llx', '-agent'), j('jina', '_embeddings_v3'), j('tvly', '-search'),
  j('fc', '-event-title'), j('fc', '-', chars(HEX, 31)), j('apify', '_api_token'), j('wandb', '_v1_run'), j('rpa', '_process_automation_step'),
  j('cog', '_complexity_threshold'), j('dtn', '_', chars(HEX, 40)), j('squ', '_are'), j('squ', '_', chars(HEX, 39)), j('bkua', '_x'),
  j('cio', 'rderedCollectionOfThingsToRender'), j('oy2', 'abc'), j('packagist', '_ort_x'), j('pat', '.', chars(ALNUM, 22)), j('API', '-ENDPOINTSANDTHEIRMETHODSXYZ'),
  j('hawk', '.authenticate.request'), j('odt', '_document'), j('AIK', '_CLIENT_', chars(ALNUM, 24)), j('tskey', '-auth-example'), j('unkey', '_verificationresultcache'),
  j('waka', '_time_heartbeats_and_project_summaries_view'), j('dvc', '_server_configurationmanager'), j('rootly', '_incident'), j('dnkey', '-x'),
  j(chars(ALNUM, 76), '+A', 'St'), j('SharedAccess', 'Key=', chars(ALNUM, 20)), 'https://contoso.example/a?sv=2024-11-04&sig=x', j('8', 'Q~'),
  j('cfut', '_', chars(ALNUM, 20)), j('vcr', '_cassettes_for_the_payment_provider_integration_test_suite'), j('rnd', '_seed_for_the_generator'), j('ddp', '_find_unused_parameters'),
  j('ucat', '_abcdefghijklmnopqrstuvwxyz'), j('ion', '_button_component_styles'), j('phx', '_endpoint_configuration_for_the_web_socket_handler'),
  j('napi', '_create_reference'), j('mdb', '_sa_id_', chars(HEX, 24)), j('Astra', 'CS:short'), j('da2', '-vec'), j('base64', ':', chars(ALNUM, 43), '='),
  j('polar', '_at_the_centre_of_the_coordinate_system'), j('access', '-production-database'), j('ramp', '_id_', chars(ALNUM, 40)), j('xnd', '_public_production_x'),
  j('cs', '_', chars(HEX, 39)), j('cs', '_test_session_identifier'), j('re', '_compiled_expression_for_the_matcher'), j('re', '_', chars(BASE58, 24)), j('mlsn', '.client'),
  j('nyk', '_short'), j('os', '_v2_app_x'), j('sl', '.setValue'), j('pk', '.eyJ1', 'Ijoi', chars(ALNUM, 40), '.', chars(ALNUM, 22)), j('tfp', '_distributions_and_bijectors_for_the_probabilistic_layers_module'),
  j('00D', chars(ALNUM, 12)), j('1000', '.50'), j('cal', '_live_events'), j('pina', '_colada_recipe_with_fresh_pineapple_and_coconut'), j('live', '_stream_key'),
  j('lip', '_synchronisation_model'), j('samsara', '_api_client'), j('persona', '_production_default'), j('x', 'prv', chars(BASE58, 20)), j('x', 'pub', chars(BASE58, 107)),
  j('LS0tLS1CRUdJTi', 'BDRVJUSUZJQ0FURS0tLS0t', chars(ALNUM, 80)), j('-----BEGIN PGP ', 'PUBLIC KEY BLOCK-----'), j('ATAT', chars('ACGT', 160)), j('bedrock-api-', 'key-YmVkcm9j', 'ay5hbWF6b25hd3MuY29t'),
  j('FLW', 'PUBK_TEST-', chars(HEX, 32), '-X'), j('NRJS', '-', chars(HEX, 19)), j('eyJr', 'Ijoi', 'short'), j('shptka', '_x'), j('dckr', '_oat_x'),
  // The review of v4: slugs, long names and encoded text that a looser pattern took for a key.
  j('https://news.example/', 'xai', '-launches-a-cheaper-reasoning-model-and-cuts-prices-for-developers-in-europe/'), j('aact', '_prod_configuration_table_name'),
  j('bkps', '_a_long_name_in_snake_case_that_goes_on_for_more_than_sixty_four_chars'), j('lbx', '_annotation_project_configuration_default_name'),
  j('tgp', '_v1_the_name_of_a_long_variable_in_snake_case_xyz'), j('nvapi', '-a-kebab-phrase-that-is-long-enough-to-be-taken-for-a-key-by-mistake'),
  j('mergify', '_application_key_the_name_of_a_long_variable_in_snake_case'), j('lip', '_Sync_Model_2024_final.pth'), j('polar', '_at_R2_Theta_from_origin_of_the_grid'),
  j('pina', '_V2_physics_informed_neural_network_Burgers'), j('phx', '_Endpoint2_configuration_for_WebSocket_transport'), j('odt', '_documentTemplateForInvoiceExportGenerator'),
  j('unkey', '_verification2resultcache'), j('dvc', '_server_configurationmanager2'), j('mlsn', '.createNewMessageListenerForWebsocket2'), j('cio', '2MarshalAnyCheckpointContainerIO'),
  ...['refund request from the customer, order 1234567!', 'refused: the token could not be found in the dat', '{"k":"user#1234567890","s":"2024-01-01T00:00:00Z"}', '{"k":"v","createdAt":"2026-01-01","id":12345}']
    .map((text) => Buffer.from(text).toString('base64')),
  'git commit -m "fix: the settings page"', 'https://example.com/path?query=value', '#3b82f6', 'v1.2.3', 'en-US',
];

test('class A: what a prefix meets in ordinary text is no key', () => {
  for (const text of ORDINARY) {
    const hits = CLASS_A.filter(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text)).map(({ name }) => name);
    assert.deepEqual(hits, [], text);
  }
});

test('ruleset v4: a pattern asked only where `when` is found loses no value for it', () => {
  for (const rule of CLASS_A) {
    if (rule.when === undefined) continue;
    assert.equal(rule.when.global, false, rule.name);
    for (const value of [KNOWN[rule.name], ...ALSO.filter(([name]) => name === rule.name).map(([, also]) => also)]) {
      assert.equal(rule.when.test(value as string), true, rule.name);
    }
  }
});

test('ruleset v4: a pattern keeps what stands before the key, and hides the whole key', () => {
  for (const [name, kept] of [['azure-bus-key', 'SharedAccessKey='], ['azure-sas', '&sig='], ['laravel-key', 'APP_KEY=']] as const) {
    const value = KNOWN[name] as string;
    const [key] = keysInMessage(value);
    assert.equal(value.slice(0, key?.start).endsWith(kept), true, name);
    assert.equal(value.slice(key?.end), '', name);
  }
});

test('ruleset v4: a WorkOS key, Stripe\'s shape, is WorkOS\'s, and a Stripe key is still Stripe\'s', () => {
  assert.deepEqual(keysInMessage(KNOWN['workos-key'] as string).map((key) => key.kind), ['workos-key']);
  assert.deepEqual(keysInMessage(KNOWN['stripe-key'] as string).map((key) => key.kind), ['stripe-key']);
});

// KR5 (`2026-11-05-a-key-in-what-it-read.md`): a key is never half hidden, so a pattern reaches the end of every value it knows.
test('class A: no key is found in part', () => {
  const values = [...Object.entries(KNOWN), ...ALSO];
  const cut = values.filter(([, value]) => (keysInMessage(`"${value}"`)[0]?.end ?? 0) < value.length + 1).map(([name]) => name);
  assert.deepEqual(cut, []);
});

// The review of v4: a value longer than a format's longest is found whole or not at all. The formats of v3 below are cut still,
// as they were; the last three end in base64's padding, after which nothing is the key's.
const CUT_SINCE_V3 = new Set<string>([
  'openrouter-key', 'npm-token', 'terraform-token', 'age-secret-key', 'aws-access-key-id', 'google-key', 'azure-storage-key', 'digitalocean-token',
  'flyio-token', 'scalingo-token', 'planetscale-token', 'square-token', 'flutterwave-key', 'duffel-token', 'slack-webhook', 'discord-webhook',
  'teams-webhook', 'frameio-token', 'private-key', 'openai-key', 'gitlab-token', 'sentry-token',
  'azure-key', 'azure-bus-key', 'laravel-key',
]);

test('ruleset v4: a value longer than its format is found whole or not at all', () => {
  const more = 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7';
  const cut = [...Object.entries(KNOWN), ...ALSO].filter(([name, value]) => {
    const key = keysInMessage(`"${value}${more}"`)[0];
    return key !== undefined && key.end < value.length + more.length + 1 && !CUT_SINCE_V3.has(name);
  });
  assert.deepEqual([...new Set(cut.map(([name]) => name))], []);
});

test('ruleset v4: what ends a sentence, or joins a word to a key, does not lose it', () => {
  const google = j('GOCSPX', '-', chars(ALNUM, 28));
  const azure = KNOWN['azure-client-secret'] as string;
  assert.equal(keysInMessage(`${google}-note`)[0]?.kind, 'google-key');
  for (const text of [`It is ${azure}.`, `${azure}- and`, `/${azure}`]) assert.equal(keysInMessage(text)[0]?.kind, 'azure-client-secret', text.length.toString());
  const sas = KNOWN['azure-sas'] as string;
  for (const joined of [sas.replaceAll('&', '&amp;'), sas.replaceAll('&', '\\u0026')]) assert.equal(keysInMessage(joined)[0]?.kind, 'azure-sas');
});

test('ruleset v4: a base64 private key wrapped over lines is hidden whole, and so is one that is a whole result', () => {
  // Made anew on each run, and used by nothing.
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const encoded = Buffer.from(pem).toString('base64');
  for (const width of [64, 76, 100, 120, 128]) {
    const lines = encoded.match(new RegExp(`.{1,${width}}`, 'g')) as string[];
    const text = `tls.key: ${lines.join('\n  ')}\nNEXT_VALUE: abc\n`;
    const { value, count } = swapKeys(text);
    assert.equal(count, 1, `${width}`);
    // Nothing of the key itself: at most the last characters of the END marker, which is no key.
    for (const line of lines.slice(0, -1)) assert.equal((value as string).includes(line), false, `${width}`);
    assert.equal((value as string).includes('NEXT_VALUE: abc'), true, `${width}`);
  }
  // Joined by an escaped newline, as JSON text holds it, ended by a quote, and with Windows' line ends.
  for (const width of [64, 76, 120]) {
    const lines = encoded.match(new RegExp(`.{1,${width}}`, 'g')) as string[];
    for (const text of [JSON.stringify({ key: lines.join('\n') }), JSON.stringify({ key: lines.join('\r\n') }), `key="${lines.join('\n')}"`, lines.join('\r\n')]) {
      const { value } = swapKeys(text);
      for (const line of lines) assert.equal((value as string).includes(line), false, `${width} ${text.slice(0, 5)}`);
    }
  }
  assert.equal(swapKeys(encoded).count, 1);
  assert.equal(swapKeys({ stdout: `${encoded}\n` }).count, 1);
});

test('ruleset v4: no pattern is slow on a long line of its own prefix', () => {
  const started = performance.now();
  for (const opens of [j('wrka', '-eyJ-'), j('phx', '_'), j('polar', '_at_'), 'sv=2024-01-01&a=b', j('LS0tLS1CRUdJTi', 'BSU0EgUFJJVkFURSBLRVktLS0t\n'), j('sl', '.'), j('Astra', 'CS:')]) {
    const text = opens.repeat(Math.ceil(131072 / opens.length));
    for (const rule of CLASS_A) if (['workato-token', 'posthog-key', 'polar-token', 'azure-sas', 'private-key-base64', 'dropbox-token', 'astra-token'].includes(rule.name)) [...text.matchAll(rule.pattern)];
  }
  assert.ok(performance.now() - started < 5000);
});

test('ruleset v4: nearly every value of a format that asks for digits or a capital is found', () => {
  // `chars` takes the low bits of its sequence, which repeat; these are drawn evenly, and are the same on every run.
  let state = 20261124;
  const drawn = (alphabet: string, n: number): string => Array.from({ length: n }, () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return alphabet[((x ^ (x >>> 14)) >>> 0) % alphabet.length] as string;
  }).join('');
  // Of 2000 each: what random characters alone give, so that a question narrower than the value shows itself.
  const made: Readonly<Record<string, () => string>> = {
    'xai-key': () => j('xai', '-', drawn(ALNUM, 80)), 'together-key': () => j('tgp', '_v1_', drawn(ALNUM, 43)), 'posthog-key': () => j('phx', '_', drawn(ALNUM, 43)),
    'polar-token': () => j('polar', '_oat_', drawn(ALNUM, 43)), 'lichess-token': () => j('lip', '_', drawn(ALNUM, 20)), 'valtown-token': () => j('vtwn', '_', drawn(ALNUM, 32)),
    'crates-token': () => j('cio', drawn(ALNUM, 32)), 'dependency-track-key': () => j('odt', '_', drawn(ALNUM, 32)), 'unkey-key': () => j('unkey', '_', drawn(ALNUM, 24)),
    'asaas-key': () => j('aact', '_prod_', drawn(`${ALNUM}+/`, 160)), 'elastic-key': () => j('essu', '_', drawn(`${ALNUM}+/`, 80)), 'vercel-token': () => j('vcp', '_', drawn(ALNUM, 56)),
    'stackhawk-key': () => j('hawk', '.', drawn(ALNUM, 20), '.', drawn(ALNUM, 20)), 'mongodb-secret': () => j('mdb', '_sa_sk_', drawn(ALNUM, 40)),
  };
  for (const [name, make] of Object.entries(made)) {
    const missed = Array.from({ length: 2000 }, make).filter((value) => keysInMessage(`"${value}"`)[0]?.kind !== name).length;
    assert.ok(missed <= 70, `${name}: ${missed} of 2000 missed`);
  }
});

// JSON text holds a newline as two characters, and the `n` of them is a letter: a pattern that asked for a word's edge before
// its prefix found no key there.
test('class A: a key after an escaped newline, return or tab is found whole, by its own name', () => {
  for (const escape of ['\\n', '\\r\\n', '\\t', '\\\\n']) {
    const lost = [...Object.entries(KNOWN), ...ALSO].filter(([name, value]) => {
      const key = keysInMessage(`{"file":"A=1${escape}${value}"}`)[0];
      return key?.kind !== name || key.end < 12 + escape.length + value.length;
    }).map(([name]) => name);
    assert.deepEqual([...new Set(lost)], [], escape);
  }
});

test('class A: a letter that is no escape still stands in the way, so a prefix inside a word is none', () => {
  for (const before of ['n', 'xn', '\\x', '\\nn', '/tmp']) {
    for (const name of ['render-key', 'neon-key', 'huggingface-token', 'databricks-token']) {
      assert.deepEqual(keysInMessage(`${before}${KNOWN[name]}`).map((key) => key.kind), [], `${before} ${name}`);
    }
  }
});
