import assert from 'node:assert/strict';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {runExitedProcess} from '../helpers/process.mjs';
import {exportInstances} from '../../lib/reviewer-capability/export.mjs';

const scores = {final: 0.4, rawScore: 0.8, scoreBeforePenalty: 0.6, f: 0.2, overallDeduction: 0.2, rRepairable: 2, pauseCount: 1};
const record = {id: 'one', scenario: 'role/scenario', arw: {commit: 'sha', treeDirty: true, fixtureTree: 'tree'},
    runtime: {arwVersion: '0.5.4-pre', matchesCheckout: false}, settings: {model: 'test'}, startedAt: null, completedAt: null,
    time: {durationSeconds: null, durationEstimated: null, wallClockSeconds: null, timeLimitSeconds: 3600},
    tokens: {uncachedInput: null, cachedInput: null, output: null}, validity: {valid: true, status: 'valid', notes: ''}, report: '/local/report', repair: '/local/repair'};

/** @param {import('node:test').TestContext} t */
const fixture = async t => {
    const directory = await createTemporaryDirectory(t, 'arw-capability-export-');
    await writeFile(join(directory, 'run.json'), JSON.stringify(record));
    await writeFile(join(directory, 'score.json'), JSON.stringify({status: 'succeeded', candidates: [], provisional: null, scores}));
    return directory;
};

test('export maps final scores and model failures, hides local paths, and preserves void instances and order', async t => {
    const valid = await fixture(t);
    const voided = await fixture(t);
    await writeFile(join(voided, 'run.json'), JSON.stringify({...record, id: 'two', validity: {valid: false, status: 'void', notes: 'no-completion'}}));
    await rm(join(voided, 'score.json'));
    const before = await readFile(join(valid, 'run.json'), 'utf8');
    const result = /** @type {any} */ (await exportInstances({instances: [valid, voided]}));
    const {report: _report, repair: _repair, ...publicRecord} = record;
    assert.deepEqual(result, {status: 'succeeded', schemaVersion: 1, instances: [
        {...publicRecord, pauses: {known: true, count: 1}, scoring: {status: 'final', score: 0.4, rawScore: 0.8, scoreBeforePenalty: 0.6,
            formatPenalty: 0.2, overallDeduction: 0.2, repairs: 2}},
        {...publicRecord, id: 'two', validity: {valid: false, status: 'void', notes: 'no-completion'}, pauses: {known: false, count: null}, scoring: null},
    ]});
    await writeFile(join(valid, 'score.json'), JSON.stringify({status: 'succeeded', candidates: [], provisional: null, scores: {...scores, final: 0, pauseCount: 0, modelFailure: 'no content'}}));
    assert.equal((/** @type {any} */ (await exportInstances({instances: [valid]}))).instances[0].scoring.status, 'modelFailure');
    assert.equal(await readFile(join(valid, 'run.json'), 'utf8'), before);
});

test('export blocks the entire batch for missing, malformed or unfinished input and duplicate ids', async t => {
    const valid = await fixture(t);
    const invalid = await fixture(t);
    const check = async (/** @type {string[]} */ instances) => {
        const result = await exportInstances({instances});
        assert.equal(result.status, 'blocked');
        assert.ok(!('instances' in result));
    };
    await check([]);
    await check([valid, invalid]);
    for (const content of ['{', JSON.stringify({status: 'blocked', candidates: [], provisional: null}),
        JSON.stringify({status: 'succeeded', candidates: [{}], provisional: null}),
        JSON.stringify({status: 'succeeded', candidates: [], provisional: 'lower'})]) {
        await writeFile(join(invalid, 'run.json'), JSON.stringify({...record, id: 'other'}));
        await writeFile(join(invalid, 'score.json'), content);
        await check([valid, invalid]);
    }
    await rm(join(invalid, 'score.json'));
    await check([valid, invalid]);
    await writeFile(join(invalid, 'run.json'), '{');
    await check([valid, invalid]);
    await rm(join(invalid, 'run.json'));
    await check([valid, invalid]);
});

test('the machine entry delivers a JSON result larger than a pipe buffer before it exits', async t => {
    const directory = await fixture(t);
    await writeFile(join(directory, 'run.json'), JSON.stringify({...record, validity: {valid: false, status: 'void', notes: 'x'.repeat(300000)}}));
    const entry = join(import.meta.dirname, '..', '..', 'scripts', 'reviewer-capability.mjs');
    const result = await runExitedProcess(process.execPath, [entry, 'export', directory]);
    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).instances[0].validity.notes.length, 300000);
});
