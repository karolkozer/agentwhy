// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { KeyToTell } from '../../core/message/keys-to-tell.ts';
import type { NoticeLang } from '../../report/watch/notice-choices.ts';
import { providerOfPattern } from '../../report/render/report-page/providers.ts';

/**
 * What a refused message says (`2026-11-01-a-key-in-your-message.md` PK3 as amended, PKD8 (b)), in the glossary's words
 * (design guidelines §7: *your AI*). The first line says that agentwhy blocked it before the AI read it - which answers the
 * copy Claude Code shows under it, keys and all ("to user myśli, że AI przeczytało to") - and why: which keys, on which
 * lines (the maintainer's word of 2026-11-01: "agentwhy zablokował mi to, bo …"); the second, what to do. No line names the AI's company, says the message never left the computer, or holds any
 * part of a key: a name the code gave a key is the only thing taken from the message, and only a configuration name.
 */

/** The name a key of a kind usually has in `.env`, where the code gave it none. */
const USUAL_NAME: Readonly<Record<string, string>> = {
  'anthropic-key': 'ANTHROPIC_API_KEY',
  'openai-key': 'OPENAI_API_KEY',
  'github-token': 'GITHUB_TOKEN',
  'gitlab-token': 'GITLAB_TOKEN',
  'slack-token': 'SLACK_TOKEN',
  'aws-access-key-id': 'AWS_ACCESS_KEY_ID',
  'google-key': 'GOOGLE_API_KEY',
  'stripe-key': 'STRIPE_SECRET_KEY',
  'supabase-key': 'SUPABASE_ACCESS_TOKEN',
  'npm-token': 'NPM_TOKEN',
  'npmrc-auth-token': 'NPM_TOKEN',
  'digitalocean-token': 'DIGITALOCEAN_TOKEN',
  'sendgrid-key': 'SENDGRID_API_KEY',
  // Ruleset v3: each name as the provider's own documentation writes it, where it writes one.
  'openrouter-key': 'OPENROUTER_API_KEY',
  'huggingface-token': 'HF_TOKEN',
  'perplexity-key': 'PERPLEXITY_API_KEY',
  'groq-key': 'GROQ_API_KEY',
  'replicate-token': 'REPLICATE_API_TOKEN',
  'langsmith-key': 'LANGSMITH_API_KEY',
  'pinecone-key': 'PINECONE_API_KEY',
  'pypi-token': 'PYPI_TOKEN',
  'rubygems-key': 'GEM_HOST_API_KEY',
  'clojars-token': 'CLOJARS_TOKEN',
  'docker-token': 'DOCKER_TOKEN',
  'artifactory-key': 'ARTIFACTORY_API_KEY',
  'postman-key': 'POSTMAN_API_KEY',
  'sourcegraph-token': 'SRC_ACCESS_TOKEN',
  'readme-key': 'README_API_KEY',
  'prefect-key': 'PREFECT_API_KEY',
  'pulumi-token': 'PULUMI_ACCESS_TOKEN',
  'terraform-token': 'TF_TOKEN',
  'vault-token': 'VAULT_TOKEN',
  'doppler-token': 'DOPPLER_TOKEN',
  'onepassword-token': 'OP_SERVICE_ACCOUNT_TOKEN',
  'age-secret-key': 'AGE_SECRET_KEY',
  'infracost-token': 'INFRACOST_API_KEY',
  'openshift-token': 'OPENSHIFT_TOKEN',
  'aws-bedrock-key': 'AWS_BEARER_TOKEN_BEDROCK',
  'azure-storage-key': 'AZURE_STORAGE_CONNECTION_STRING',
  'alibaba-key': 'ALIBABA_CLOUD_ACCESS_KEY_ID',
  'cloudflare-ca-key': 'CLOUDFLARE_ORIGIN_CA_KEY',
  'heroku-key': 'HEROKU_API_KEY',
  'flyio-token': 'FLY_API_TOKEN',
  'netlify-token': 'NETLIFY_AUTH_TOKEN',
  'scalingo-token': 'SCALINGO_API_TOKEN',
  'databricks-token': 'DATABRICKS_TOKEN',
  'dynatrace-token': 'DT_API_TOKEN',
  'grafana-token': 'GRAFANA_TOKEN',
  'newrelic-key': 'NEW_RELIC_API_KEY',
  'sentry-token': 'SENTRY_AUTH_TOKEN',
  'planetscale-token': 'PLANETSCALE_SERVICE_TOKEN',
  'airtable-token': 'AIRTABLE_TOKEN',
  'square-token': 'SQUARE_ACCESS_TOKEN',
  'shopify-token': 'SHOPIFY_ACCESS_TOKEN',
  'flutterwave-key': 'FLW_SECRET_KEY',
  'shippo-token': 'SHIPPO_API_TOKEN',
  'easypost-key': 'EASYPOST_API_KEY',
  'duffel-token': 'DUFFEL_ACCESS_TOKEN',
  'adobe-secret': 'ADOBE_CLIENT_SECRET',
  'maxmind-key': 'MAXMIND_LICENSE_KEY',
  'brevo-key': 'BREVO_API_KEY',
  'mailchimp-key': 'MAILCHIMP_API_KEY',
  'twilio-key': 'TWILIO_API_KEY',
  'slack-webhook': 'SLACK_WEBHOOK_URL',
  'discord-webhook': 'DISCORD_WEBHOOK_URL',
  'telegram-bot-token': 'TELEGRAM_BOT_TOKEN',
  'teams-webhook': 'TEAMS_WEBHOOK_URL',
  'facebook-token': 'FACEBOOK_ACCESS_TOKEN',
  'atlassian-token': 'ATLASSIAN_API_TOKEN',
  'linear-key': 'LINEAR_API_KEY',
  'notion-token': 'NOTION_TOKEN',
  'figma-token': 'FIGMA_TOKEN',
  'contentful-token': 'CONTENTFUL_MANAGEMENT_TOKEN',
  'frameio-token': 'FRAMEIO_TOKEN',
  'settlemint-token': 'SETTLEMINT_ACCESS_TOKEN',
  jwt: 'AUTH_TOKEN',
  'url-password': 'DATABASE_URL',
};

