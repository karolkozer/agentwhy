import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { JsonDoctorRenderer } from '../../../src/doctor/render/json-doctor-renderer.ts';
import { cleanDoctorReport } from '../../helpers/doctor-report.ts';

test('renders the whole report as JSON, ending with one newline', () => {
  const report = cleanDoctorReport();

  const output = new JsonDoctorRenderer().render(report);

  assert.deepEqual(JSON.parse(output), report);
  assert.ok(output.endsWith('}\n') && !output.endsWith('\n\n'));
});
