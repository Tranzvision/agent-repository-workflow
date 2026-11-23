import assert from 'node:assert/strict';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {setupScenario} from '../lib/reviewer-capability-setup.mjs';
import {createTemporaryDirectory} from './helpers/cleanup.mjs';
import {runGit} from './helpers/git.mjs';
import {runProcess} from './helpers/process.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'reviewer-capability');
const ENTRY = join(import.meta.dirname, '..', 'scripts', 'reviewer-capability.mjs');

test('setup stages the candidate over the base commit and returns the reviewer input', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-setup-');
    const scenario = join(root, 'code-standards-reviewer', 'demo');
    await mkdir(join(scenario, 'base'), {recursive: true});
    await mkdir(join(scenario, 'candidate'), {recursive: true});
    await writeFile(join(scenario, 'expected.json'), '{}');
    await writeFile(join(scenario, 'base', 'a.txt'), 'base\n');
    await writeFile(join(scenario, 'candidate', 'a.txt'), 'candidate\n');
    await writeFile(join(scenario, 'handoff.md'), 'Only the staged comparison.\n');
    const target = join(root, 'instance');
    const result = await setupScenario({scenario, target});
    assert.equal(result.status, 'succeeded');
    const input = /** @type {any} */ (result).input;
    assert.deepEqual([input.role, input.cwd, await readFile(input.reportPath, 'utf8')], ['code-standards-reviewer', target, '']);
    assert.match(input.handoff, /Only the staged comparison\.$/u);
    const [base, tree] = (await Promise.all([runGit(target, ['rev-parse', 'HEAD']), runGit(target, ['write-tree'])])).map(result => result.stdout.trim());
    assert.ok(input.handoff.includes(`git diff ${base} ${tree}`));
    assert.doesNotMatch(input.handoff, /--cached/u);
    assert.match(input.handoff, /Verification facts: none.*estimated net added lines: 0\./u);
    assert.ok(input.handoff.includes(`git ls-tree -r --name-only ${tree}`));
    assert.equal(input.confineReads, process.platform === 'linux');
    assert.equal((await runGit(target, ['diff', '--cached', '--name-only'])).stdout.trim(), 'a.txt');
    assert.equal((await runGit(target, ['log', '--format=%s'])).stdout.trim(), 'scenario base');
    assert.match(await readFile(join(target, 'AGENTS.md'), 'utf8'), /^# Agent Repository Workflow$/mu);
});

// Builds a real Git scenario repository, which exceeds 100 ms.
test('setup prepares the Spec Readiness Request', async t => {
    const target = join(await createTemporaryDirectory(t, 'arw-capability-setup-'), 'instance');
    const result = await setupScenario({scenario: join(FIXTURES, 'spec-readiness-reviewer', 'spec-readiness'), target});
    assert.equal(result.status, 'succeeded');
    assert.match(/** @type {any} */ (result).input.reportPath, /draft\.txt$/u);
});