const FALLBACK_NAME = 'API_KEY';

/** The name the person is told to put the key under: the code's own where it gave one, the kind's usual one otherwise. */
export function envNameOf(key: KeyToTell): string {
  return key.name ?? USUAL_NAME[key.kind] ?? FALLBACK_NAME;
}

interface Words {
  /** What the key is, short: `a Stripe key`, `klucz Stripe`, `einen Stripe-Schlüssel`. */
  readonly kind: (key: KeyToTell) => string;
  /** Where it stands, in brackets: `(line 6)`, `(paste 2, line 3)` where there are several pastes. */
  readonly at: (key: KeyToTell, pastes: number) => string;
  readonly blocked: (items: readonly string[]) => string;
  readonly put: (keys: readonly KeyToTell[], names: readonly string[]) => string;
  readonly envOpen: string;
  /** PK11: a first message an app names its conversation from may have reached a model all the same. */
  readonly named: string;
}

const provider = (key: KeyToTell): string | undefined => providerOfPattern(key.kind)?.name;

/** `a` or `an` before an English word, by how it is said: `an AWS key`, `an OpenAI key`, `an npm key`, `a Stripe key`. */
const article = (word: string): string => (/^[AEIOU]/i.test(word) || word === 'npm' ? 'an' : 'a');

/** `a, b and c` in each language's own word for the last join. */
const listed = (items: readonly string[], and: string): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;

const WORDS: Readonly<Record<NoticeLang, Words>> = {
  en: {
    kind: (key) => {
      if (key.kind === 'url-password') return 'a password in a URL';
      if (key.kind === 'private-key') return 'a private key';
      if (key.kind === 'jwt') return 'a sign-in token';
      const name = provider(key);
      return name === undefined ? 'a key' : `${article(name)} ${name} key`;
    },
    at: (key, pastes) => (key.paste !== undefined && pastes > 1 ? `(paste ${key.paste}, line ${key.line})` : `(line ${key.line})`),
    blocked: (items) => `agentwhy blocked this message before your AI read it: it holds ${listed(items, 'and')}.`,
    put: (keys, names) => {
      const [only] = keys;
      if (keys.length > 1) return `Put them in .env as ${listed(names, 'and')}, and send the names instead.`;
      if (only?.kind === 'private-key') return 'Save it in a file, and send the file\'s name instead.';
      if (only?.kind === 'url-password') return `Put the URL in .env as ${names[0]}, and send the name instead.`;
      return `Put it in .env as ${names[0]}, and send the name instead.`;
    },
    envOpen: 'Block .env in agentwhy first.',
    named: 'This app may already have sent the message to name the chat: change these keys as well.',
  },
  pl: {
    kind: (key) => {
      if (key.kind === 'url-password') return 'hasło w adresie URL';
      if (key.kind === 'private-key') return 'klucz prywatny';
      if (key.kind === 'jwt') return 'token logowania';
      const name = provider(key);
      return name === undefined ? 'klucz' : `klucz ${name}`;
    },
    at: (key, pastes) => (key.paste !== undefined && pastes > 1 ? `(wklejka ${key.paste}, linia ${key.line})` : `(linia ${key.line})`),
    blocked: (items) => `agentwhy zablokował tę wiadomość, zanim twoje AI ją przeczytało: zawiera ${listed(items, 'i')}.`,
    put: (keys, names) => {
      const [only] = keys;
      if (keys.length > 1) return `Wpisz je do .env jako ${listed(names, 'i')} i wyślij zamiast nich te nazwy.`;
      if (only?.kind === 'private-key') return 'Zapisz go w pliku i wyślij zamiast niego nazwę pliku.';
      if (only?.kind === 'url-password') return `Wpisz adres do .env jako ${names[0]} i wyślij zamiast niego tę nazwę.`;
      return `Wpisz go do .env jako ${names[0]} i wyślij zamiast niego tę nazwę.`;
    },
    envOpen: 'Najpierw zablokuj .env w agentwhy.',
    named: 'Ta aplikacja mogła już wysłać tę wiadomość, żeby nazwać rozmowę: zmień też te klucze.',
  },
  de: {
    kind: (key) => {
      if (key.kind === 'url-password') return 'ein Passwort in einer URL';
      if (key.kind === 'private-key') return 'einen privaten Schlüssel';
      if (key.kind === 'jwt') return 'ein Anmelde-Token';
      const name = provider(key);
      return name === undefined ? 'einen Schlüssel' : `einen ${name}-Schlüssel`;
    },
    at: (key, pastes) => (key.paste !== undefined && pastes > 1 ? `(Einfügung ${key.paste}, Zeile ${key.line})` : `(Zeile ${key.line})`),
    blocked: (items) => `agentwhy hat diese Nachricht blockiert, bevor deine KI sie gelesen hat: Sie enthält ${listed(items, 'und')}.`,
    put: (keys, names) => {
      const [only] = keys;
      if (keys.length > 1) return `Trag sie in .env als ${listed(names, 'und')} ein und sende stattdessen die Namen.`;
      if (only?.kind === 'private-key') return 'Speicher ihn in einer Datei und sende stattdessen den Dateinamen.';
      if (only?.kind === 'url-password') return `Trag die URL in .env als ${names[0]} ein und sende stattdessen den Namen.`;
      return `Trag ${only?.kind === 'jwt' ? 'es' : 'ihn'} in .env als ${names[0]} ein und sende stattdessen den Namen.`;
    },
    envOpen: 'Sperr .env zuerst in agentwhy.',
    named: 'Diese App hat die Nachricht vielleicht schon gesendet, um den Chat zu benennen: Ändere diese Schlüssel auch.',
  },
};

