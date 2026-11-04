// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { printsContentOnly } from '../../../src/core/access/command-line.ts';
import { posixReadingOfPowerShell as reading } from '../../../src/core/access/powershell-line.ts';
import { protectedPathsInCommand } from '../../../src/core/access/protected-access.ts';
import type { Policy } from '../../../src/core/policy/policy.ts';

const POLICY: Policy = {
  level: 'no-read',
  protected: [{ pattern: '**/spec.md' }, { pattern: '**/.env' }, { pattern: '**/.aws/credentials' }, { pattern: '**/lessons/01/exercise.py' }],
  allowed: [],
  origin: { kind: 'default' },
};
const PLACE = { workingDirectory: String.raw`C:\Users\someone\lessons`, home: String.raw`C:\Users\someone` };
const met = (line: string): readonly string[] => protectedPathsInCommand(reading(line), POLICY, PLACE).map(([path]) => path);

// `2026-10-12-powershell-on-windows.md` PW2: a cmdlet that prints a file is the POSIX program that prints it, whatever
// its case, its alias, its path parameter or its separators - read as bash, none of these printed a file.
test('PW2: a PowerShell read of a file is the POSIX read of it', () => {
  for (const [line, posix] of [
    ['Get-Content spec.md', 'cat -- spec.md'],
    ['GET-CONTENT -Path .\\spec.md -Raw', 'cat -- ./spec.md'],
    ['gc -LiteralPath "C:\\Users\\someone\\lessons\\spec.md" -TotalCount 5', 'cat -- C:/Users/someone/lessons/spec.md'],
    ['type .env', 'cat -- .env'],
    ['cat -Path:.env', 'cat -- .env'],
    ['Get-Content -lit .env', 'cat -- .env'],
    ['Get-Content .\\lessons\\01\\exercise.py', 'cat -- ./lessons/01/exercise.py'],
    ['Get-Content a.md,b.md', 'cat -- a.md b.md'],
    ['Import-Csv customers.csv', 'cat -- customers.csv'],
    ['Format-Hex .env', 'xxd -- .env'],
  ] as const) {
    assert.equal(reading(line), posix, line);
    assert.equal(printsContentOnly([reading(line)]), true, line);
  }
});

// PW2: a search keeps its pattern as a pattern, so a name searched for is no file read.
test('PW2: Select-String is grep, its pattern a pattern and its paths files', () => {
  assert.equal(reading('Select-String -Path .env -Pattern KEY'), 'grep -e KEY -- .env');
  assert.equal(reading('sls KEY .env'), 'grep -e KEY -- .env');
  assert.equal(reading('Get-Content .env | Select-String KEY'), 'cat -- .env | grep -e KEY');
  assert.deepEqual(met('Select-String -Pattern "spec.md" -Path README.md'), [], 'a name looked for is not a file read');
  assert.deepEqual(met('Select-String -Path .env -Pattern KEY'), ['.env']);
});

// PW2: a listing lists, and `-Recurse` (or any prefix of it) is a recursive one.
test('PW2: Get-ChildItem is ls', () => {
  assert.equal(reading('Get-ChildItem -Recurse -Filter *.env'), 'ls -R');
  assert.equal(reading('gci -r C:\\Users\\someone\\lessons'), 'ls -R -- C:/Users/someone/lessons');
  assert.equal(reading('dir .'), 'ls -- .');
});

// PW4: the home folder as PowerShell names it is bash's `~`, where the bash reader places it.
test('PW4: $HOME and $env:USERPROFILE are the home folder', () => {
  assert.equal(reading('Get-Content $env:USERPROFILE\\.aws\\credentials'), 'cat -- ~/.aws/credentials');
  assert.equal(reading('gc $HOME/.aws/credentials'), 'cat -- ~/.aws/credentials');
  assert.deepEqual(met('Get-Content $env:USERPROFILE\\.aws\\credentials'), ['~/.aws/credentials']);
});

// The hook and the report read one line: what a PowerShell read reaches is met by the rules, and an everyday file is not.
test('PW1: what the reading names is what the rules meet', () => {
  assert.deepEqual(met('Get-Content spec.md'), ['spec.md']);
  assert.deepEqual(met('gc -LiteralPath "C:\\Users\\someone\\lessons\\spec.md"'), ['C:/Users/someone/lessons/spec.md']);
  assert.deepEqual(met('Get-Content .\\lessons\\01\\exercise.py'), ['lessons/01/exercise.py']);
  assert.deepEqual(met('if (Test-Path .env) { Get-Content .env }'), ['.env'], 'a block is read as the commands it runs');
  assert.deepEqual(met('Get-Content README.md'), []);
  assert.deepEqual(met('Get-Date; Write-Output "the plan" > notes.txt'), []);
});

