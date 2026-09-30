import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pageShell } from '../../../../src/report/render/ui/page-shell.ts';
import { POPUP_SCRIPT } from '../../../../src/report/render/ui/popup.ts';
import { updateNotice, UPDATE_NOTICE_SCRIPT, UPDATE_NOTICE_STYLE } from '../../../../src/report/render/ui/update-notice.ts';

// `nothing-updates-by-itself` U5, U6: every word it can say, in each language, with both releases.
test('the notice says the release the project runs and the one ready, in every language, and its window says the same', () => {
  const html = updateNotice({ from: '0.2.0', to: '0.3.0', shared: false });

  for (const words of [
    'A new version of agentwhy is ready', 'Nowa wersja agentwhy jest gotowa', 'Eine neue Version von agentwhy ist bereit',
    'This project still uses 0.2.0.', 'Ten projekt nadal używa wersji 0.2.0.', 'Dieses Projekt nutzt noch 0.2.0.',
    'Update to 0.3.0', 'Zaktualizuj do 0.3.0', 'Auf 0.3.0 aktualisieren',
    'Not now', 'Nie teraz', 'Nicht jetzt',
    'Update agentwhy in this project?', 'Your AI’s next reply is checked by 0.3.0. Nothing else in your settings changes.',
  ]) {
    assert.ok(html.includes(words), words);
  }
  assert.match(html, /<button type="button" class="pill pill-light pill-md"[^>]* data-popup-open="upd-confirm"/, 'Update is the light pill, and opens the window (UD2)');
  assert.match(html, /<dialog[^>]*id="upd-confirm"/);
  assert.match(html, /<span class="upd-ver">0\.2\.0<\/span>.*<span class="upd-ver upd-ver-new">0\.3\.0<\/span>/);
  assert.doesNotMatch(html, /pill-primary/, 'the page already has its one coral button');
});

test('where the hooks run from the shared file, the notice and its window say it is for everyone on the project', () => {
  const html = updateNotice({ from: '0.2.0', to: '0.3.0', shared: true });
  assert.ok(html.includes('Everyone who works on this project still uses 0.2.0.'));
  assert.ok(html.includes('for everyone on this project once they have your change'));
  assert.ok(!html.includes('This project still uses 0.2.0.'));
});

// U10: with no script, as a file, or once the server has gone, the command a terminal runs, and no dead buttons.
test('without a script the notice shows the command a terminal runs, and hides what only a script can work', () => {
  const html = updateNotice({ from: '0.2.0', to: '0.3.0', shared: false });
  assert.ok(html.includes('<code data-upd-line>npx @agentwhy/cli@0.3.0 init --update</code>'));
  assert.match(UPDATE_NOTICE_STYLE, /html:not\(\.js\) \.upd-actions,html:not\(\.js\) \.upd-card>\.close,html:not\(\.js\) \[data-upd-copy\]\{display:none\}/);
  assert.match(UPDATE_NOTICE_STYLE, /html:not\(\.js\) \.upd-command\{display:block\}/);
  assert.match(UPDATE_NOTICE_SCRIPT, /if \(!served\) asCommand\(\);/);
  assert.match(UPDATE_NOTICE_SCRIPT, /data-live-stopped/, 'a server that goes while the page is open turns the buttons into the command');
});

test('the shell brings what the notice is made of only where a page passes one, and each piece once', () => {
  const page = { title: 'conv.title', policy: '', styles: [], scripts: [POPUP_SCRIPT], main: '<p>page</p>' };
  const plain = pageShell(page);
  const noticed = pageShell({ ...page, notice: updateNotice({ from: '0.2.0', to: '0.3.0', shared: false }) });

  assert.ok(!plain.includes('data-update-notice') && !plain.includes(UPDATE_NOTICE_STYLE));
  assert.ok(noticed.includes('data-update-notice') && noticed.includes(UPDATE_NOTICE_STYLE) && noticed.includes(UPDATE_NOTICE_SCRIPT));
  assert.equal(noticed.split(POPUP_SCRIPT).length - 1, 1, 'the popup script a page already has is not added twice');
  assert.ok(noticed.indexOf('data-update-notice') < noticed.indexOf('<div class="shell">'), 'drawn over the content, not inside it');
});
