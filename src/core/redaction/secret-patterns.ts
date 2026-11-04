// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Class A of spec §5.4: formats recognisable with a practically zero false-positive rate. `certain`, so they
 * redact **and** justify a finding.
 *
 * Classes B (a sensitive name beside a value) and C (entropy) are not here yet. What that means in practice is
 * written down in `redactor.ts`: an arbitrary in-house secret is caught because of **where it came from**, not
 * because of how it looks, which is the argument of §5.4 in the first place.
 */
export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

// v1: class A alone, with content from a protected resource redacted wholesale.
// v2 (2026-09-14): classes B and C, with the exclusion lists of §5.4 that make them usable at all.
// v3 (2026-11-03): class A widened from 15 formats to 77, the providers' own prefixes - the rules of gitleaks' default
// configuration (v8, MIT) that open on a fixed literal, and a few prefixes the providers document that it does not
// carry, each marked so. A rule of gitleaks that needs a keyword beside a generic value is class B, not here.
export const RULESET_VERSION = 3;

export const CLASS_A: readonly SecretPattern[] = [
  // Your AI account
  { name: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{32,}/g },
  // gitleaks: a project, service account or admin key carries `T3BlbkFJ` (base64 of `OpenAI`) in its middle.
  { name: 'openai-key', pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}|sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{58,74}T3BlbkFJ[A-Za-z0-9_-]{58,74}/g },
  // Documented by OpenRouter, not in gitleaks.
  { name: 'openrouter-key', pattern: /sk-or-v1-[a-f0-9]{64}/g },
  // gitleaks: `hf_` and an organisation's `api_org_`, letters alone.
  { name: 'huggingface-token', pattern: /\b(?:hf|api_org)_[A-Za-z]{34}\b/g },
  { name: 'perplexity-key', pattern: /\bpplx-[A-Za-z0-9]{48}\b/g },
  // Documented by Groq and Replicate, not in gitleaks.
  { name: 'groq-key', pattern: /\bgsk_[A-Za-z0-9]{52}\b/g },
  { name: 'replicate-token', pattern: /\br8_[A-Za-z0-9]{37}\b/g },
  // Documented by LangSmith and Pinecone, not in gitleaks.
  { name: 'langsmith-key', pattern: /\blsv2_(?:pt|sk)_[a-f0-9]{32}_[a-f0-9]{10}\b/g },
  { name: 'pinecone-key', pattern: /\bpcsk_[A-Za-z0-9_]{50,}/g },

  // Your code and the tools you build with
  { name: 'github-token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  // gitleaks: a personal token, and the deploy, runner, trigger, SCIM, feed, mail, agent, OAuth and job tokens, a
  // runner's registration token and a session cookie.
  { name: 'gitlab-token', pattern: /glpat-[A-Za-z0-9_-]{10,}|\bgl(?:dt|rt|ptt|soat|ffct|ft|imt|agent|oas|cbt)-[A-Za-z0-9_-]{20,}|\bGR1348941[A-Za-z0-9_-]{20}|_gitlab_session=[0-9a-z]{32}/g },
  { name: 'npm-token', pattern: /npm_[A-Za-z0-9]{36}/g },
  { name: 'pypi-token', pattern: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,1000}/g },
  { name: 'rubygems-key', pattern: /\brubygems_[a-f0-9]{48}\b/g },
  { name: 'clojars-token', pattern: /\bCLOJARS_[A-Za-z0-9]{60}\b/g },
  // Documented by Docker, not in gitleaks.
  { name: 'docker-token', pattern: /\bdckr_pat_[A-Za-z0-9_-]{27,}/g },
  { name: 'artifactory-key', pattern: /\bAKCp[A-Za-z0-9]{69}\b/g },
  { name: 'postman-key', pattern: /\bPMAK-[a-fA-F0-9]{24}-[a-fA-F0-9]{34}\b/g },
  { name: 'sourcegraph-token', pattern: /\bsgp_(?:[a-fA-F0-9]{16}_|local_)?[a-fA-F0-9]{40}\b/g },
  { name: 'readme-key', pattern: /\brdme_[a-z0-9]{70}\b/g },
  { name: 'prefect-key', pattern: /\bpnu_[A-Za-z0-9]{36}\b/g },
  { name: 'pulumi-token', pattern: /\bpul-[a-f0-9]{40}\b/g },
  { name: 'terraform-token', pattern: /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,70}/g },
  { name: 'vault-token', pattern: /\bhv[sb]\.[A-Za-z0-9_-]{90,300}/g },
  { name: 'doppler-token', pattern: /\bdp\.pt\.[A-Za-z0-9]{43}\b/g },
  { name: 'onepassword-token', pattern: /\bops_eyJ[A-Za-z0-9+/]{250,}={0,3}|\bA3-[A-Z0-9]{6}-(?:[A-Z0-9]{11}|[A-Z0-9]{6}-[A-Z0-9]{5})-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g },
  { name: 'age-secret-key', pattern: /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/g },
  { name: 'infracost-token', pattern: /\bico-[A-Za-z0-9]{32}\b/g },
  { name: 'openshift-token', pattern: /\bsha256~[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },

  // Cloud and hosting
  // gitleaks: AWS's access key ids - a user's, a session's, and the rarer `A3T`, `ABIA`, `ACCA`.
  { name: 'aws-access-key-id', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}|\b(?:A3T[A-Z0-9]|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { name: 'aws-bedrock-key', pattern: /\bABSK[A-Za-z0-9+/]{109,269}={0,2}/g },
  // `GOCSPX-` is a Google OAuth client's secret, documented by Google, not in gitleaks.
  { name: 'google-key', pattern: /AIza[A-Za-z0-9_-]{35}|ya29\.[A-Za-z0-9_-]{10,}|\bGOCSPX-[A-Za-z0-9_-]{28}\b/g },
  { name: 'azure-storage-key', pattern: /AccountKey=[A-Za-z0-9+/]{86}==/g },
  { name: 'alibaba-key', pattern: /\bLTAI[A-Za-z0-9]{20}\b/g },
  { name: 'cloudflare-ca-key', pattern: /\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b/g },
  { name: 'digitalocean-token', pattern: /do[opr]_v1_[a-f0-9]{30,}/g },
  { name: 'heroku-key', pattern: /\bHRKU-AA[0-9a-zA-Z_-]{58}/g },
  { name: 'flyio-token', pattern: /\bfo1_[A-Za-z0-9_-]{43}|\bfm1[ar]_[A-Za-z0-9+/]{100,}={0,3}|\bfm2_[A-Za-z0-9+/]{100,}={0,3}/g },
  // Documented by Netlify, not in gitleaks.
  { name: 'netlify-token', pattern: /\bnfp_[A-Za-z0-9]{36}\b/g },
  { name: 'scalingo-token', pattern: /\btk-us-[A-Za-z0-9_-]{48}/g },
  { name: 'databricks-token', pattern: /\bdapi[a-f0-9]{32}(?:-\d)?\b/g },
  { name: 'dynatrace-token', pattern: /\bdt0c01\.[A-Za-z0-9]{24}\.[A-Za-z0-9]{64}\b/g },
  { name: 'grafana-token', pattern: /\bglsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}\b|\bglc_[A-Za-z0-9+/]{32,400}={0,3}/g },
  // Documented by New Relic, not in gitleaks.
  { name: 'newrelic-key', pattern: /\bNRAK-[A-Z0-9]{27}\b/g },
  { name: 'sentry-token', pattern: /\bsntryu_[a-f0-9]{64}\b|\bsntrys_eyJpYXQiO[A-Za-z0-9+/=]{20,}_[A-Za-z0-9+/]{43}/g },

  // Databases and backends
  // `sb_secret_` is Supabase's newer secret key, documented by Supabase, not in gitleaks.
  { name: 'supabase-key', pattern: /sbp_[A-Za-z0-9]{10,}|\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: 'planetscale-token', pattern: /\bpscale_(?:tkn|oauth|pw)_[A-Za-z0-9_=.-]{32,64}/g },
  { name: 'airtable-token', pattern: /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{64}\b/g },

  // Payments and shops
  // gitleaks: test and prod keys as well as live ones - a test key opens the account's test data.
  { name: 'stripe-key', pattern: /(?:sk|rk)_(?:live|test|prod)_[A-Za-z0-9]{10,99}|whsec_[A-Za-z0-9]{10,}/g },
  { name: 'square-token', pattern: /\b(?:EAAA|sq0atp-|sq0csp-)[A-Za-z0-9_-]{22,60}/g },
  { name: 'shopify-token', pattern: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g },
  { name: 'flutterwave-key', pattern: /\bFLWSECK_TEST-[a-hA-H0-9]{32}-X|\bFLWSECK_TEST-[a-hA-H0-9]{12}\b/g },
  { name: 'shippo-token', pattern: /\bshippo_(?:live|test)_[a-fA-F0-9]{40}\b/g },
  { name: 'easypost-key', pattern: /\bEZ[AT]K[A-Za-z0-9]{54}\b/g },
  { name: 'duffel-token', pattern: /\bduffel_(?:test|live)_[A-Za-z0-9_=-]{43}/g },
  { name: 'adobe-secret', pattern: /\bp8e-[A-Za-z0-9]{32}\b/g },
  { name: 'maxmind-key', pattern: /\b[A-Za-z0-9]{6}_[A-Za-z0-9]{29}_mmk\b/g },

  // Emails, text messages, chat
  { name: 'sendgrid-key', pattern: /SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g },
  { name: 'brevo-key', pattern: /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}\b/g },
  // Documented by Mailchimp, not in gitleaks: 32 hex characters and the data centre they belong to.
  { name: 'mailchimp-key', pattern: /\b[0-9a-f]{32}-us\d{1,2}\b/g },
  { name: 'twilio-key', pattern: /\bSK[0-9a-fA-F]{32}\b/g },
  // gitleaks: the bot, user, app, legacy and configuration tokens, and a webhook's address.
  { name: 'slack-token', pattern: /xox[abeoprs]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|xoxe\.xox[bp]-\d-[A-Za-z0-9]{163,166}/g },
  { name: 'slack-webhook', pattern: /hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g },
  // Documented by Discord and Telegram, not in gitleaks.
  { name: 'discord-webhook', pattern: /discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{60,70}/g },
  { name: 'telegram-bot-token', pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g },
  { name: 'teams-webhook', pattern: /https:\/\/[a-z0-9]+\.webhook\.office\.com\/webhookb2\/[a-z0-9-]{36}@[a-z0-9-]{36}\/IncomingWebhook\/[a-z0-9]{32}\/[a-z0-9-]{36}/g },

  // Social networks, work tools, files
  { name: 'facebook-token', pattern: /\bEAA[MC][A-Za-z0-9]{100,}/g },
  { name: 'atlassian-token', pattern: /\bATATT3[A-Za-z0-9_=-]{186}/g },
  { name: 'linear-key', pattern: /\blin_api_[A-Za-z0-9]{40}\b/g },
  { name: 'notion-token', pattern: /\bntn_[0-9]{11}[A-Za-z0-9]{35}\b/g },
  // Documented by Figma, not in gitleaks.
  { name: 'figma-token', pattern: /\bfigd_[A-Za-z0-9_-]{40,}/g },
  { name: 'contentful-token', pattern: /\bCFPAT-[A-Za-z0-9_-]{43}\b/g },
  { name: 'frameio-token', pattern: /\bfio-u-[A-Za-z0-9_=-]{64}/g },
  { name: 'settlemint-token', pattern: /\bsm_[aps]at_[A-Za-z0-9]{16}\b/g },

  // Not one provider's
  { name: 'private-key', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  // Three base64url segments, the first of which starts a JSON object: `SUPABASE_SERVICE_ROLE_KEY` is one.
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g },
  // The GitHub token that sat in git history since 2024 was an `.npmrc` auth token.
  { name: 'npmrc-auth-token', pattern: /(:_authToken=)\S+/g },
];
