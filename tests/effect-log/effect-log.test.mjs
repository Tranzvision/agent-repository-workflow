import assert from 'node:assert/strict';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {forgetConfiguration, record, recorderFor} from '../../lib/effect-log/effect-log.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {commitAll, runGit} from '../helpers/git.mjs';
import {createRepository} from '../helpers/repository-fixture.mjs';

const CONFIG = {agents: {}, configVersion: 3, editor: {args: ['{file}'], command: 'code'}, jira: {listLimit: 50}, reviewEditor: {args: ['--wait', '{file}'], command: 'code'}};

/** @param {import('node:test').TestContext} t @param {unknown} [effectLog] */
async function setup(t, effectLog) {
    const programDirectory = await createTemporaryDirectory(t, 'arw-effect-program-');
    const logDirectory = join(await createTemporaryDirectory(t, 'arw-effect-log-'), 'logs');
    if (effectLog !== null) {
        await writeFile(join(programDirectory, 'config.json'), JSON.stringify({...CONFIG, effectLog: effectLog ?? {directory: logDirectory}}), 'utf8');
    }
    /** @type {string[]} */
    const warnings = [];
    return {programDirectory, logDirectory, warnings, warn: (/** @type {string} */ message) => warnings.push(message)};
}

/** @param {string} directory */
const readLines = async directory => {
    const names = await readdir(directory);
    assert.equal(names.length, 1);
    assert.match(names[0], /^effects-\d{4}-\d{2}\.jsonl$/u);
    return (await readFile(join(directory, names[0]), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
};

test('record appends one versioned line per call to the UTC month file', async t => {
    const {programDirectory, logDirectory, warn, warnings} = await setup(t);
    const before = Math.floor(Date.now() / 1000);
    await record('install', {result: 'success', seconds: 3}, {programDirectory, warn});
    await record('gate-round', {gate: 'commit-audit', issues: ['issue:0001:01'], key: 'k'}, {cwd: await createTemporaryDirectory(t, 'plain-dir-'), programDirectory, warn});
    const [first, second] = await readLines(logDirectory);
    assert.deepEqual({...first, ts: undefined}, {v: 1, ts: undefined, kind: 'install', result: 'success', seconds: 3});
    assert.ok(first.ts >= before && Number.isInteger(first.ts));
    assert.match(second.repository, /^plain-dir-/u);
    assert.equal(second.key, 'k');
    assert.deepEqual(warnings, []);
});

test('a missing config and an absent effectLog write nothing and stay silent', async t => {
    const missing = await setup(t, null);
    await record('install', {}, {programDirectory: missing.programDirectory, warn: missing.warn});
    const absent = await setup(t, undefined);
    await writeFile(join(absent.programDirectory, 'config.json'), JSON.stringify(CONFIG), 'utf8');
    await record('install', {}, {programDirectory: absent.programDirectory, warn: absent.warn});
    assert.deepEqual([...missing.warnings, ...absent.warnings], []);
    await assert.rejects(readdir(missing.logDirectory), {code: 'ENOENT'});
    await assert.rejects(readdir(absent.logDirectory), {code: 'ENOENT'});
});

test('an invalid effectLog or an unwritable directory gives exactly one warning and never rejects', async t => {
    const invalid = await setup(t, {directory: 'relative'});
    await record('install', {}, {programDirectory: invalid.programDirectory, warn: invalid.warn});
    await record('install', {}, {programDirectory: invalid.programDirectory, warn: invalid.warn});
    assert.deepEqual(invalid.warnings, ['warning: effect log not written: invalid-config']);

    const blocked = await setup(t);
    await mkdir(join(blocked.logDirectory, '..'), {recursive: true});
    await writeFile(blocked.logDirectory, 'a regular file', 'utf8');
    await record('install', {}, {programDirectory: blocked.programDirectory, warn: blocked.warn});
    await record('install', {}, {programDirectory: blocked.programDirectory, warn: blocked.warn});
    assert.deepEqual(blocked.warnings, ['warning: effect log not written: EEXIST']);
});

test('repository is the directory name of the main worktree, a submodule, or the cwd outside Git', async t => {
    const {programDirectory, logDirectory, warn} = await setup(t);
    const main = await createRepository(t, {initialCommit: true, prefix: 'main-repo-'});
    await mkdir(join(main, 'sub', 'deep'), {recursive: true});
    const linked = join(await createTemporaryDirectory(t, 'linked-parent-'), 'feature-tree');
    await runGit(main, ['worktree', 'add', '--quiet', '-b', 'feature', linked]);
    const library = await createRepository(t, {initialCommit: true, prefix: 'library-'});
    await runGit(main, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '--quiet', library, 'vendor']);
    await commitAll(main, 'add submodule');
    const outside = await createTemporaryDirectory(t, 'outside-');
    for (const cwd of [join(main, 'sub', 'deep'), linked, join(main, 'vendor'), outside, join(outside, 'missing')]) {
        await record('gate-round', {}, {cwd, programDirectory, warn});
    }
    const names = (await readLines(logDirectory)).map(line => line.repository);
    assert.match(names[0], /^main-repo-/u);
    assert.equal(names[1], names[0]);
    assert.equal(names[2], 'vendor');
    assert.match(names[3], /^outside-/u);
    assert.equal(names[4], 'missing');
});

test('a missing installation directory is silent, an unreadable config in an existing one warns, and a lazy fields function runs only when enabled', async t => {
    const gone = await setup(t, null);
    await record('install', async () => assert.fail('fields must not run while disabled'), {programDirectory: join(gone.programDirectory, 'absent'), warn: gone.warn});
    assert.deepEqual(gone.warnings, []);

    const unreadable = await setup(t, null);
    await writeFile(join(unreadable.programDirectory, 'config.json'), '{}', {mode: 0o000});
    await record('install', {}, {programDirectory: unreadable.programDirectory, warn: unreadable.warn});
    assert.deepEqual(unreadable.warnings, ['warning: effect log not written: invalid-config']);
});

test('a second failing record in one process adds no warning and the configuration is read only once', async t => {
    const {programDirectory, logDirectory, warn, warnings} = await setup(t);
    await writeFile(logDirectory, 'a regular file', 'utf8');
    await record('install', {}, {programDirectory, warn});
    await record('install', {}, {programDirectory, warn});
    assert.equal(warnings.length, 1);
    const {rm} = await import('node:fs/promises');
    await rm(logDirectory);
    await record('install', {}, {programDirectory, warn});
    assert.equal(warnings.length, 1);
    const other = join(await createTemporaryDirectory(t, 'arw-effect-other-'), 'logs');
    await writeFile(join(programDirectory, 'config.json'), JSON.stringify({...CONFIG, effectLog: {directory: other}}), 'utf8');
    await record('install', {}, {programDirectory, warn});
    assert.equal((await readLines(logDirectory)).length, 2);
    await assert.rejects(readdir(other), {code: 'ENOENT'});
    forgetConfiguration(programDirectory);
    await recorderFor(programDirectory)('install', {}, await createTemporaryDirectory(t, 'plain-dir-'));
    assert.equal((await readLines(other)).length, 1);
});