// PW6, PWB4: `Set-Location lessons\01; Get-Content exercise.py` printed a blocked file unrefused - a move this did not
// know moved nowhere, and the file was looked for where the line started.
test('PW6: a move of where the line is is bash\'s cd, and what runs after it reads from there', () => {
  for (const [line, posix] of [
    [String.raw`Set-Location 01; Get-Content exercise.py`, 'cd 01 ; cat -- exercise.py'],
    [String.raw`sl -Path .\01; gc exercise.py`, 'cd ./01 ; cat -- exercise.py'],
    [String.raw`Push-Location -LiteralPath:01 -PassThru; type exercise.py`, 'cd 01 ; cat -- exercise.py'],
    [String.raw`chdir "C:\Users\someone\lessons\01"; Get-Content exercise.py`, 'cd C:/Users/someone/lessons/01 ; cat -- exercise.py'],
    [String.raw`Set-Location $HOME\lessons\01; Get-Content exercise.py`, 'cd ~/lessons/01 ; cat -- exercise.py'],
    [String.raw`Set-Location -StackName work 01`, 'cd 01'],
  ] as const) {
    assert.equal(reading(line), posix, line);
  }
  // With no folder, a place nobody here knows: PowerShell 5.1 stays and 7 goes home.
  assert.equal(reading('Set-Location'), 'cd -');
});

// PW6 where the line runs at a drive: the folder a move names is placed by this system's `resolve`, which reads `C:\…` as
// a drive on Windows alone - elsewhere it is a relative name - so this runs on Windows alone, as WP7's test does.
test('PW6: what runs after a move at a drive reads from the folder it moved to', { skip: process.platform !== 'win32' }, () => {
  assert.deepEqual(met(String.raw`Set-Location 01; Get-Content exercise.py`), ['exercise.py']);
  assert.deepEqual(met(String.raw`Push-Location -LiteralPath:01 -PassThru; type exercise.py`), ['exercise.py']);
  assert.deepEqual(met(String.raw`chdir "C:\Users\someone\lessons\01"; Get-Content exercise.py`), ['exercise.py']);
  assert.deepEqual(met(String.raw`Set-Location 02; Get-Content exercise.py`), [], 'another folder\'s file of the name is not the blocked one');
  // With no folder, a place nobody here knows, so the file is met by its name.
  assert.deepEqual(met('Set-Location; Get-Content exercise.py'), ['exercise.py']);
});

// PW7, PWB4: `Get-ChildItem -Recurse -File | Get-Content` printed the blocked files and nothing stopped it - the items go
// down the pipeline as objects, and read word by word the reader named no file.
test('PW7: a listing piped into a reader is the find whose files it opens', () => {
  for (const [line, posix] of [
    ['Get-ChildItem -Recurse -File | Get-Content', 'find . -type f | xargs cat'],
    ['Get-ChildItem -Recurse | Select-String KEY', 'find . -type f | xargs grep -e KEY'],
    ['ls -r | % { gc $_.FullName }', 'find . -type f | xargs cat'],
    ['gci -r | ForEach-Object -Process { Get-Content -Path $PSItem.FullName }', 'find . -type f | xargs cat'],
    [String.raw`Get-ChildItem docs\*.md | gc`, "find docs -maxdepth 1 -type f -iname '*.md' | xargs cat"],
    ['Get-ChildItem -Path lessons -Filter *.py -Recurse | Format-Hex', "find lessons -type f -iname '*.py' | xargs xxd"],
    ['gci notes -Depth 1 | gc', 'find notes -maxdepth 2 -type f | xargs cat'],
    [String.raw`Get-ChildItem $HOME\.ssh | Get-Content`, 'find ~/.ssh -maxdepth 1 -type f | xargs cat'],
    // Two names keep every file: `refuse` reads `find`'s `-o` as reaching all, so no block is lifted by them.
    ['gci -Include *.md,*.txt -Recurse | gc', 'find . -type f | xargs cat'],
  ] as const) {
    assert.equal(reading(line), posix, line);
  }
  // What opens no listed file is read as before.
  assert.equal(reading('Get-ChildItem | Select-Object Name'), 'ls | select-object Name');
  assert.equal(reading('Get-Content a.txt | Select-String KEY'), 'cat -- a.txt | grep -e KEY', 'lines of text, not files');
  assert.equal(reading('Get-ChildItem -Recurse | Get-Content -Path notes.txt'), 'ls -R | cat -- notes.txt');
  assert.equal(reading('ls -r | % { Write-Output $_.Name }'), 'ls -R | % ; write-output $_.Name');
});

