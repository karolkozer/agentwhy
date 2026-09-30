/**
 * Which service a key belongs to, and where a new one is made (`for-people-who-build-with-ai.md` F46). Two ways in, and
 * the page says which one it was:
 *
 * - **by format** - the secret pattern the redactor matched (`core/redaction/secret-patterns.ts`): `sk_live_…` is a
 *   Stripe key whatever line it stands on. A fact.
 * - **by name** (F45 row 2, O11) - the variable a key stood beside: `SUPABASE_SERVICE_ROLE_KEY=eyJ…` is a JWT, which no
 *   format names, and the name the file's author chose says Supabase. A guess, shown as one ("We think so from its
 *   name"), and read only from a line whose value is a key - never from a file's name.
 *
 * A link is shown only once a person has opened it and seen that it is the page where that provider's keys are made,
 * and written the date here. Until then the row names the provider and offers no link, because a wrong link in a
 * "change your keys" step sends someone to the wrong place at the worst moment.
 */
export interface Provider {
  /** The provider's own name, the same in every language. */
  readonly name: string;
  /** The word key of what it is for ("Payments", "Your AI account"). */
  readonly what: string;
  /** Where keys are made. */
  readonly url: string;
  /** `YYYY-MM-DD` a person checked `url`, or absent: an unchecked link is not drawn. */
  readonly checked?: string;
}

/** A provider, and the first words of the variable names people give its keys (`STRIPE` of `STRIPE_SECRET_KEY`). */
interface Row extends Provider {
  readonly names: readonly string[];
}