// Builds three real Git scenario repositories (init, add, commit each), which exceeds 100 ms.
test('the inlined role instructions hold no relative path that would leave the instance', async t => {
    const target = join(await createTemporaryDirectory(t, 'arw-capability-setup-'), 'instance');
    for (const [role, scenario] of [['spec-readiness-reviewer', 'spec-readiness'], ['requirements-reviewer', 'code-spec'], ['code-standards-reviewer', 'code-standards']]) {
        const result = await setupScenario({scenario: join(FIXTURES, role, scenario), target: join(target, role)});
        assert.equal(result.status, 'succeeded', role);
        const {instructions} = /** @type {any} */ (result).input;
        assert.doesNotMatch(instructions, /`\.{1,2}\//u, role);
        assert.match(instructions, /`docs\/agents\/reviewer\.md`/u, role);
        for (const [, path] of instructions.matchAll(/`(docs\/agents\/[\w./-]+\.md)`/gu)) await access(join(target, role, path));
    }
});

test('setup blocks an existing target or a missing fixture', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-setup-');
    const scenario = join(FIXTURES, 'spec-readiness-reviewer', 'spec-readiness');
    assert.equal((await setupScenario({scenario, target: root})).status, 'blocked');
    assert.equal((await setupScenario({scenario: join(FIXTURES, 'nowhere', 'none'), target: join(root, 'other')})).status, 'blocked');
});

test('setup leaves no instance or recovery directory when the Reviewer role is unknown', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-setup-');
    const scenario = join(root, 'unknown-role', 'demo');
    await mkdir(scenario, {recursive: true});
    await writeFile(join(scenario, 'expected.json'), '{}');
    const target = join(root, 'instance');
    const result = await setupScenario({scenario, target});
    assert.equal(result.status, 'failed');
    await assert.rejects(access(target), {code: 'ENOENT'});
    await assert.rejects(access(join(root, 'state')), {code: 'ENOENT'});
});

test('setup accepts an absent handoff and rejects a handoff that cannot be read', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-setup-');
    const scenario = join(root, 'code-standards-reviewer', 'demo');
    await mkdir(scenario, {recursive: true});
    await writeFile(join(scenario, 'expected.json'), '{}');
    const target = join(root, 'instance');
    await mkdir(join(scenario, 'handoff.md'));
    const result = await setupScenario({scenario, target});
    assert.equal(result.status, 'failed');
    await assert.rejects(access(target), {code: 'ENOENT'});
    const absentScenario = join(root, 'code-standards-reviewer', 'no-handoff');
    await mkdir(absentScenario);
    await writeFile(join(absentScenario, 'expected.json'), '{}');
    assert.equal((await setupScenario({scenario: absentScenario, target})).status, 'succeeded');
});

test('the entry maps results to exit codes', async () => {
    const run = async (/** @type {string[]} */ ...args) => /** @type {any} */ (await runProcess(process.execPath, [ENTRY, ...args]));
    const [unknown, blocked] = await Promise.all([
        run('bogus'),
        run('score', join(FIXTURES, 'nowhere', 'none'), 'report.md', '--no-repair', '--agent', 'agent.json'),
    ]);
    assert.equal(unknown.exitCode, 2);
    assert.deepEqual([blocked.exitCode, JSON.parse(blocked.stdout).status], [1, 'blocked']);
});

test('the entry parses the repeatable options and the cell lists', async () => {
    const run = async (/** @type {string[]} */ ...args) => /** @type {any} */ (await runProcess(process.execPath, [ENTRY, ...args]));
    const [noCells, missingCell, noLevels] = await Promise.all([run('summary', '--markdown'), run('summary', '--cell'), run('summary', '--report-range', 'a')]);
    assert.deepEqual([noCells.exitCode, JSON.parse(noCells.stdout).status], [1, 'blocked']);
    assert.deepEqual([missingCell.exitCode, noLevels.exitCode], [2, 2]);
    // An empty level or penalty is the caller's mistake: it reaches the checks and is blocked before any file is read.
    const [emptyLevel, emptyPenalty] = await Promise.all([run('summary', '--cell', 'a', 'missing.json', '--report-range', 'a=high,'), run('summary', '--cell', 'a', 'missing.json', '--range-penalty', '')]);
    assert.match(emptyLevel.stderr, /report range of a needs/u);
    assert.match(emptyPenalty.stderr, /range penalty must be/u);
});


// Builds a real Git scenario repository, which exceeds 100 ms.
test('setup ignores signing and removes a failed scenario target', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-settings-');
    const scenario = join(root, 'code-standards-reviewer', 'demo');
    await mkdir(join(scenario, 'base'), {recursive: true});
    await writeFile(join(scenario, 'expected.json'), '{}');
    const config = join(root, 'gitconfig');
    await writeFile(config, '[commit]\n    gpgsign = true\n[gpg]\n    program = missing-signing-program\n[core]\n    hooksPath = missing-hooks\n');
    const built = await runProcess(process.execPath, [ENTRY, 'setup', scenario, join(root, 'signed')], {env: {...process.env, GIT_CONFIG_GLOBAL: config}});
    assert.equal(built.status, 'exited');
    if (built.status !== 'exited') return;
    assert.equal(built.exitCode, 0, built.stderr);
    const target = join(root, 'failed');
    const failed = await runProcess(process.execPath, [ENTRY, 'setup', scenario, target], {env: {...process.env, GIT_AUTHOR_DATE: 'not-a-date'}});
    assert.equal(failed.status, 'exited');
    if (failed.status !== 'exited') return;
    assert.equal(JSON.parse(failed.stdout).stage, 'scenario-build');
    assert.match(failed.stderr, /invalid date/u);
    await assert.rejects(access(target), {code: 'ENOENT'});
});

test('pool build rejects non-positive, fractional and nonnumeric limits as usage errors', async () => {
    // One representative per class (0 stands for every non-positive value), each a real entry process, run concurrently.
    await Promise.all(['0', '1.5', 'abc'].map(async limit => {
        const result = await runProcess(process.execPath, [ENTRY, 'pool', 'build', 'scenario', 'root', 'pool', 'candidates', '--limit', limit]);
        assert.equal(result.status, 'exited');
        if (result.status !== 'exited') return;
        assert.equal(result.exitCode, 2);
        assert.match(result.stderr, /--limit must be a positive integer/u);
    }));
});
