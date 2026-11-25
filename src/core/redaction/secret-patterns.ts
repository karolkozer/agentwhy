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
  /**
   * What every value of the format holds, for a pattern that opens on no literal of its own: such a pattern is tried at every
   * place of a text, so it is asked only where this, which is cheap, is found. Never `g`: a `test` would keep its place.
   */
  readonly when?: RegExp;
}

// v1: class A alone, with content from a protected resource redacted wholesale.
// v2 (2026-09-14): classes B and C, with the exclusion lists of §5.4 that make them usable at all.
// v3 (2026-11-03): class A widened from 15 formats to 77, the providers' own prefixes - the rules of gitleaks' default
// configuration (v8, MIT) that open on a fixed literal, and a few prefixes the providers document that it does not
// carry, each marked so. A rule of gitleaks that needs a keyword beside a generic value is class B, not here.
// v4 (2026-11-24): the formats node9, betterleaks, Nosey Parker, Kingfisher, Trivy and Microsoft's security-utilities know
// and v3 did not (spec §5.4 says which and what was left out). The expressions are written here from each format's prefix,
// alphabet and length; a key a provider publishes on purpose (`pk_`, `pk.`, `pk-lf-`) or an id that opens nothing is none.
export const RULESET_VERSION = 4;

const FORMATS: readonly SecretPattern[] = [
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
  { name: 'langsmith-key', pattern: /\blsv2_(?:pt|sk)_[a-fA-F0-9]{32}_[a-fA-F0-9]{10}\b/g },
  { name: 'pinecone-key', pattern: /\bpcsk_[A-Za-z0-9_]{50,}/g },
  // v4
  { name: 'xai-key', pattern: /\bxai-(?=(?:[A-Za-z_-]{0,120}\d){2})(?=[a-z0-9_-]{0,120}[A-Z])[A-Za-z0-9]{70,120}(?![A-Za-z0-9_-])/g },
  { name: 'cerebras-key', pattern: /\bcsk-[a-z0-9]{48}\b/g },
  { name: 'nvidia-key', pattern: /\bnvapi-(?=(?:[A-Za-z_-]{0,70}\d){2})(?=[a-z0-9_-]{0,70}[A-Z])[A-Za-z0-9_-]{60,70}(?![A-Za-z0-9_-])/g },
  { name: 'together-key', pattern: /\btgp_v1_(?=(?:[A-Za-z_-]{0,43}\d){2})(?=[a-z0-9_-]{0,43}[A-Z])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },
  { name: 'minimax-key', pattern: /\bsk-api-(?=(?:[A-Za-z_-]{0,119}\d){2})(?=[a-z0-9_-]{0,119}[A-Z])[A-Za-z0-9_-]{119}(?![A-Za-z0-9_-])/g },
  { name: 'elevenlabs-key', pattern: /\bsk_[0-9a-f]{48}\b/g },
  { name: 'cartesia-key', pattern: /\bsk_car_(?=[A-Za-z0-9_]{0,19}\d)[A-Za-z0-9_]{20}(?![A-Za-z0-9_])/g },
  { name: 'langfuse-key', pattern: /\bsk-lf-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/g },
  { name: 'llamacloud-key', pattern: /\bllx-[A-Za-z0-9]{44,52}\b/g },
  { name: 'jina-key', pattern: /\bjina_(?=(?:[A-Za-z_-]{0,60}\d){2})(?=[a-z0-9_-]{0,60}[A-Z])[A-Za-z0-9_-]{60}(?![A-Za-z0-9_-])/g },
  { name: 'tavily-key', pattern: /\btvly-(?:(?:dev|prod)-)?[A-Za-z0-9]{32}\b/g },
  { name: 'firecrawl-key', pattern: /\bfc-[a-f0-9]{32}\b/g },
  { name: 'apify-token', pattern: /\bapify_api_[A-Za-z0-9]{34,38}\b/g },
  { name: 'wandb-key', pattern: /\bwandb_v1_(?=(?:[A-Za-z_-]{0,77}\d){2})(?=[a-z0-9_-]{0,77}[A-Z])[A-Za-z0-9_]{77}(?![A-Za-z0-9_-])/g },
  { name: 'runpod-key', pattern: /\brpa_[A-Z0-9]{40}[A-Za-z0-9]{6}\b/g },
  { name: 'devin-key', pattern: /\bapk_(?:user_)?(?=(?:[A-Za-z_+/-]{0,80}\d){2})(?=[a-z0-9_+/-]{0,80}[A-Z])[A-Za-z0-9+/]{80,180}={0,2}(?![A-Za-z0-9+/=_-])|\bcog_[a-z2-7]{52}\b/g },
  { name: 'daytona-key', pattern: /\bdtn_[a-f0-9]{64}\b/g },
  { name: 'labelbox-key', pattern: /\blbx_(?=(?:[A-Za-z_-]{0,43}\d){2})(?=[a-z0-9_-]{0,43}[A-Z])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },

  // Your code and the tools you build with
  { name: 'github-token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  // gitleaks: a personal token, and the deploy, runner, trigger, SCIM, feed, mail, agent, OAuth and job tokens, a
  // runner's registration token and a session cookie.
  { name: 'gitlab-token', pattern: /glpat-[A-Za-z0-9_-]{10,}|\bgl(?:dt|rt|ptt|soat|ffct|ft|imt|agent|oas|cbt)-[A-Za-z0-9_-]{20,}|\bGR1348941[A-Za-z0-9_-]{20}|_gitlab_session=[0-9a-z]{32}/g },
  { name: 'npm-token', pattern: /npm_[A-Za-z0-9]{36}/g },
  { name: 'pypi-token', pattern: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,1000}/g },
  { name: 'rubygems-key', pattern: /\brubygems_[a-f0-9]{48}\b/g },
  { name: 'clojars-token', pattern: /\bCLOJARS_[A-Za-z0-9]{60}\b/g },
  // Documented by Docker, not in gitleaks; v4: an organisation's token, a swarm's join token and unlock key.
  { name: 'docker-token', pattern: /\bdckr_(?:pat|oat)_[A-Za-z0-9_-]{27,}|\bSWMTKN-1-[a-z0-9]{50,60}-[a-z0-9]{24,30}(?![A-Za-z0-9_-])|\bSWMKEY-1-[A-Za-z0-9+/]{40,50}(?![A-Za-z0-9+/])/g },
  { name: 'artifactory-key', pattern: /\bAKCp[A-Za-z0-9]{68,70}\b|\bcmVmdGtu[A-Za-z0-9]{56}\b/g },
  { name: 'postman-key', pattern: /\bPMAK-[a-fA-F0-9]{24}-[a-fA-F0-9]{34}\b|\bPMAT-[A-Za-z0-9]{26}\b/g },
  { name: 'sourcegraph-token', pattern: /\bsgp_(?:[a-fA-F0-9]{16}_|local_)?[a-fA-F0-9]{40}\b/g },
  { name: 'readme-key', pattern: /\brdme_[a-z0-9]{70}\b/g },
  { name: 'prefect-key', pattern: /\bpnu_[A-Za-z0-9]{36}\b/g },
  { name: 'pulumi-token', pattern: /\bpul-[a-f0-9]{40}\b/g },
  { name: 'terraform-token', when: /\.atlasv1\./, pattern: /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,70}/g },
  { name: 'vault-token', pattern: /\bhv[sb]\.[A-Za-z0-9_-]{90,300}/g },
  { name: 'doppler-token', pattern: /\bdp\.(?:pt|ct|sa|scim|audit)\.[A-Za-z0-9]{40,44}\b|\bdp\.st\.(?:[a-z0-9_-]{2,35}\.)?[A-Za-z0-9]{40,44}\b/g },
  { name: 'onepassword-token', pattern: /\bops_eyJ[A-Za-z0-9+/]{250,}={0,3}|\bA3-[A-Z0-9]{6}-(?:[A-Z0-9]{11}|[A-Z0-9]{6}-[A-Z0-9]{5})-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g },
  { name: 'age-secret-key', pattern: /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/g },
  { name: 'infracost-token', pattern: /\bico-[A-Za-z0-9]{32}\b/g },
  { name: 'openshift-token', pattern: /\bsha256~[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },
  // v4
  { name: 'sonarqube-token', pattern: /\bsq[apu]_[a-f0-9]{40}\b/g },
  { name: 'circleci-token', pattern: /\bCCI(?:PAT|PRJ)_[A-Za-z0-9]{22}_[a-f0-9]{40}\b/g },
  { name: 'buildkite-token', pattern: /\bbkua_(?:[a-z0-9]{53}|[a-z0-9]{40})\b|\bbk(?:aa_(?=[A-Za-z0-9_-]{75}(?![A-Za-z0-9_-]))|aj_(?=[A-Za-z0-9_-]{333}(?![A-Za-z0-9_-]))|(?:ar|ct)_(?=[A-Za-z0-9_-]{73}(?![A-Za-z0-9_-]))|pt_(?=[A-Za-z0-9_-]{199}(?![A-Za-z0-9_-]))|pat_(?=[A-Za-z0-9_-]{54}(?![A-Za-z0-9_-]))|ps_(?=[A-Za-z0-9_-]{64}(?![A-Za-z0-9_-])))(?=(?:[A-Za-z_-]{0,54}\d){2})(?=[a-z0-9_-]{0,54}[A-Z])[A-Za-z0-9_-]{54,333}/g },
  // Bitbucket's app password and its data center's token.
  { name: 'bitbucket-token', pattern: /\bATBB[A-Za-z0-9]{32}\b|\bBBDC-[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9_-])/g },
  { name: 'crates-token', pattern: /\bcio(?=(?:[A-Za-z]{0,31}\d){2})[A-Za-z0-9]{32}\b/g },
  { name: 'nuget-key', pattern: /\boy2[a-p][a-z2-7]{15}[aq][a-z2-7]{25}[aeimquy4]\b/g },
  { name: 'packagist-token', pattern: /\bpackagist_(?:[ou][ru]t|acs)_[a-f0-9]{64,96}\b/g },
  { name: 'cloudsmith-key', pattern: /\bcsa_[a-f0-9]{30}[A-Za-z0-9]{6}\b/g },
  { name: 'harness-key', pattern: /\b[ps]at\.[A-Za-z0-9_-]{22}\.[0-9a-f]{24}\.[A-Za-z0-9]{20}\b/g },
  { name: 'octopus-key', pattern: /\bAPI-(?=[A-Z0-9]{0,25}\d)[A-Z0-9]{26}\b/g },
  { name: 'teamcity-token', pattern: /\beyJ0eXAiOiAiVENWMiJ9\.[A-Za-z0-9_-]{36}\.[A-Za-z0-9_-]{48}(?![A-Za-z0-9_-])/g },
  { name: 'stackhawk-key', pattern: /\bhawk\.[0-9A-Za-z_-]{20}\.(?=[0-9A-Za-z_-]{0,19}\d)[0-9A-Za-z_-]{20}(?![0-9A-Za-z_-])/g },
  { name: 'dependency-track-key', pattern: /\bodt_(?=(?:[A-Za-z_-]{0,31}\d){2})(?=[a-z0-9_-]{0,31}[A-Z])[A-Za-z0-9]{32,255}\b/g },
  { name: 'aikido-secret', pattern: /\bAIK_(?:SECRET_[A-Za-z0-9]{64}|CI_[A-Za-z0-9]{20,44})\b/g },
  { name: 'tailscale-key', pattern: /\btskey-(?:(?:api|auth|client|webhook)-)?k[A-Za-z0-9]{4,16}CNTRL-[A-Za-z0-9]{20,40}\b|\btskey-scim-[A-Za-z0-9]{8,24}-[A-Za-z0-9]{28,40}\b/g },
  { name: 'unkey-key', pattern: /\bunkey_(?=[A-Za-z_-]{0,31}\d)(?=[a-z0-9_-]{0,31}[A-Z])[A-Za-z0-9]{20,32}\b/g },
  { name: 'zuplo-key', pattern: /\bzpka_[a-z0-9]{32}_[0-9a-f]{8}\b/g },
  { name: 'mergify-key', pattern: /\bmergify_application_key_(?=(?:[A-Za-z_-]{0,40}\d){2})(?=[a-z0-9_-]{0,40}[A-Z])[A-Za-z0-9_-]{40,200}(?![A-Za-z0-9_-])/g },
  { name: 'wakatime-key', pattern: /\bwaka_(?=[a-z-]{0,35}\d)[a-z0-9-]{36,64}(?![A-Za-z0-9_-])/g },
  { name: 'devcycle-key', pattern: /\bdvc_server_(?=(?:[A-Za-z]{0,31}\d){2})[A-Za-z0-9]{20,32}(?:_[A-Za-z0-9]{1,16})?(?![A-Za-z0-9_-])/g },
  { name: 'rootly-key', pattern: /\brootly_[a-f0-9]{64}\b/g },
  { name: 'defined-networking-key', pattern: /\bdnkey-[A-Za-z0-9=_-]{26}-[A-Za-z0-9=_-]{52}(?![A-Za-z0-9=_-])/g },

  // Cloud and hosting
  // gitleaks: AWS's access key ids - a user's, a session's, and the rarer `A3T`, `ABIA`, `ACCA`.
  { name: 'aws-access-key-id', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}|\b(?:A3T[A-Z0-9]|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { name: 'aws-bedrock-key', pattern: /\bABSK[A-Za-z0-9+/]{109,269}={0,2}|\bbedrock-api-key-(?:YmVkcm9jay5hbWF6b25hd3MuY29t)[A-Za-z0-9+/=_-]{20,}/g },
  // `GOCSPX-` is a Google OAuth client's secret, documented by Google, not in gitleaks; v4: Gemini's newer key, `AQ.`.
  { name: 'google-key', pattern: /AIza[A-Za-z0-9_-]{35}|ya29\.[A-Za-z0-9_-]{10,}|\bGOCSPX-[A-Za-z0-9_-]{28}(?![A-Za-z0-9_])|\bAQ\.Ab8RN6[A-Za-z0-9_-]{44}(?![A-Za-z0-9_-])/g },
  { name: 'azure-storage-key', pattern: /AccountKey=[A-Za-z0-9+/]{86}==/g },
  // v4: the keys Microsoft marks in the key itself - storage, Cosmos DB, Batch, ML, API Management; Service Bus, Event Hubs,
  // Relay, IoT, Redis, Event Grid; Search, a container registry, Functions - and its annotated keys (Azure OpenAI, DevOps, Maps).
  { name: 'azure-key', when: /\+A(?:St|Ba|MC|Sb|Eh|Rm|CR)|ACDb|APIM|AIoT|Az(?:Ca|Se|Fu)|AZEG|JQQJ9/, pattern: /(?:(?<![A-Za-z0-9+/_-])|(?<=\\[nrt]))(?:[A-Za-z0-9+/]{76}(?:\+ASt|ACDb|\+ABa|\+AMC|APIM)[A-Za-z0-9+/]{5}[AQgw]==|[A-Za-z0-9+/]{33}(?:\+ASb|\+AEh|\+ARm|AIoT|AzCa|AZEG)[A-P][A-Za-z0-9+/]{5}=|[A-Za-z0-9+/]{42}(?:AzSe|\+ACR)[A-D][A-Za-z0-9+/]{5}(?![A-Za-z0-9+/=_-])|[A-Za-z0-9_-]{44}AzFu[A-Za-z0-9_-]{5}[AQgw]==|[A-Za-z0-9]{52}JQQJ9[9DH][A-Za-z0-9][A-L][A-Za-z0-9]{16}[A-Za-z][A-Za-z0-9]{7}(?:[A-Za-z0-9]{2}==)?(?![A-Za-z0-9]))/g },
  { name: 'azure-bus-key', pattern: /(SharedAccessKey=)[A-Za-z0-9+/]{43}=/g },
  { name: 'azure-sas', pattern: /(\bsv=\d{4}-\d{2}-\d{2}(?:(?:&(?:amp;)?|\\u0026)[a-z]{1,12}=[^&\s'"\\]{0,200}){1,16}?(?:&(?:amp;)?|\\u0026)sig=)[A-Za-z0-9%+/]{40,129}=?(?![A-Za-z0-9%+/=])/g },
  // Entra's client secret: `Q~` is its fourth and fifth character.
  { name: 'azure-client-secret', when: /Q~/, pattern: /(?:(?<![A-Za-z0-9_~.+-])|(?<=\\[nrt]))[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}(?![A-Za-z0-9_~]|[.+/-][A-Za-z0-9_~])/g },
  { name: 'alibaba-key', pattern: /\bLTAI[A-Za-z0-9]{20}\b/g },
  { name: 'cloudflare-ca-key', pattern: /\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b/g },
  // v4: a user's and an account's API token, marked since 2026.
  { name: 'cloudflare-token', pattern: /\bcf[ua]t_[A-Za-z0-9]{40}[a-f0-9]{8}\b/g },
  { name: 'digitalocean-token', pattern: /do[opr]_v1_[a-f0-9]{30,}/g },
  { name: 'heroku-key', pattern: /\bHRKU-[0-9a-zA-Z_-]{60}(?![0-9a-zA-Z_-])/g },
  { name: 'flyio-token', pattern: /\bfo1_[A-Za-z0-9_-]{43}|\bfm1[ar]_[A-Za-z0-9+/]{100,}={0,3}|\bfm2_[A-Za-z0-9+/]{100,}={0,3}/g },
  // Documented by Netlify, not in gitleaks.
  { name: 'netlify-token', pattern: /\bnfp_[A-Za-z0-9]{36}\b/g },
  // v4: a personal token, an AI gateway key, an integration's and an app's tokens.
  { name: 'vercel-token', pattern: /\bvc[apikr]_(?=[A-Za-z0-9_-]{0,55}\d)(?=[A-Za-z0-9_-]{0,55}[A-Z])[A-Za-z0-9_-]{56}(?![A-Za-z0-9_-])/g },
  { name: 'render-key', pattern: /\brnd_[A-Za-z0-9]{28}\b/g },
  { name: 'deno-token', pattern: /\bdd[op]_[A-Za-z0-9]{36}\b/g },
  { name: 'upcloud-token', pattern: /\bucat_(?=[A-Za-z0-9]{0,31}\d)[A-Za-z0-9]{24,32}\b/g },
  { name: 'ionic-token', pattern: /\bion_[A-Za-z0-9]{42}\b/g },
  { name: 'scalingo-token', pattern: /\btk-us-[A-Za-z0-9_-]{48}/g },
  { name: 'databricks-token', pattern: /\bdapi[a-f0-9]{32}(?:-\d)?\b/g },
  { name: 'dynatrace-token', pattern: /\bdt0c01\.[A-Za-z0-9]{24}\.[A-Za-z0-9]{64}\b/g },
  { name: 'grafana-token', pattern: /\bglsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}\b|\bglc_[A-Za-z0-9+/]{32,400}={0,3}|\beyJrIjoi[A-Za-z0-9+/]{44}LCJu[A-Za-z0-9+/]{8,340}={0,2}(?![A-Za-z0-9+/=])/g },
  // Documented by New Relic, not in gitleaks; v4: its admin, insert, query and REST keys, the license key, Pixie's.
  { name: 'newrelic-key', when: /NR(?:A[KAL]|I[IQ]|RA)|px-(?:api|dep)-/, pattern: /\bNRAK-[A-Z0-9]{27}\b|\bNRAA-[a-f0-9]{27}\b|\bNRI[IQ]-[A-Za-z0-9_-]{32}(?![A-Za-z0-9_-])|\bNRRA-[a-f0-9]{42}\b|\b[A-Za-z0-9]{6}[a-fA-F0-9]{30}NRAL\b|\bpx-(?:api|dep)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/g },
  { name: 'sentry-token', pattern: /\bsntryu_[a-f0-9]{64}\b|\bsntrys_eyJpYXQiO[A-Za-z0-9+/=]{20,}_[A-Za-z0-9+/]{43}/g },
  // v4
  { name: 'posthog-key', pattern: /\bphx_(?=(?:[A-Za-z_-]{0,60}\d){2})(?=[a-z0-9_-]{0,60}[A-Z])[A-Za-z0-9_-]{41,60}(?![A-Za-z0-9_-])/g },
  { name: 'segment-token', pattern: /\bsgp_[A-Za-z0-9]{64}\b/g },

  // Databases and backends
  // `sb_secret_` is Supabase's newer secret key, documented by Supabase, not in gitleaks.
  { name: 'supabase-key', pattern: /sbp_[A-Za-z0-9]{10,}|\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: 'planetscale-token', pattern: /\bpscale_(?:tkn|oauth|pw)_[A-Za-z0-9_=.-]{32,64}/g },
  { name: 'airtable-token', pattern: /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{64}\b/g },
  // v4
  { name: 'neon-key', pattern: /\bnapi_[A-Za-z0-9]{64}\b/g },
  { name: 'mongodb-secret', pattern: /\bmdb_sa_sk_(?=(?:[A-Za-z_-]{0,40}\d){2})(?=[a-z0-9_-]{0,40}[A-Z])[A-Za-z0-9_-]{40}(?![A-Za-z0-9_-])/g },
  { name: 'cockroach-key', pattern: /\bCCDB1_[A-Za-z0-9]{22}_[A-Za-z0-9]{40}\b/g },
  { name: 'astra-token', pattern: /\bAstraCS:[A-Za-z0-9]{20,64}(?::[a-fA-F0-9]{32,128})?(?![A-Za-z0-9:])/g },
  { name: 'elastic-key', pattern: /\bessu_(?=(?:[A-Za-z_+/-]{0,120}\d){2})(?=[a-z0-9_+/-]{0,120}[A-Z])[A-Za-z0-9+/_-]{60,300}={0,2}(?![A-Za-z0-9+/=_-])/g },
  { name: 'appsync-key', pattern: /\bda2-[a-z0-9]{26}\b/g },
  { name: 'laravel-key', pattern: /(\bAPP_KEY[ \t]{0,8}=[ \t]{0,8}["']?)base64:[A-Za-z0-9+/]{43}=/g },
  { name: 'valtown-token', pattern: /\bvtwn_(?=[A-Za-z_-]{0,80}\d)(?=[a-z0-9_-]{0,80}[A-Z])[A-Za-z0-9_-]{20,80}(?![A-Za-z0-9_-])/g },

  // Payments and shops
  // v4: WorkOS's key and Highnote's are Stripe's shape with `key_01` and `key_` in base64 inside, so they stand first: of two
  // names for one value, the first.
  { name: 'workos-key', pattern: /\bsk_(?:live|test)_a2V5XzAx[A-Za-z0-9+/]{40,120}={0,2}(?![A-Za-z0-9+/=_-])/g },
  { name: 'highnote-key', pattern: /\bsk_(?:live|test)_a2V5Xz[A-Za-z0-9+/]{60,120}={0,2}(?![A-Za-z0-9+/=_-])/g },
  // gitleaks: test and prod keys as well as live ones - a test key opens the account's test data.
  { name: 'stripe-key', pattern: /(?:sk|rk)_(?:live|test|prod)_[A-Za-z0-9]{10,99}|whsec_[A-Za-z0-9]{10,}/g },
  { name: 'square-token', pattern: /\b(?:EAAA|sq0atp-|sq0csp-)[A-Za-z0-9_-]{22,60}/g },
  { name: 'shopify-token', pattern: /\bshp(?:at|ca|pa|ss|tka)_[a-fA-F0-9]{32}\b/g },
  { name: 'flutterwave-key', pattern: /\bFLWSECK(?:_TEST)?-[a-hA-H0-9]{32}-(?:[a-z0-9]{1,20})?X|\bFLWSECK_TEST-[a-hA-H0-9]{12}\b/g },
  { name: 'shippo-token', pattern: /\bshippo_(?:live|test)_[a-fA-F0-9]{40}\b/g },
  { name: 'easypost-key', pattern: /\bEZ[AT]K[A-Za-z0-9]{54}\b/g },
  { name: 'duffel-token', pattern: /\bduffel_(?:test|live)_[A-Za-z0-9_=-]{43}/g },
  { name: 'adobe-secret', pattern: /\bp8e-[A-Za-z0-9]{32}\b/g },
  { name: 'maxmind-key', when: /_mmk/, pattern: /\b[A-Za-z0-9]{6}_[A-Za-z0-9]{29}_mmk\b/g },
  // v4
  { name: 'paddle-key', pattern: /\bpdl_(?:live|sdbx)_apikey_[a-z0-9]{26}_[A-Za-z0-9]{22}_[A-Za-z0-9]{3}\b/g },
  { name: 'polar-token', pattern: /\bpolar_(?:at|oat|pat)_(?=(?:[A-Za-z_-]{0,100}\d){2})(?=[a-z0-9_-]{0,100}[A-Z])[A-Za-z0-9_-]{32,100}(?![A-Za-z0-9_-])/g },
  { name: 'plaid-token', pattern: /\baccess-(?:sandbox|development|production)-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g },
  { name: 'ramp-secret', pattern: /\bramp_sec_[A-Za-z0-9]{48}\b/g },
  { name: 'mercury-token', pattern: /\bmercury_production_[a-z]{3,6}_[A-Za-z0-9]{40,50}_yrucrem\b/g },
  { name: 'xendit-key', pattern: /\bxnd_(?:production|development)_[A-Za-z0-9]{56,72}\b/g },
  // Asaas writes a `$` before it, which is left outside: with it the key reads as a shell variable, and so as a sample.
  { name: 'asaas-key', pattern: /\baact_(?:prod|hmlg)_(?=(?:[A-Za-z_+/-]{0,200}\d){2})(?=[a-z0-9_+/-]{0,200}[A-Z])[A-Za-z0-9+/=_-]{20,600}(?![A-Za-z0-9+/=_-])/g },
  { name: 'woocommerce-secret', pattern: /\bcs_[a-f0-9]{40}\b/g },

  // Emails, text messages, chat
  { name: 'sendgrid-key', pattern: /SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g },
  { name: 'brevo-key', pattern: /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}\b/g },
  // Documented by Mailchimp, not in gitleaks: 32 hex characters and the data centre they belong to.
  { name: 'mailchimp-key', when: /-us\d/, pattern: /\b[0-9a-f]{32}-us\d{1,2}\b/g },
  { name: 'twilio-key', pattern: /\bSK[0-9a-fA-F]{32}\b/g },
  // gitleaks: the bot, user, app, legacy and configuration tokens, and a webhook's address; v4: a browser's session token
  // (`xoxc-`) and its cookie (`xoxd-`).
  { name: 'slack-token', pattern: /xox[abceoprs]-[A-Za-z0-9-]{10,}|xoxd-[A-Za-z0-9%+/_-]{20,600}={0,2}(?![A-Za-z0-9%+/=_-])|xapp-[A-Za-z0-9-]{10,}|xoxe\.xox[bp]-\d-[A-Za-z0-9]{163,166}/g },
  { name: 'slack-webhook', pattern: /hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g },
  // Documented by Discord and Telegram, not in gitleaks.
  { name: 'discord-webhook', pattern: /discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{60,70}/g },
  { name: 'telegram-bot-token', pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g },
  { name: 'teams-webhook', pattern: /https:\/\/[a-z0-9]+\.webhook\.office\.com\/webhookb2\/[a-z0-9-]{36}@[a-z0-9-]{36}\/IncomingWebhook\/[a-z0-9]{32}\/[a-z0-9-]{36}/g },
  // v4
  { name: 'resend-key', pattern: /\bre_[1-9A-HJ-NP-Za-km-z]{8}_[1-9A-HJ-NP-Za-km-z]{24}\b/g },
  { name: 'mailersend-token', pattern: /\bmlsn\.(?=(?:[A-Za-z]{0,30}\d){2})[A-Za-z0-9]{30,100}\b/g },
  { name: 'nylas-key', pattern: /\bnyk_(?:v\d_[A-Za-z0-9]{64}|[A-Za-z0-9]{67})\b/g },
  { name: 'onesignal-token', pattern: /\bos_v2_(?:app|org)_[a-z2-7]{103}\b/g },

  // Social networks, work tools, files
  { name: 'facebook-token', pattern: /\bEAA[MC][A-Za-z0-9]{100,}/g },
  { name: 'atlassian-token', pattern: /\bATATT3[A-Za-z0-9_=-]{100,}/g },
  { name: 'linear-key', pattern: /\blin_api_[A-Za-z0-9]{40}\b/g },
  { name: 'notion-token', pattern: /\bntn_[0-9]{11}[A-Za-z0-9]{35}\b/g },
  // Documented by Figma, not in gitleaks.
  { name: 'figma-token', pattern: /\bfigd_[A-Za-z0-9_-]{40,}/g },
  { name: 'contentful-token', pattern: /\bCFPAT-[A-Za-z0-9_-]{43}\b/g },
  { name: 'frameio-token', pattern: /\bfio-u-[A-Za-z0-9_=-]{64}/g },
  { name: 'settlemint-token', pattern: /\bsm_[aps]at_[A-Za-z0-9]{16}\b/g },
  // v4
  { name: 'dropbox-token', pattern: /\bsl\.(?:u\.)?(?=(?:[A-Za-z_-]{0,130}\d){2})(?=[a-z0-9_-]{0,130}[A-Z])[A-Za-z0-9_-]{130,2000}(?![A-Za-z0-9_-])/g },
  { name: 'mapbox-token', pattern: /\b[st]k\.eyJ1Ijoi[A-Za-z0-9_-]{15,300}\.[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g },
  { name: 'miro-token', pattern: /\beyJtaXJv[A-Za-z0-9-]{10,64}_[A-Za-z0-9_-]{20,128}(?![A-Za-z0-9_-])/g },
  { name: 'typeform-token', pattern: /\btfp_(?=(?:[A-Za-z_-]{0,58}\d){2})(?=[a-z0-9_-]{0,58}[A-Z])[A-Za-z0-9_-]{59}(?![A-Za-z0-9_-])/g },
  { name: 'salesforce-token', pattern: /\b00D[A-Za-z0-9]{12}![A-Za-z0-9._-]{80,400}(?![A-Za-z0-9_-])/g },
  { name: 'zoho-token', pattern: /\b1000\.[a-f0-9]{32}\.[a-f0-9]{32}\b/g },
  { name: 'workato-token', pattern: /\bwrka(?:[a-z]{2})?-eyJ[A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{16,2000}\.[A-Za-z0-9_-]{64,1000}(?![A-Za-z0-9_-])/g },
  { name: 'canva-secret', pattern: /\bcnvca[A-Za-z0-9_-]{51}(?![A-Za-z0-9_-])/g },
  { name: 'cal-key', pattern: /\bcal_live_[a-f0-9]{32}\b/g },
  { name: 'pinterest-token', pattern: /\bpina_(?=(?:[A-Za-z_-]{0,40}\d){2})(?=[a-z0-9_-]{0,40}[A-Z])[A-Za-z0-9_-]{40,300}(?![A-Za-z0-9_-])/g },
  { name: 'twitch-stream-key', pattern: /\blive_\d{8,12}_[A-Za-z0-9]{30,36}\b/g },
  { name: 'lichess-token', pattern: /\blip_(?=[A-Za-z_-]{0,60}\d)(?=[a-z0-9_-]{0,60}[A-Z])[A-Za-z0-9]{16,60}(?![A-Za-z0-9_-])/g },
  { name: 'intra42-secret', pattern: /\bs-s4t2(?:ud|af)-[a-f0-9]{64}\b/g },
  { name: 'samsara-token', pattern: /\bsamsara_api_[A-Za-z0-9]{26,32}\b/g },
  { name: 'persona-key', pattern: /\bpersona_(?:production|sandbox)_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/g },

  // Not one provider's
  { name: 'private-key', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g },
  // v4: a private key in base64, on one line or wrapped over several; the header's own bytes say it is private.
  { name: 'private-key-base64', pattern: /\bLS0tLS1CRUdJTi(?:BSU0EgUFJJVkFURSBLRVktLS0t|BEU0EgUFJJVkFURSBLRVktLS0t|BFQyBQUklWQVRFIEtFWS0tLS0t|BQUklWQVRFIEtFWS0tLS0t|BPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS|BFTkNSWVBURUQgUFJJVkFURSBLRVktLS0t)(?:[A-Za-z0-9+/=]*(?:[ \t]*(?:\r?\n|(?:\\r)?\\n)[ \t]*[A-Za-z0-9+/]{16,}={0,2}(?=[ \t]*(?:(?:\r?\n|(?:\\r)?\\n)|["'`\\]|$)))+(?:[ \t]*(?:\r?\n|(?:\\r)?\\n)[ \t]*[A-Za-z0-9+/]{1,15}={0,2}(?=[ \t]*(?:["'`\\]|$)))?|[A-Za-z0-9+/=]{50,})/g },
  // v4: a crypto wallet's whole key, as BIP 32 writes one.
  { name: 'wallet-key', pattern: /\b[xyz]prv[1-9A-HJ-NP-Za-km-z]{107}\b/g },
  // Three base64url segments, the first of which starts a JSON object: `SUPABASE_SERVICE_ROLE_KEY` is one.
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g },
  // The GitHub token that sat in git history since 2024 was an `.npmrc` auth token.
  { name: 'npmrc-auth-token', pattern: /(:_authToken=)\S+/g },
];

/** A `\b` a pattern, or a branch of one, opens on. */
const OPENS_ON_EDGE = /(?<=^|[|(])\\b/g;
/**
 * The edge of a word, and what follows an escape too. JSON text holds a newline, a return or a tab as a backslash and a letter,
 * and that letter is no part of the word after it: with `\b` alone a key that opens a line of a file quoted in JSON was not found.
 */
const EDGE = String.raw`(?<!(?<!\\)\w|\\[^nrt\W])`;

export const CLASS_A: readonly SecretPattern[] = FORMATS.map((format) => ({
  ...format,
  pattern: new RegExp(format.pattern.source.replace(OPENS_ON_EDGE, () => EDGE), format.pattern.flags),
}));
