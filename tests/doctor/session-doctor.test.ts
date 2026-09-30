import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DiscoveredSession, SessionDiscovery } from '../../src/adapter/claude-code/discovery/discovered-session.ts';
import type { DoctorReport } from '../../src/adapter/claude-code/probe/doctor-report.ts';
import type { SessionProbe } from '../../src/adapter/claude-code/probe/session-probe.ts';
import type { DoctorRenderers } from '../../src/doctor/render/doctor-renderers.ts';
import { SessionDoctor } from '../../src/doctor/session-doctor.ts';
import type { Renderer } from '../../src/shared/renderer.ts';
import { cleanDoctorReport } from '../helpers/doctor-report.ts';

function discoveredSession(mainTranscriptPresent: boolean): DiscoveredSession {
  const path = '/sessions/s.jsonl';
  return {
    contractVersion: 1,
    sessionId: 's',
    mainTranscript: mainTranscriptPresent ? { present: true, path } : { present: false, path, reason: 'not-found' },
    subagentsDir: { present: false, path: '/sessions/s/subagents', reason: 'not-found' },
    subagents: [],
    toolResultsDir: { present: false, path: '/sessions/s/tool-results', reason: 'not-found' },
    toolResultFiles: [],
    unrecognised: [],
  };
}

// The doctor only orchestrates, so every collaborator is a fake that checks what it is handed.
function doctorFor(session: DiscoveredSession): SessionDoctor {
  const report = cleanDoctorReport();
  const discovery: SessionDiscovery = { discover: async () => session };
  const probe: SessionProbe = {
    probe: async (probed) => {
      assert.equal(probed, session);
      return report;
    },
  };
  const rendererFor = (format: string): Renderer<DoctorReport> => ({
    render: (rendered) => {
      assert.equal(rendered, report);
      return `report rendered as ${format}`;
    },
  });
  const renderers: DoctorRenderers = { text: rendererFor('text'), json: rendererFor('json') };
  return new SessionDoctor({ discovery, probe, renderers });
}

test('renders the probed report with the renderer registered for the requested format', async () => {
  const result = await doctorFor(discoveredSession(true)).run({ input: 'any', format: 'json' });

  assert.deepEqual(result, { outcome: 'complete', output: 'report rendered as json' });
});

test('still renders the report when the main transcript is missing, and says so in the outcome', async () => {
  const result = await doctorFor(discoveredSession(false)).run({ input: 'any', format: 'text' });

  assert.deepEqual(result, { outcome: 'main-transcript-missing', output: 'report rendered as text' });
});
