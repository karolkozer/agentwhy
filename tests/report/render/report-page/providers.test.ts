import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { providerOfName, providerOfPattern } from '../../../../src/report/render/report-page/providers.ts';

// `for-people-who-build-with-ai.md` F45 row 2, O11: a key line's variable name points to its service, the way people
// write it - words in any case, past a framework's prefix - and only its first word or two count.
test('a variable’s name points to its service, however it is written', () => {
  const service = (name: string): string | undefined => providerOfName(name)?.name;
  assert.equal(service('STRIPE_SECRET_KEY'), 'Stripe');
  assert.equal(service('stripeSecretKey'), 'Stripe');
  assert.equal(service('stripe-webhook-secret'), 'Stripe');
  assert.equal(service('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'Supabase');
  assert.equal(service('VITE_FIREBASE_API_KEY'), 'Firebase');
  assert.equal(service('EXPO_PUBLIC_REVENUECAT_KEY'), 'RevenueCat');
  assert.equal(service('NEW_RELIC_LICENSE_KEY'), 'New Relic');
  assert.equal(service('GOOGLE_MAPS_API_KEY'), 'Google');
  assert.equal(service('GH_TOKEN'), 'GitHub');
  assert.equal(service('CLERK_SECRET_KEY'), 'Clerk');
  assert.equal(service('RESEND_API_KEY'), 'Resend');
  assert.equal(service('TWILIO_AUTH_TOKEN'), 'Twilio');
  assert.equal(service('P24_CRC'), 'Przelewy24');
});

test('a name that is no service, or names one only further along, points to none', () => {
  for (const name of ['JWT_SECRET', 'DATABASE_URL', 'NEXTAUTH_SECRET', 'SESSION_TOKEN', 'MAX_RESEND_TRIES', 'API_KEY_STRIPE', 'STRIPE', 'NEXT_PUBLIC_API_URL']) {
    assert.equal(providerOfName(name), undefined, name);
  }
});

test('a key’s format names its service, and a format with no service names none', () => {
  assert.equal(providerOfPattern('stripe-key')?.name, 'Stripe');
  assert.equal(providerOfPattern('jwt'), undefined);
  assert.equal(providerOfPattern('high-entropy value'), undefined);
});