const PROVIDERS: Readonly<Record<string, Row>> = {
  // Your AI account
  anthropic: { name: 'Anthropic', what: 'provider.ai', url: 'https://console.anthropic.com/settings/keys', names: ['ANTHROPIC', 'CLAUDE'] },
  openai: { name: 'OpenAI', what: 'provider.ai', url: 'https://platform.openai.com/api-keys', names: ['OPENAI', 'OPEN_AI'] },
  mistral: { name: 'Mistral AI', what: 'provider.ai', url: 'https://console.mistral.ai/api-keys', names: ['MISTRAL'] },
  groq: { name: 'Groq', what: 'provider.ai', url: 'https://console.groq.com/keys', names: ['GROQ'] },
  cohere: { name: 'Cohere', what: 'provider.ai', url: 'https://dashboard.cohere.com/api-keys', names: ['COHERE'] },
  replicate: { name: 'Replicate', what: 'provider.ai', url: 'https://replicate.com/account/api-tokens', names: ['REPLICATE'] },
  huggingface: { name: 'Hugging Face', what: 'provider.ai', url: 'https://huggingface.co/settings/tokens', names: ['HUGGINGFACE', 'HUGGING_FACE', 'HF'] },
  perplexity: { name: 'Perplexity', what: 'provider.ai', url: 'https://www.perplexity.ai/settings/api', names: ['PERPLEXITY', 'PPLX'] },
  deepseek: { name: 'DeepSeek', what: 'provider.ai', url: 'https://platform.deepseek.com/api_keys', names: ['DEEPSEEK'] },
  together: { name: 'Together AI', what: 'provider.ai', url: 'https://api.together.ai/settings/api-keys', names: ['TOGETHER', 'TOGETHERAI', 'TOGETHER_AI'] },
  fireworks: { name: 'Fireworks AI', what: 'provider.ai', url: 'https://fireworks.ai/account/api-keys', names: ['FIREWORKS'] },
  openrouter: { name: 'OpenRouter', what: 'provider.ai', url: 'https://openrouter.ai/settings/keys', names: ['OPENROUTER', 'OPEN_ROUTER'] },
  xai: { name: 'xAI', what: 'provider.ai', url: 'https://console.x.ai', names: ['XAI', 'GROK'] },
  elevenlabs: { name: 'ElevenLabs', what: 'provider.ai', url: 'https://elevenlabs.io/app/settings/api-keys', names: ['ELEVENLABS', 'ELEVEN_LABS'] },
  assemblyai: { name: 'AssemblyAI', what: 'provider.ai', url: 'https://www.assemblyai.com/app/api-keys', names: ['ASSEMBLYAI', 'ASSEMBLY_AI'] },
  deepgram: { name: 'Deepgram', what: 'provider.ai', url: 'https://console.deepgram.com', names: ['DEEPGRAM'] },
  stability: { name: 'Stability AI', what: 'provider.ai', url: 'https://platform.stability.ai/account/keys', names: ['STABILITY'] },
  voyage: { name: 'Voyage AI', what: 'provider.ai', url: 'https://dashboard.voyageai.com', names: ['VOYAGE', 'VOYAGEAI'] },
  langsmith: { name: 'LangSmith', what: 'provider.monitoring', url: 'https://smith.langchain.com/settings', names: ['LANGSMITH', 'LANGCHAIN'] },
  pinecone: { name: 'Pinecone', what: 'provider.database', url: 'https://app.pinecone.io', names: ['PINECONE'] },

  // Payments
  stripe: { name: 'Stripe', what: 'provider.payments', url: 'https://dashboard.stripe.com/apikeys', names: ['STRIPE'] },
  paypal: { name: 'PayPal', what: 'provider.payments', url: 'https://developer.paypal.com/dashboard/applications', names: ['PAYPAL'] },
  braintree: { name: 'Braintree', what: 'provider.payments', url: 'https://www.braintreegateway.com/login', names: ['BRAINTREE'] },
  square: { name: 'Square', what: 'provider.payments', url: 'https://developer.squareup.com/apps', names: ['SQUARE'] },
  adyen: { name: 'Adyen', what: 'provider.payments', url: 'https://ca-live.adyen.com', names: ['ADYEN'] },
  lemonsqueezy: { name: 'Lemon Squeezy', what: 'provider.payments', url: 'https://app.lemonsqueezy.com/settings/api', names: ['LEMONSQUEEZY', 'LEMON_SQUEEZY', 'LEMON'] },
  paddle: { name: 'Paddle', what: 'provider.payments', url: 'https://vendors.paddle.com/authentication', names: ['PADDLE'] },
  polar: { name: 'Polar', what: 'provider.payments', url: 'https://polar.sh/dashboard', names: ['POLAR'] },
  mollie: { name: 'Mollie', what: 'provider.payments', url: 'https://my.mollie.com/dashboard/developers/api-keys', names: ['MOLLIE'] },
  razorpay: { name: 'Razorpay', what: 'provider.payments', url: 'https://dashboard.razorpay.com/app/keys', names: ['RAZORPAY'] },
  przelewy24: { name: 'Przelewy24', what: 'provider.payments', url: 'https://panel.przelewy24.pl', names: ['PRZELEWY24', 'P24'] },
  payu: { name: 'PayU', what: 'provider.payments', url: 'https://secure.payu.com', names: ['PAYU'] },
  tpay: { name: 'Tpay', what: 'provider.payments', url: 'https://panel.tpay.com', names: ['TPAY'] },
  klarna: { name: 'Klarna', what: 'provider.payments', url: 'https://portal.klarna.com', names: ['KLARNA'] },
  revenuecat: { name: 'RevenueCat', what: 'provider.payments', url: 'https://app.revenuecat.com', names: ['REVENUECAT', 'REVENUE_CAT'] },
  coinbase: { name: 'Coinbase', what: 'provider.payments', url: 'https://www.coinbase.com/settings/api', names: ['COINBASE'] },

  // Databases and backends
  supabase: { name: 'Supabase', what: 'provider.supabase', url: 'https://supabase.com/dashboard/account/tokens', names: ['SUPABASE'] },
  firebase: { name: 'Firebase', what: 'provider.backend', url: 'https://console.firebase.google.com', names: ['FIREBASE'] },
  mongodb: { name: 'MongoDB', what: 'provider.database', url: 'https://cloud.mongodb.com', names: ['MONGODB', 'MONGO', 'ATLAS'] },
  planetscale: { name: 'PlanetScale', what: 'provider.database', url: 'https://app.planetscale.com', names: ['PLANETSCALE'] },
  neon: { name: 'Neon', what: 'provider.database', url: 'https://console.neon.tech', names: ['NEON'] },
  turso: { name: 'Turso', what: 'provider.database', url: 'https://app.turso.tech', names: ['TURSO'] },
  upstash: { name: 'Upstash', what: 'provider.database', url: 'https://console.upstash.com', names: ['UPSTASH', 'KV'] },
  xata: { name: 'Xata', what: 'provider.database', url: 'https://app.xata.io', names: ['XATA'] },
  cockroach: { name: 'CockroachDB', what: 'provider.database', url: 'https://cockroachlabs.cloud', names: ['COCKROACH', 'COCKROACHDB'] },
  prisma: { name: 'Prisma', what: 'provider.database', url: 'https://console.prisma.io', names: ['PRISMA'] },
  convex: { name: 'Convex', what: 'provider.backend', url: 'https://dashboard.convex.dev', names: ['CONVEX'] },
  appwrite: { name: 'Appwrite', what: 'provider.backend', url: 'https://cloud.appwrite.io', names: ['APPWRITE'] },

  // Signing people in
  clerk: { name: 'Clerk', what: 'provider.login', url: 'https://dashboard.clerk.com', names: ['CLERK'] },
  auth0: { name: 'Auth0', what: 'provider.login', url: 'https://manage.auth0.com', names: ['AUTH0'] },
  okta: { name: 'Okta', what: 'provider.login', url: 'https://www.okta.com/login', names: ['OKTA'] },
  kinde: { name: 'Kinde', what: 'provider.login', url: 'https://app.kinde.com', names: ['KINDE'] },
  workos: { name: 'WorkOS', what: 'provider.login', url: 'https://dashboard.workos.com', names: ['WORKOS'] },
  stytch: { name: 'Stytch', what: 'provider.login', url: 'https://stytch.com/dashboard', names: ['STYTCH'] },

  // Cloud and hosting
  aws: { name: 'AWS', what: 'provider.cloud', url: 'https://console.aws.amazon.com/iam/home#/security_credentials', names: ['AWS', 'AMAZON', 'S3', 'SES'] },
  google: { name: 'Google', what: 'provider.google', url: 'https://console.cloud.google.com/apis/credentials', names: ['GOOGLE', 'GCP', 'GCLOUD', 'GEMINI', 'YOUTUBE', 'GMAIL'] },
  azure: { name: 'Microsoft Azure', what: 'provider.cloud', url: 'https://portal.azure.com', names: ['AZURE', 'MICROSOFT'] },
  vercel: { name: 'Vercel', what: 'provider.hosting', url: 'https://vercel.com/account/tokens', names: ['VERCEL'] },
  netlify: { name: 'Netlify', what: 'provider.hosting', url: 'https://app.netlify.com/user/applications', names: ['NETLIFY'] },
  cloudflare: { name: 'Cloudflare', what: 'provider.hosting', url: 'https://dash.cloudflare.com/profile/api-tokens', names: ['CLOUDFLARE', 'CF', 'R2'] },
  heroku: { name: 'Heroku', what: 'provider.hosting', url: 'https://dashboard.heroku.com/account', names: ['HEROKU'] },
  railway: { name: 'Railway', what: 'provider.hosting', url: 'https://railway.com/account/tokens', names: ['RAILWAY'] },
  render: { name: 'Render', what: 'provider.hosting', url: 'https://dashboard.render.com', names: ['RENDER'] },
  fly: { name: 'Fly.io', what: 'provider.hosting', url: 'https://fly.io/dashboard', names: ['FLY', 'FLYIO'] },
  digitalocean: { name: 'DigitalOcean', what: 'provider.servers', url: 'https://cloud.digitalocean.com/account/api/tokens', names: ['DIGITALOCEAN', 'DIGITAL_OCEAN'] },
  linode: { name: 'Linode', what: 'provider.servers', url: 'https://cloud.linode.com/profile/tokens', names: ['LINODE', 'AKAMAI'] },
  hetzner: { name: 'Hetzner', what: 'provider.servers', url: 'https://console.hetzner.cloud', names: ['HETZNER', 'HCLOUD'] },
  ovh: { name: 'OVHcloud', what: 'provider.servers', url: 'https://www.ovh.com/manager', names: ['OVH'] },
  expo: { name: 'Expo', what: 'provider.hosting', url: 'https://expo.dev/settings/access-tokens', names: ['EXPO', 'EAS'] },

  // Your code and the tools you build with
  github: { name: 'GitHub', what: 'provider.github', url: 'https://github.com/settings/tokens', names: ['GITHUB', 'GH'] },
  gitlab: { name: 'GitLab', what: 'provider.gitlab', url: 'https://gitlab.com/-/user_settings/personal_access_tokens', names: ['GITLAB'] },
  bitbucket: { name: 'Bitbucket', what: 'provider.dev', url: 'https://bitbucket.org/account/settings/app-passwords/', names: ['BITBUCKET'] },
  npm: { name: 'npm', what: 'provider.npm', url: 'https://docs.npmjs.com/creating-and-viewing-access-tokens', names: ['NPM'] },
  docker: { name: 'Docker Hub', what: 'provider.dev', url: 'https://app.docker.com/settings/personal-access-tokens', names: ['DOCKER', 'DOCKERHUB'] },
  circleci: { name: 'CircleCI', what: 'provider.dev', url: 'https://app.circleci.com/settings/user/tokens', names: ['CIRCLECI'] },

  // Errors, logs and usage
  sentry: { name: 'Sentry', what: 'provider.monitoring', url: 'https://sentry.io/settings/account/api/auth-tokens/', names: ['SENTRY'] },
  datadog: { name: 'Datadog', what: 'provider.monitoring', url: 'https://app.datadoghq.com/organization-settings/api-keys', names: ['DATADOG', 'DD'] },
  newrelic: { name: 'New Relic', what: 'provider.monitoring', url: 'https://one.newrelic.com/api-keys', names: ['NEWRELIC', 'NEW_RELIC'] },
  bugsnag: { name: 'Bugsnag', what: 'provider.monitoring', url: 'https://app.bugsnag.com/settings', names: ['BUGSNAG'] },
  logrocket: { name: 'LogRocket', what: 'provider.monitoring', url: 'https://app.logrocket.com', names: ['LOGROCKET'] },
  axiom: { name: 'Axiom', what: 'provider.monitoring', url: 'https://app.axiom.co/settings/api-tokens', names: ['AXIOM'] },
  betterstack: { name: 'Better Stack', what: 'provider.monitoring', url: 'https://betterstack.com/settings/api-tokens', names: ['BETTERSTACK', 'BETTER_STACK', 'LOGTAIL'] },
  posthog: { name: 'PostHog', what: 'provider.analytics', url: 'https://us.posthog.com/settings/user-api-keys', names: ['POSTHOG'] },
  mixpanel: { name: 'Mixpanel', what: 'provider.analytics', url: 'https://mixpanel.com/settings/project', names: ['MIXPANEL'] },
  segment: { name: 'Segment', what: 'provider.analytics', url: 'https://app.segment.com', names: ['SEGMENT'] },
  amplitude: { name: 'Amplitude', what: 'provider.analytics', url: 'https://app.amplitude.com', names: ['AMPLITUDE'] },

  // Emails, text messages, chat
  sendgrid: { name: 'SendGrid', what: 'provider.email', url: 'https://app.sendgrid.com/settings/api_keys', names: ['SENDGRID'] },
  resend: { name: 'Resend', what: 'provider.email', url: 'https://resend.com/api-keys', names: ['RESEND'] },
  mailgun: { name: 'Mailgun', what: 'provider.email', url: 'https://app.mailgun.com/settings/api_security', names: ['MAILGUN'] },
  postmark: { name: 'Postmark', what: 'provider.email', url: 'https://account.postmarkapp.com/servers', names: ['POSTMARK'] },
  mailchimp: { name: 'Mailchimp', what: 'provider.email', url: 'https://mailchimp.com/help/about-api-keys/', names: ['MAILCHIMP', 'MANDRILL'] },
  brevo: { name: 'Brevo', what: 'provider.email', url: 'https://app.brevo.com/settings/keys/api', names: ['BREVO', 'SENDINBLUE'] },
  loops: { name: 'Loops', what: 'provider.email', url: 'https://app.loops.so/settings', names: ['LOOPS'] },
  mailersend: { name: 'MailerSend', what: 'provider.email', url: 'https://app.mailersend.com', names: ['MAILERSEND'] },
  convertkit: { name: 'Kit', what: 'provider.email', url: 'https://app.kit.com', names: ['CONVERTKIT'] },
  twilio: { name: 'Twilio', what: 'provider.sms', url: 'https://console.twilio.com', names: ['TWILIO'] },
  vonage: { name: 'Vonage', what: 'provider.sms', url: 'https://dashboard.nexmo.com', names: ['VONAGE', 'NEXMO'] },
  messagebird: { name: 'MessageBird', what: 'provider.sms', url: 'https://dashboard.messagebird.com', names: ['MESSAGEBIRD'] },
  plivo: { name: 'Plivo', what: 'provider.sms', url: 'https://console.plivo.com', names: ['PLIVO'] },
  slack: { name: 'Slack', what: 'provider.slack', url: 'https://api.slack.com/apps', names: ['SLACK'] },
  discord: { name: 'Discord', what: 'provider.chat', url: 'https://discord.com/developers/applications', names: ['DISCORD'] },
  telegram: { name: 'Telegram', what: 'provider.chat', url: 'https://t.me/BotFather', names: ['TELEGRAM'] },
  whatsapp: { name: 'WhatsApp', what: 'provider.chat', url: 'https://business.facebook.com', names: ['WHATSAPP'] },
  pusher: { name: 'Pusher', what: 'provider.realtime', url: 'https://dashboard.pusher.com', names: ['PUSHER'] },
  ably: { name: 'Ably', what: 'provider.realtime', url: 'https://ably.com/accounts', names: ['ABLY'] },
  livekit: { name: 'LiveKit', what: 'provider.realtime', url: 'https://cloud.livekit.io', names: ['LIVEKIT'] },
  agora: { name: 'Agora', what: 'provider.realtime', url: 'https://console.agora.io', names: ['AGORA'] },

  // Files, maps, search, content, shops
  cloudinary: { name: 'Cloudinary', what: 'provider.files', url: 'https://console.cloudinary.com/settings/api-keys', names: ['CLOUDINARY'] },
  uploadthing: { name: 'UploadThing', what: 'provider.files', url: 'https://uploadthing.com/dashboard', names: ['UPLOADTHING'] },
  mux: { name: 'Mux', what: 'provider.files', url: 'https://dashboard.mux.com/settings/access-tokens', names: ['MUX'] },
  backblaze: { name: 'Backblaze', what: 'provider.files', url: 'https://secure.backblaze.com/app_keys.htm', names: ['BACKBLAZE', 'B2'] },
  imagekit: { name: 'ImageKit', what: 'provider.files', url: 'https://imagekit.io/dashboard/developer/api-keys', names: ['IMAGEKIT'] },
  mapbox: { name: 'Mapbox', what: 'provider.maps', url: 'https://account.mapbox.com/access-tokens/', names: ['MAPBOX'] },
  algolia: { name: 'Algolia', what: 'provider.search', url: 'https://dashboard.algolia.com/account/api-keys', names: ['ALGOLIA'] },
  meilisearch: { name: 'Meilisearch', what: 'provider.search', url: 'https://cloud.meilisearch.com', names: ['MEILISEARCH', 'MEILI'] },
  typesense: { name: 'Typesense', what: 'provider.search', url: 'https://cloud.typesense.org', names: ['TYPESENSE'] },
  elastic: { name: 'Elastic', what: 'provider.search', url: 'https://cloud.elastic.co', names: ['ELASTIC', 'ELASTICSEARCH'] },
  contentful: { name: 'Contentful', what: 'provider.content', url: 'https://app.contentful.com', names: ['CONTENTFUL'] },
  sanity: { name: 'Sanity', what: 'provider.content', url: 'https://www.sanity.io/manage', names: ['SANITY'] },
  strapi: { name: 'Strapi', what: 'provider.content', url: 'https://cloud.strapi.io', names: ['STRAPI'] },
  storyblok: { name: 'Storyblok', what: 'provider.content', url: 'https://app.storyblok.com', names: ['STORYBLOK'] },
  shopify: { name: 'Shopify', what: 'provider.shop', url: 'https://admin.shopify.com', names: ['SHOPIFY'] },
  woocommerce: { name: 'WooCommerce', what: 'provider.shop', url: 'https://woocommerce.com/my-account/', names: ['WOOCOMMERCE', 'WOO'] },

  // Social networks and work tools
  meta: { name: 'Meta (Facebook, Instagram)', what: 'provider.social', url: 'https://developers.facebook.com/apps', names: ['FACEBOOK', 'FB', 'META', 'INSTAGRAM', 'IG'] },
  twitter: { name: 'X (Twitter)', what: 'provider.social', url: 'https://developer.x.com/en/portal/dashboard', names: ['TWITTER'] },
  linkedin: { name: 'LinkedIn', what: 'provider.social', url: 'https://www.linkedin.com/developers/apps', names: ['LINKEDIN'] },
  tiktok: { name: 'TikTok', what: 'provider.social', url: 'https://developers.tiktok.com/apps', names: ['TIKTOK'] },
  reddit: { name: 'Reddit', what: 'provider.social', url: 'https://www.reddit.com/prefs/apps', names: ['REDDIT'] },
  spotify: { name: 'Spotify', what: 'provider.social', url: 'https://developer.spotify.com/dashboard', names: ['SPOTIFY'] },
  notion: { name: 'Notion', what: 'provider.workspace', url: 'https://www.notion.so/my-integrations', names: ['NOTION'] },
  airtable: { name: 'Airtable', what: 'provider.workspace', url: 'https://airtable.com/create/tokens', names: ['AIRTABLE'] },
  linear: { name: 'Linear', what: 'provider.workspace', url: 'https://linear.app/settings/account/security', names: ['LINEAR'] },
  atlassian: { name: 'Atlassian (Jira, Confluence)', what: 'provider.workspace', url: 'https://id.atlassian.com/manage-profile/security/api-tokens', names: ['ATLASSIAN', 'JIRA', 'CONFLUENCE'] },
  trello: { name: 'Trello', what: 'provider.workspace', url: 'https://trello.com/power-ups/admin', names: ['TRELLO'] },
  asana: { name: 'Asana', what: 'provider.workspace', url: 'https://app.asana.com/0/my-apps', names: ['ASANA'] },
  figma: { name: 'Figma', what: 'provider.workspace', url: 'https://www.figma.com/settings', names: ['FIGMA'] },
  hubspot: { name: 'HubSpot', what: 'provider.workspace', url: 'https://app.hubspot.com', names: ['HUBSPOT'] },
  salesforce: { name: 'Salesforce', what: 'provider.workspace', url: 'https://login.salesforce.com', names: ['SALESFORCE', 'SFDC'] },
  zendesk: { name: 'Zendesk', what: 'provider.workspace', url: 'https://www.zendesk.com/login/', names: ['ZENDESK'] },
  intercom: { name: 'Intercom', what: 'provider.workspace', url: 'https://app.intercom.com/a/apps/_/developer-hub', names: ['INTERCOM'] },
  dropbox: { name: 'Dropbox', what: 'provider.workspace', url: 'https://www.dropbox.com/developers/apps', names: ['DROPBOX'] },
  calendly: { name: 'Calendly', what: 'provider.workspace', url: 'https://calendly.com/integrations/api_webhooks', names: ['CALENDLY'] },
  zapier: { name: 'Zapier', what: 'provider.workspace', url: 'https://zapier.com/app/settings', names: ['ZAPIER'] },
};

