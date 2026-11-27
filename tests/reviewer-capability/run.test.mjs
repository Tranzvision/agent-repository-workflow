import assert from 'node:assert/strict';
import {mkdir, readFile, readlink, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {PRODUCT_NAME} from '../../lib/arw-common/product-identity.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {runExitedProcess} from '../helpers/process.mjs';

const CHECKOUT = join(import.meta.dirname, '..', '..');
const CLI = join(CHECKOUT, 'scripts', 'reviewer-capability.mjs');
const SCENARIO = join(CHECKOUT, 'tests', 'fixtures', 'reviewer-capability', 'spec-readiness-reviewer', 'spec-readiness');
const RUN_MODULE = new URL('../../lib/reviewer-capability-run.mjs', import.meta.url).href;
const SETTINGS = {model: 'fake-model', modelProvider: 'openai', reasoningEffort: 'high'};

// Every case starts the fake machine entry as a real child process (the product code spawns it), so each takes over 100 ms.
/** @param {import('node:test').TestContext} t */
const fixture = async t => {
    const home = await createTemporaryDirectory(t, 'arw-capability-run-');
    const installed = join(home, '.agent-repository-workflow');
    await mkdir(installed);
    await writeFile(join(installed, 'manifest.json'), JSON.stringify({arwVersion: '0.5.4-pre', managedFiles: ['arw.mjs'], manifestVersion: 2, pathOwnership: [], product: PRODUCT_NAME}));
    await writeFile(join(installed, 'arw.mjs'), `
import {createInterface} from 'node:readline';
import {appendFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const log = process.env.HOME + '/requests.jsonl';
const sessionPath = process.env.HOME + '/native.jsonl';
const notice = {type: 'message', source: 'provider-program', messageId: 'pause-1', text: 'The Reviewer runtime paused this same task after 1 turns'};
let spawned;
let waits = 0;
let interrupted = false;
let listsAfterInterrupt = 0;
for await (const line of createInterface({input: process.stdin})) {
    const request = JSON.parse(line);
    appendFileSync(log, line + '\\n');
    const {id, operation, input} = request;
    if (operation === 'spawn_agent') {
        if (process.env.FAKE_MODE === 'reject') {
            console.log(JSON.stringify({id, ok: false, error: {code: 'test-rejected', message: 'refused'}}));
            continue;
        }
        spawned = input;
        const agentPath = join(input.cwd, 'agent.json');
        if (process.env.FAKE_MODE === 'existing-file') writeFileSync(agentPath, 'existing data');
        if (process.env.FAKE_MODE === 'existing-link') {
            const linkedPath = join(process.env.HOME, 'linked.json');
            writeFileSync(linkedPath, 'existing data');
            symlinkSync(linkedPath, agentPath, 'file');
        }
        writeFileSync(input.reportPath, process.env.FAKE_MODE === 'failure' ? 'Preamble\\n- malformed finding\\n' : 'No problems.\\n');
        const records = [{type: 'session_meta', payload: {id: 'thread-1'}}];
        if (process.env.FAKE_MODE === 'flags') records.push(
            {type: 'response_item', payload: {type: 'function_call', call_id: 'call-1', name: 'exec_command', arguments: '{}'}},
            {type: 'response_item', payload: {type: 'function_call_output', call_id: 'call-1', output: 'private answer sentinel'}},
            {type: 'event_msg', payload: {item: {type: 'CommandExecution', command: ['cat', process.env.FAKE_KEY], cwd: input.cwd}}});
        records.push({type: 'event_msg', payload: {type: 'task_complete'}});
        writeFileSync(sessionPath, records.map(row => JSON.stringify(row)).join('\\n') + '\\n');
    }
    if (operation === 'wait_agent') waits++;
    if (operation === 'interrupt_agent') {
        interrupted = true;
        console.log(JSON.stringify({id, ok: false, error: {code: 'turn-mismatch', message: 'The observed active Reviewer turn has changed.'}}));
        continue;
    }
    if (interrupted && operation === 'list_agents') listsAfterInterrupt++;
    const stuck = process.env.FAKE_MODE === 'stuck';
    const done = stuck ? listsAfterInterrupt >= 2 : waits >= 3;
    const completion = done && process.env.FAKE_MODE !== 'no-completion' ? {status: process.env.FAKE_MODE === 'failure' ? 'incomplete' : 'ready', reportPath: spawned.reportPath} : null;
    const result = operation === 'spawn_agent' ? {runId: 'run-1'} : {
        runId: 'run-1', threadId: 'thread-1', turnId: 'turn-1', state: done ? 'exited' : 'running', cursor: waits,
        completion, notifications: waits > 0 ? [notice] : [], snapshot: {members: [{sessionPath}]},
        ...(process.env.FAKE_MODE === 'no-completion' ? {} : {measurement: {startedAt: 1000, finishedAt: 4000,
            workDuration: {durationMs: 2000, estimated: false}, wallClockMs: 3000, usage: {inputTokens: 100, cachedInputTokens: 40, outputTokens: 8}}})};
    console.log(JSON.stringify({id, ok: true, result}));
}
`);
    const target = join(home, 'instance');
    const env = (/** @type {string} */ mode) => ({HOME: home, USERPROFILE: home, TMPDIR: home, FAKE_MODE: mode, FAKE_KEY: join(SCENARIO, 'expected.json')});
    // The real CLI process: one case proves the entry point, exit code and stdout contract.
    const run = async (mode = '', args = ['run', SCENARIO, target, '--settings', JSON.stringify(SETTINGS)], extraEnv = {}) => {
        const result = await runExitedProcess(process.execPath, [CLI, ...args], {cwd: home, env: {...process.env, ...env(mode), ...extraEnv}});
        return {code: result.exitCode, stdout: result.stdout, stderr: result.stderr};
    };
    // The same run through the entry's function in this process, with the CLI's exit-code and output mapping. Test cases in a file run one
    // at a time, so the process-wide environment (HOME, the fake machine entry's mode) is set and restored around each call.
    const runHere = async (mode = '', timeScale = '') => {
        const saved = {...process.env};
        Object.assign(process.env, env(mode));
        if (timeScale !== '') process.env.REVIEWER_CAPABILITY_TIME_SCALE = timeScale;
        let stderr = '';
        const write = t.mock.method(process.stderr, 'write', (/** @type {string} */ text) => { stderr += text; return true; });
        try {
            const {runInstance} = await import(timeScale === '' ? RUN_MODULE : `${RUN_MODULE}?scale=${timeScale}`);
            const {diagnostics = [], ...payload} = await runInstance({scenario: SCENARIO, target, settings: SETTINGS});
            return {code: payload.status === 'succeeded' ? 0 : 1, stdout: JSON.stringify(payload), stderr: stderr + diagnostics.join('\n')};
        } finally {
            write.mock.restore();
            for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
            Object.assign(process.env, saved);
        }
    };
    const requests = async () => (await readFile(join(home, 'requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    return {home, installed, target, run, runHere, requests};
};

test('run uses the installed machine entry, resumes a repeated pause once, scores, and records checkout provenance outside its cwd', async t => {
    const {target, run, requests} = await fixture(t);
    const output = await run();
    assert.equal(output.code, 0, JSON.stringify(output));
    const {status, record} = JSON.parse(output.stdout);
    assert.equal(status, 'succeeded');
    assert.equal(record.validity.valid, true);
    assert.equal(record.id, 'instance');
    assert.equal(record.scenario, 'spec-readiness-reviewer/spec-readiness');
    assert.deepEqual(record.settings, SETTINGS);
    assert.deepEqual(record.runtime, {arwVersion: '0.5.4-pre', matchesCheckout: false});
    assert.match(output.stderr, /differ|match/iu);
    assert.equal(record.arw.commit, (await runExitedProcess('git', ['rev-parse', 'HEAD'], {cwd: CHECKOUT})).stdout.trim());
    assert.equal(record.arw.fixtureTree, (await runExitedProcess('git', ['rev-parse', 'HEAD:tests/fixtures/reviewer-capability'], {cwd: CHECKOUT})).stdout.trim());
    assert.equal(record.arw.treeDirty, (await runExitedProcess('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: CHECKOUT})).stdout.trim() !== '');
    assert.deepEqual(record.time, {durationSeconds: 2, durationEstimated: false, wallClockSeconds: 3, timeLimitSeconds: 3600});
    assert.deepEqual(record.tokens, {uncachedInput: 60, cachedInput: 40, output: 8});
    assert.equal(record.startedAt, '1970-01-01T00:00:01.000Z');
    assert.equal(record.completedAt, '1970-01-01T00:00:04.000Z');
    assert.equal(record.repair, null);
    const log = await requests();
    assert.deepEqual(log.filter(row => row.operation === 'send_message').map(row => row.input), [{runId: 'run-1', message: '继续'}]);
    assert.deepEqual(log[0].input.settings, SETTINGS);
    assert.deepEqual(log.filter(row => row.operation === 'wait_agent').map(row => row.input.cursor), [0, 1, 2]);
    assert.ok(log.filter(row => row.operation === 'wait_agent').every(row => row.input.timeout_ms >= 10000 && row.input.timeout_ms <= 3600000));
    assert.ok(!log.some(row => row.operation === 'unload_agent'));
    for (const name of ['agent.json', 'score.json', 'candidates.json', 'run.json']) await readFile(join(target, name));
    assert.equal(JSON.parse(await readFile(join(target, 'score.json'), 'utf8')).scores.pauseCount, 1);
    assert.deepEqual(JSON.parse(await readFile(join(target, 'run.json'), 'utf8')), record);
});

// Runs a scaled-down 3600 s limit (about 180 ms), so this case exceeds 100 ms.
test('run waits for the runtime to stop an idle Reviewer that the timeout interrupt cannot reach', async t => {
    const {target, runHere, requests} = await fixture(t);
    const output = await runHere('stuck', '0.00005');
    assert.equal(output.code, 0, JSON.stringify(output));
    const {record} = JSON.parse(output.stdout);
    assert.deepEqual(record.validity, {valid: false, status: 'void', notes: 'timeout: turn-mismatch'});
    const log = await requests();
    const interrupt = log.findIndex(row => row.operation === 'interrupt_agent');
    assert.ok(interrupt > 0);
    assert.ok(log.slice(interrupt + 1).filter(row => row.operation === 'list_agents').length >= 3);
    assert.ok(!log.some(row => row.operation === 'unload_agent'));
    await readFile(join(target, 'agent.json'));
});

test('run voids an exited environment without completion and leaves unknown measurements null', async t => {
    const {target, runHere: run} = await fixture(t);
    const output = await run('no-completion');
    assert.equal(output.code, 0, JSON.stringify(output));
    const {record} = JSON.parse(output.stdout);
    assert.deepEqual(record.validity, {valid: false, status: 'void', notes: 'no-completion'});
    assert.equal(record.startedAt, null);
    assert.equal(record.completedAt, null);
    assert.deepEqual(record.time, {durationSeconds: null, durationEstimated: null, wallClockSeconds: null, timeLimitSeconds: 3600});
    assert.deepEqual(record.tokens, {uncachedInput: null, cachedInput: null, output: null});
    await assert.rejects(readFile(join(target, 'score.json')), {code: 'ENOENT'});
});

test('run voids forbidden native-record reads without publishing paths or answer snippets', async t => {
    const {target, home, runHere: run} = await fixture(t);
    const output = await run('flags');
    assert.equal(output.code, 0, JSON.stringify(output));
    const {record} = JSON.parse(output.stdout);
    assert.equal(record.validity.valid, false);
    assert.match(record.validity.notes, /^inspect-flags: \d+ \(path\)$/u);
    assert.ok(!JSON.stringify(record).includes(home));
    assert.ok(!JSON.stringify(record).includes(SCENARIO));
    assert.ok(!JSON.stringify(record).includes('private answer sentinel'));
    await assert.rejects(readFile(join(target, 'score.json')), {code: 'ENOENT'});
});

test('run falls back to the original malformed readiness report for model-failure scoring', async t => {
    const {target, runHere: run, requests} = await fixture(t);
    const output = await run('failure');
    assert.equal(output.code, 0, JSON.stringify(output));
    const {record} = JSON.parse(output.stdout);
    const spawned = (await requests())[0].input;
    assert.equal(record.validity.valid, true);
    assert.equal(record.report, spawned.reportPath);
    assert.equal(record.repair, null);
    const score = JSON.parse(await readFile(join(target, 'score.json'), 'utf8'));
    assert.ok(score.scores.modelFailure);
    assert.equal(score.scores.final, 0);
    const repaired = JSON.parse(await readFile(join(target, 'report.repaired.txt.changes.json'), 'utf8'));
    assert.equal(repaired.changes['markdown-preamble'], 1);
});

test('run reports a rejected spawn with its original error and writes no run record', async t => {
    const {target, runHere: run, requests} = await fixture(t);
    const output = await run('reject');
    assert.equal(output.code, 1);
    assert.deepEqual(JSON.parse(output.stdout), {status: 'failed', stage: 'agent-control'});
    assert.match(output.stderr, /runId=unknown: test-rejected: refused/u);
    assert.equal((await requests()).length, 1);
    await assert.rejects(readFile(join(target, 'run.json')), {code: 'ENOENT'});
});

// Each collision case uses the real scenario setup and launches the fake machine entry, which together exceed 100 ms.
for (const [kind, mode] of [['file', 'existing-file'], ['symlink', 'existing-link']]) {
    test(`run refuses an existing ${kind} at a result path and preserves existing data`, async t => {
        const {home, target, runHere} = await fixture(t);
        const output = await runHere(mode);
        assert.equal(output.code, 1, JSON.stringify(output));
        assert.deepEqual(JSON.parse(output.stdout), {status: 'failed', stage: 'instance-write'}, output.stderr);
        const resultPath = join(target, 'agent.json');
        if (kind === 'symlink') assert.equal(await readlink(resultPath), join(home, 'linked.json'));
        assert.equal(await readFile(resultPath, 'utf8'), 'existing data');
        await assert.rejects(readFile(join(target, 'run.json')), {code: 'ENOENT'});
    });
}

test('run rejects existing targets and absent installations before spawning and rejects non-object settings as usage errors', async t => {
    const {home, installed, target, run, runHere} = await fixture(t);
    await mkdir(target);
    let output = await runHere();
    assert.equal(output.code, 1);
    assert.equal(JSON.parse(output.stdout).status, 'blocked');
    await assert.rejects(readFile(join(home, 'requests.jsonl')), {code: 'ENOENT'});
    await rm(target, {recursive: true});
    await rm(installed, {recursive: true});
    output = await runHere();
    assert.equal(output.code, 1);
    assert.equal(JSON.parse(output.stdout).status, 'blocked');
    await assert.rejects(readFile(target), {code: 'ENOENT'});
    // Usage errors are the entry script's own check, so these stay real CLI processes (run side by side).
    const usage = await Promise.all(['[]', 'null', '1', 'invalid'].map(settings => run('', ['run', SCENARIO, target, '--settings', settings])));
    assert.deepEqual(usage.map(result => result.code), [2, 2, 2, 2]);
});
