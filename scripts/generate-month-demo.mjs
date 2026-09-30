// The This month page from entirely fictional data: the conversations of the design file "agentwhy Sessions v2",
// with a few earlier months behind them, so the page can be looked at month by month. Writes demo.month.html, which
// is gitignored like every generated page.
import { writeFile } from 'node:fs/promises';
import { MonthRenderer } from '../src/report/start/month/month-renderer.ts';

const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const TALLIES = {
  read: { ...ZERO, contentsSeen: 1, filesReached: 1, namedByCall: 1 },
  name: { ...ZERO, filesReached: 1, onlyThroughResult: 1 },
  blocked: { ...ZERO, refusedAttempts: 1 },
  none: ZERO,
};
const KINDS = { read: 'seen', name: 'result', blocked: 'named', none: 'seen' };

// [date, time (UTC, the demo's zone), what was asked, what the AI did, files, id, helpers]
const rows = [
  ['2026-09-23', '08:59', 'Find out why the AI chat stopped answering', 'read', ['.env.production', '.env', '.env.development', '.env.test', 'ticket-widget/.env'], '4c25b1ff', 2],
  ['2026-09-23', '08:41', 'Fix the sign-up button on the home page', 'none', [], '82f9a942', 0],
  ['2026-09-22', '15:37', 'Connect the payments page to Stripe', 'read', ['.env.local'], 'a913f567', 1],
  ['2026-09-22', '12:25', 'Add a missing setting for emails', 'name', ['.env.sample'], '874d476c', 1],
  ['2026-09-22', '12:23', 'Check that the AI can be stopped', 'blocked', [], '435361cc', 3],
  ['2026-09-21', '17:02', 'Export the customer list for the newsletter', 'read', ['customers.csv'], '9e184f74', 0],
  ['2026-09-21', '11:14', 'Make the pricing page look better on phones', 'none', [], '1c88f2d0', 0],
  ['2026-09-19', '10:30', 'Write the text for the About page', 'none', [], 'e912ab7f', 0],
  ['2026-09-17', '14:48', 'Find a setting that was missing', 'name', ['.env.sample'], 'b1f09e22', 1],
  ['2026-09-16', '09:12', 'Clean up old files in the project', 'none', [], 'f05c6d93', 2],
  ['2026-09-15', '16:20', 'Add a dark mode to the dashboard', 'none', [], '7d21aa0e', 0],
  ['2026-09-14', '10:05', 'Speed up the product page', 'name', ['.env.sample'], '5b0c9e13', 1],
  ['2026-09-10', '13:44', 'Send a welcome email to new users', 'read', ['.env.production'], '2f8e61c4', 1],
  ['2026-09-09', '09:30', 'Fix typos on the pricing page', 'none', [], '0c9a4d77', 0],
  ['2026-09-08', '11:12', 'Set up the contact form', 'none', [], '9a3f02bb', 0],
  ['2026-09-07', '15:50', 'Add a logo to the header', 'none', [], '4e71c0d8', 0],
  ['2026-09-03', '10:02', 'Start a new project for the shop', 'none', [], '1b6d88f0', 0],
  ['2026-08-27', '16:40', 'Move the images to a faster host', 'name', ['.env.sample'], '6a0e3c51', 1],
  ['2026-08-19', '09:05', 'Add a newsletter sign-up to the footer', 'none', [], 'c7d12e90', 0],
  ['2026-08-11', '14:22', 'Import last year’s orders', 'read', ['orders-2025.csv'], 'd81f4a07', 2],
  ['2026-08-04', '11:48', 'Make the menu work on phones', 'none', [], 'e3b95c26', 0],
  ['2026-06-18', '10:15', 'Set up the first version of the shop', 'none', [], 'f4a7d039', 1],
];

const entries = rows.map(([date, time, title, did, files, id, helpers]) => ({
  name: id + '-0000-4000-8000-demo00000000',
  title,
  modifiedAt: Date.parse(date + 'T' + time + ':00Z'),
  delegations: helpers,
  report: {
    kind: 'generated',
    file: id + '.html',
    tally: { ...TALLIES[did], filesReached: did === 'read' ? files.length : TALLIES[did].filesReached },
    incomplete: false,
    files: files.map((path) => ({ path, kind: KINDS[did] })),
    // How many files its report's Files tab lists (F14's "See all {n} files"), as the index demo counts them.
    reached: files.length + (id.charCodeAt(0) % 9) + 2,
  },
}));

const index = {
  now: NOW,
  timeZone: 'UTC',
  since: NOW - 120 * 86_400_000,
  asked: '120d',
  project: '/Users/someone/projects/test-project-for-agentwhy',
  shared: false,
  widen: 'agentwhy start --since 240d',
  entries,
  check: { refusedAttempts: 1, rows: ['.env.production', '.env', '.env.development', '.env.local', 'customers.csv'].map((path) => ({ label: 'rotate', path, sessions: [] })) },
  settings: { level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' } },
};

const page = new MonthRenderer({ conversations: 'demo.index.html', toFix: 'to-fix.html', month: 'demo.month.html', settings: 'demo.settings.html' }).render(index);
await writeFile('demo.month.html', page);
console.log('demo.month.html written');