/**
 * The reason a refused message is given, in two lines (the maintainer, 2026-11-01: "tutaj jest za dużo tekstu"): that
 * agentwhy blocked it before the AI read it and which keys stand on which lines, then what to do - with, where `.env` is
 * not closed to the AI here (PK4), that it is to be blocked first. Where it is closed, nothing is said of it.
 */
export function messageRefusalReason(keys: readonly KeyToTell[], pastes: number, lang: NoticeLang, envBlocked: boolean | undefined, named = false): string {
  const words = WORDS[lang];
  if (keys.length === 0) return '';
  const items = keys.map((key) => `${words.kind(key)} ${words.at(key, pastes)}`);
  const put = words.put(keys, [...new Set(keys.map(envNameOf))]);
  // PK11: a third line only where the message may have reached a model to name the chat.
  return [words.blocked(items), envBlocked === false ? `${put} ${words.envOpen}` : put, ...(named ? [words.named] : [])].join('\n');
}

/**
 * What the AI is handed with the person's next message after a refusal, so that it tells them itself
 * (`2026-11-01-a-key-in-your-message.md` PK10, PKD10) - as Block and Track ask the agent to (`the-agent-tells-you.md` R12c,
 * `instruction-words.ts`): agentwhy's finding passed on as agentwhy's, short, in the conversation's language, starting with
 * agentwhy's name, nothing forbidden. It holds what the refusal said - kinds, lines, names - and never any part of a key:
 * the AI did not see the message, and this is all it learns of it. In English whatever the person writes, since it is the
 * AI that reads it.
 */
export function refusedNote(keys: readonly KeyToTell[], pastes: number, envBlocked: boolean | undefined, named = false): string {
  const words = WORDS.en;
  const items = keys.map((key) => `${words.kind(key)} ${words.at(key, pastes)}`);
  const names = listed([...new Set(keys.map(envNameOf))], 'and');
  return [
    `agentwhy, the local tool this user runs, blocked their previous message before you saw it: it held ${listed(items, 'and')}.`,
    'Before you answer this message, tell the user in one or two short sentences, in the language of this conversation and in',
    `plain words, starting with **agentwhy**: that agentwhy blocked their previous message because it held ${keys.length === 1 ? 'a key' : 'keys'},`,
    `so you never saw ${keys.length === 1 ? 'it' : 'them'}; and that they can put ${keys.length === 1 ? 'it' : 'them'} in .env as ${names}`,
    `and give you ${keys.length === 1 ? 'that name' : 'those names'} instead${envBlocked === false ? ', after blocking .env in agentwhy' : ''}.`,
    // PK11: the app may have sent that first message to a model to name the chat.
    ...(named ? [`This app may have sent that first message to name the chat, so also tell them to make ${keys.length === 1 ? 'a new key' : 'new keys'} where ${keys.length === 1 ? 'it was' : 'they were'} issued.`] : []),
    'Then answer their message.',
  ].join(' ');
}
