// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { tellingLine } from './shell-command-trial.js';
const READ = 64 * 1024;
const HELLO = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agentwhy', version: '1' } } });
/**
 * `2026-11-25-the-card-in-codex.md` CCX2: the program started as Codex starts a server - no shell, its words as they are - asked
 * `initialize`, and stopped once it answered. Its first line must be that answer: anything else on its output, such as a shell's greeting,
 * is what Codex would fail on. The environment is this process's, not Codex's.
 */
export class SpawnServerTrial {
    #environment;
    constructor(environment) {
        this.#environment = environment;
    }
    run({ run, folder, timeoutMs }) {
        return new Promise((resolve) => {
            let settled = false;
            let timer;
            const child = spawn(run[0] ?? '', run.slice(1), { cwd: folder, env: { ...this.#environment }, stdio: ['pipe', 'pipe', 'pipe'] });
            const done = (outcome) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                child.stdin.end();
                child.kill();
                // A process it started may still hold its output: nothing of it is waited for.
                child.stdout.destroy();
                child.stderr.destroy();
                child.unref();
                resolve(outcome);
            };
            let out = '';
            let wrong = '';
            child.stdout.on('data', (chunk) => {
                if (settled)
                    return;
                out += chunk.toString('utf8');
                const end = out.indexOf('\n');
                if (end >= 0)
                    done(answerIn(out.slice(0, end)));
                else if (out.length > READ)
                    done({ kind: 'other' });
            });
            child.stderr.on('data', (chunk) => {
                if (wrong.length < READ)
                    wrong += chunk.toString('utf8');
            });
            timer = setTimeout(() => done({ kind: 'timed-out' }), timeoutMs);
            child.on('error', (error) => done({ kind: 'not-started', reason: error.message }));
            child.on('close', (code) => done({ kind: 'not-started', reason: tellingLine(wrong) || `it ended with ${code ?? 'no code'}` }));
            child.stdin.on('error', () => { });
            child.stdin.write(`${HELLO}\n`);
        });
    }
}
function answerIn(line) {
    try {
        const name = JSON.parse(line).result?.serverInfo?.name;
        return typeof name === 'string' ? { kind: 'answered', name } : { kind: 'other' };
    }
    catch {
        return { kind: 'other' };
    }
}