/** Pattern name → provider. A pattern not here (`jwt`, `private-key`, `url-password`, …) names no provider. */
const BY_PATTERN: Readonly<Record<string, string>> = {
  'anthropic-key': 'anthropic',
  'openai-key': 'openai',
  'github-token': 'github',
  'gitlab-token': 'gitlab',
  'slack-token': 'slack',
  'aws-access-key-id': 'aws',
  'google-key': 'google',
  'stripe-key': 'stripe',
  'supabase-key': 'supabase',
  'npm-token': 'npm',
  'npmrc-auth-token': 'npm',
  'digitalocean-token': 'digitalocean',
  'sendgrid-key': 'sendgrid',
};

/** The first word or two of a variable name → provider: `STRIPE` → Stripe, `NEW_RELIC` → New Relic. */
const BY_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(PROVIDERS).flatMap(([id, row]) => row.names.map((name) => [name, id] as const)),
);

/**
 * What a framework puts in front of a variable it hands to the browser or the build - `NEXT_PUBLIC_SUPABASE_URL` - which
 * says nothing about the service, so it is read past. The first group are the ones a framework ships to every visitor's
 * browser: a key under one of them is public by the framework's own rule.
 */
const FRAMEWORK = /^(?:(NEXT_PUBLIC|EXPO_PUBLIC|NUXT_PUBLIC|REACT_APP|VUE_APP|VITE|GATSBY|PUBLIC)|NUXT|PRIVATE|STORYBOOK)_/;