// PW10, PWB6: `| Where-Object Length -gt 0 |` between the listing and its reader printed both blocked files - read word by
// word, the stage broke PW7's pipe and the reader named no file. A stage that only hands the items on leaves PW7's reading.
test('PW10: a stage that only hands the items on is no break between a listing and its reader', () => {
  for (const [line, posix] of [
    ['Get-ChildItem -Recurse -File | Where-Object Length -gt 0 | Get-Content', 'find . -type f | xargs cat'],
    ['gci -r | ? { $_.Length -gt 0 } | gc', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object -FilterScript { $_.Name -ne "a" } | Sort-Object Name | Select-Object -First 5 | Get-Content', 'find . -type f | xargs cat'],
    ['gci -r | sort { $_.Length } | gu | gc', 'find . -type f | xargs cat'],
    ['gci -r | select -ExpandProperty FullName | Get-Content', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object { ($_.Length -gt 0) -and ($_.Name -ne "x") } | gc', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object Length -gt 0 | % { gc $_.FullName }', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object Length -gt 0 | Select-String KEY', 'find . -type f | xargs grep -e KEY'],
    // One comparison written as parameters keeps its one name, as `-Filter` does.
    ['gci -r -File | Where-Object Extension -eq .md | Get-Content', "find . -type f -iname '*.md' | xargs cat"],
    ['gci -r | Where-Object -Property Name -Like -Value *.txt | gc', "find . -type f -iname '*.txt' | xargs cat"],
    ["gci -r | where Name -like 'notes*' | % { gc $_ }", "find . -type f -iname 'notes*' | xargs cat"],
    ['gci lessons -Filter *.py | Where-Object Name -like a* | gc', "find lessons -maxdepth 1 -type f -iname '*.py' | xargs cat"],
    // Any other comparison keeps every file.
    ['gci -r | Where-Object Name -notlike *.md | gc', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object Name -eq $wanted | gc', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object Name -eq *.md | gc', 'find . -type f | xargs cat'],
    ['gci -r | Where-Object Extension -eq md | gc', 'find . -type f | xargs cat'],
  ] as const) {
    assert.equal(reading(line), posix, line);
  }
  // What hands the reader no file, or ends with no reader, is read as before.
  assert.equal(reading('gci -r | Select-Object Name | gc'), 'ls -R | select-object Name | cat');
  assert.equal(reading('gci -r | Where-Object Length -gt 0 | Select-Object Name'), 'ls -R | where-object Length -gt 0 | select-object Name');
  assert.equal(reading('gci -r | Where-Object Length -gt 0'), 'ls -R | where-object Length -gt 0');
  assert.equal(reading('gci -r | Measure-Object | gc'), 'ls -R | measure-object | cat');
});

// PW3: PowerShell's own syntax said in bash's - quotes, its escape, comments, blocks, the call operator, redirections -
// and every word it does not know left as written.
test('PW3: what is not a file reader keeps its words', () => {
  assert.equal(reading('node "$env:TEMP\\agentwhy-diagnose.mjs" --file spec.md'), 'node $env:TEMP/agentwhy-diagnose.mjs --file spec.md');
  assert.equal(reading('Write-Output "$env:TEMP and more"'), 'write-output "$env:TEMP and more"', 'a variable is left to expand');
  assert.equal(reading("Write-Output 'a$b'"), "write-output 'a$b'", 'a single-quoted $ is no variable');
  assert.equal(reading("Write-Output 'it''s here' > notes.txt"), "write-output 'it'\\''s here' > notes.txt");
  assert.equal(reading('Get-Content .env 2>&1 | Out-Null'), 'cat -- .env 2>&1 | out-null');
  assert.equal(reading('Get-Content x.md *> $null'), 'cat -- x.md &> $null');
  assert.equal(reading("& 'C:\\Program Files\\tool.exe' --check"), "'C:/Program Files/tool.exe' --check");
  assert.equal(reading('Get-Content `\n  .env'), 'cat -- .env', 'a backtick at the end of a line goes on');
  assert.equal(reading('# what is here\nGet-ChildItem'), 'ls');
  assert.equal(reading('Write-Output $(Get-Content .env).Length'), 'write-output ; cat -- .env ; .Length');
  assert.equal(reading(''), '');
});

// `2026-10-12-powershell-on-windows.md` PW12, PWB8: a line that hands a shell its code as a string - `cmd /c "type
// secret.txt"`, `pwsh -Command "…"` - ran that code, and the code, one quoted word holding a space, named no file: a
// blocked one was let through. The code is read in the wrapper's place, as the PowerShell it reads as.
test('PW12: a shell handed code as a string runs that code, read in its place', () => {
  const BS = String.fromCharCode(92);
  assert.equal(reading('cmd.exe /c "type secret.txt"'), 'cat -- secret.txt');
  assert.equal(reading('cmd /k "type secret.txt"'), 'cat -- secret.txt');
  assert.equal(reading('cmd /C type secret.txt'), 'cat -- secret.txt', 'unquoted too, the flag in any case');
  assert.equal(reading(`cmd /c "type notes${BS}plan.md"`), 'cat -- notes/plan.md');
  assert.equal(reading(`C:${BS}Windows${BS}System32${BS}cmd.exe /c "type secret.txt"`), 'cat -- secret.txt', 'named by its path');
  assert.equal(reading('powershell -Command "Get-Content secret.txt"'), 'cat -- secret.txt');
  assert.equal(reading('pwsh -NoProfile -c "Get-Content secret.txt"'), 'cat -- secret.txt');
  assert.equal(reading('cmd /c "type readme.md" | Select-String x'), 'cat -- readme.md | grep -e x');
  assert.equal(reading('cmd /c "copy secret.txt CON"'), 'copy secret.txt CON', 'a word it does not know stays a word, naming the file');
  assert.equal(reading('cmd /c "cmd /c "'), 'cmd /c', 'a shell handed nothing runs nothing read here');
});