/** A variable's name as words - `stripeSecretKey`, `stripe-secret-key` and `STRIPE_SECRET_KEY` alike - past its framework's prefix. */
export function nameWords(name: string): { readonly words: readonly string[]; readonly shipped: boolean } {
  const upper = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase().replace(/^_+/, '');
  const prefix = FRAMEWORK.exec(upper);
  const words = (prefix === null ? upper : upper.slice(prefix[0].length)).split('_').filter((word) => word !== '');
  return { words, shipped: prefix?.[1] !== undefined };
}

const entry = (id: string | undefined): Provider | undefined => {
  const row = id === undefined ? undefined : PROVIDERS[id];
  if (row === undefined) return undefined;
  const { names: _names, ...provider } = row;
  return provider;
};

/** The provider a key's format belongs to (F45 row 1), or none: `jwt`, `private-key`, a random value. */
export function providerOfPattern(pattern: string): Provider | undefined {
  return entry(BY_PATTERN[pattern]);
}

/**
 * The provider a variable's name points to (F45 row 2, O11), or none. The name is read as words - `stripeSecretKey`,
 * `stripe-secret-key` and `STRIPE_SECRET_KEY` alike - past a framework's prefix, and only its first word or two count:
 * `STRIPE_SECRET_KEY` is Stripe, and `MAX_RESEND_TRIES` is not Resend.
 */
export function providerOfName(name: string): Provider | undefined {
  const { words } = nameWords(name);
  if (words.length < 2) return undefined;
  return entry(BY_NAME.get(words[0] + '_' + words[1]) ?? BY_NAME.get(words[0] as string));
}
