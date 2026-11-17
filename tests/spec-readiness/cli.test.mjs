import assert from 'node:assert/strict';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import test from 'node:test';

import {createRepository, run, writeArtifact, writeConfig, writeIssue} from '../helpers/arw-cli.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';

test('spec readiness prepare accepts JSON stdin and emits a minimal reviewer request', async t => {
    const repository = await createRepository(t);
    const spec = '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n';
    const role = '# Reviewer\n\n## Responsibility\n\nReview.\n';
    const issue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', spec);
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', issue);
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), role, 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');

    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01'], repository, {
        specReadinessDependencies: {
            platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'test-session'})},
        },
        stdin: JSON.stringify({inputs: [{filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'}]}),
    });

    assert.equal(prepared.result, 0, JSON.stringify(prepared.events));
    const round = prepared.events[0].message;
    assert.match(round, /[\\/]rounds[\\/][0-9a-f-]+$/);
    const request = JSON.parse(await readFile(join(dirname(dirname(round)), 'requests', `request-${basename(round)}.json`), 'utf8'));
    assert.equal(JSON.parse(await readFile(join(round, 'spec-readiness-reviewer.jsonl'), 'utf8')).operation, 'spawn_agent');
    assert.equal(request.issueId, 'issue:0001:01');
    assert.equal(request.draftPath, join(round, 'report', 'draft.txt'));
    assert.equal(request.inputs.length, 1);
    assert.equal(request.reviewerRole.id, 'spec-readiness-reviewer');
    assert.equal(request.reviewerRole.filePath, 'docs/agents/roles/spec-readiness-reviewer.md');
    assert.match(request.reviewerRole.sha256, /^[0-9a-f]{64}$/);
    assert.equal(request.subject.filePath, '.scratch/0001-workflow/issues/01-implement.md');
    assert.match(request.subject.sha256, /^[0-9a-f]{64}$/);
});

test('spec readiness prepare reports precheck warnings on stderr and keeps stdout to the round directory', async t => {
    const repository = await createRepository(t);
    const issue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n');
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', issue);
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), '# Reviewer\n', 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');

    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01'], repository, {
        specReadinessDependencies: {platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'test-session'})}},
        stdin: JSON.stringify({inputs: [{filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'}]}),
    });

    assert.equal(prepared.result, 0);
    assert.deepEqual(prepared.events.map(event => event.channel), ['stdout', 'stderr']);
    assert.match(prepared.events[1].message, /^warning: \.scratch\/[^:]+: 验收项没有观察方式: - \[ \] Complete\./u);
    assert.match(prepared.events[0].message, /[\\/]rounds[\\/][0-9a-f-]+$/u);
});

test('spec readiness prepare accepts the shared JSON schema from an input file', async t => {
    const repository = await createRepository(t);
    const spec = '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n';
    const role = '# Reviewer\n\n## Responsibility\n\nReview.\n';
    const issue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', spec);
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', issue);
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), role, 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');
    const inputPath = join(repository.root, '.tmp', 'codex', 'test-session', '0001_01', 'spec-readiness', 'prepare-input.json');
    await mkdir(dirname(inputPath), {recursive: true});
    await writeFile(inputPath, JSON.stringify({inputs: [{filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'}]}), 'utf8');

    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01', '--input', inputPath], repository, {
        specReadinessDependencies: {
            platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'test-session'})},
        },
        stdin: 'not valid JSON',
    });

    assert.equal(prepared.result, 0);
    const round = prepared.events[0].message;
    assert.match(round, /[\\/]rounds[\\/][0-9a-f-]+$/);
    const request = JSON.parse(await readFile(join(dirname(dirname(round)), 'requests', `request-${basename(round)}.json`), 'utf8'));
    assert.equal(JSON.parse(await readFile(join(round, 'spec-readiness-reviewer.jsonl'), 'utf8')).operation, 'spawn_agent');
    assert.equal(request.draftPath, join(round, 'report', 'draft.txt'));
    assert.equal(request.inputs.length, 1);
    assert.equal(request.reviewerRole.id, 'spec-readiness-reviewer');
});

test('spec readiness rejects an issue in duplicate effort identities', async t => {
    const repository = await createRepository(t);
    const spec = '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n';
    const issue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    await writeArtifact(repository.root, '0001-first', 'spec.md', spec);
    await writeIssue(repository.root, '0001-first', '01-implement.md', issue);
    await writeArtifact(repository.root, '0001-second', 'spec.md', spec);
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), '# Reviewer\n', 'utf8');

    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01'], repository, {
        specReadinessDependencies: {
            platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'test-session'})},
        },
        stdin: JSON.stringify({inputs: [{filePath: '.scratch/0001-first/spec.md', role: 'governing-spec'}]}),
    });

    assert.equal(prepared.result, 1);
    assert.match(prepared.events[0].message, /Implementation issue not found: issue:0001:01/);
});

test('spec readiness CLI covers immutable request, generate, promote, verify, and exception lifecycle', async t => {
    const repository = await createRepository(t);
    const spec = '# Test spec\n\n## Module Design\n\n### Modules\n\nOwn behavior.\n\n### Interfaces\n\nInput and output.\n\n### Seams and Adapters\n\nVariation.\n\n### Dependencies and Data Flow\n\nFlow.\n\n### Design Rationale\n\nTradeoff.\n\n### ADR Evaluation\n\nNone.\n';
    const normalIssue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    const dependencies = {platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'lifecycle-test'})}};
    const recordPath = join(repository.root, '.scratch', '0001-workflow', 'issues', '01.spec-readiness.json');
    const workspace = join(repository.root, '.tmp', 'codex', 'lifecycle-test', '0001_01', 'spec-readiness');
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', spec);
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', normalIssue);
    await writeIssue(repository.root, '0001-workflow', '02-same-scope.md', normalIssue.replace('#module-design', '#interfaces'));
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), '# Reviewer\n', 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');

    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01'], repository, {
        specReadinessDependencies: dependencies,
        stdin: JSON.stringify({inputs: [
            {filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'},
            {filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'},
        ]}),
    });
    assert.equal(prepared.result, 0);
    const draftPath = join(prepared.events[0].message, 'report', 'draft.txt');
    const missingInput = await run(['spec-readiness', 'generate', '--issue', 'issue:0001:01'], repository, {specReadinessDependencies: dependencies});
    assert.equal(missingInput.result, 2);

    await writeFile(draftPath, 'No problems.\n', 'utf8');
    const generated = await run(['spec-readiness', 'generate', '--issue', 'issue:0001:01', '--input', draftPath], repository, {
        specReadinessDependencies: dependencies,
    });
    assert.equal(generated.result, 0);
    const generatedPath = generated.events[0].message;
    assert.equal((await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01'], repository)).result, 1);
    assert.equal((await run(['spec-readiness', 'promote', '--input', generatedPath], repository, {specReadinessDependencies: dependencies})).result, 0);
    const before = await readFile(recordPath, 'utf8');
    await writeFile(join(repository.root, '.scratch', '0001-workflow', 'issues', '02.spec-readiness.json'), before, 'utf8');
    const verified = await run(['spec-readiness', 'verify', '--issue', 'issue:0001:02'], repository);
    assert.equal(verified.result, 1);
    assert.match(verified.events[0].message, /Spec Readiness record does not match the issue/);

    await writeFile(draftPath, '', 'utf8');
    const rejectedEmpty = await run(['spec-readiness', 'generate', '--issue', 'issue:0001:01', '--input', draftPath], repository, {
        specReadinessDependencies: dependencies,
    });
    assert.equal(rejectedEmpty.result, 1);
    assert.equal(await readFile(recordPath, 'utf8'), before);
    await writeFile(join(repository.root, '.scratch', '0001-workflow', 'spec.md'), `${spec}\nChanged.\n`, 'utf8');
    const stale = await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01'], repository);
    assert.equal(stale.result, 1);
    assert.match(stale.events[0].message, /Stale Spec Readiness Input/);

    await writeIssue(repository.root, '0001-workflow', '01-implement.md', normalIssue.replace('Governing requirements:\n\n- `.scratch/0001-workflow/spec.md#module-design`', 'Not required'));
    const exceptionDraftPath = join(workspace, 'exception.json');
    await writeFile(exceptionDraftPath, JSON.stringify({exception: {confirmedAt: '2026-08-04T12:34:56Z', reason: 'No governing design is required.'}}), 'utf8');
    const invalidatedException = await run(['spec-readiness', 'generate', '--issue', 'issue:0001:01', '--input', exceptionDraftPath], repository, {
        specReadinessDependencies: dependencies,
    });
    assert.equal(invalidatedException.result, 1);
    assert.match(invalidatedException.events[0].message, /exactly one implementation issue/);
    await rm(join(repository.root, '.scratch', '0001-workflow', 'issues', '02-same-scope.md'));
    const exception = await run(['spec-readiness', 'generate', '--issue', 'issue:0001:01', '--input', exceptionDraftPath], repository, {
        specReadinessDependencies: dependencies,
    });
    assert.equal(exception.result, 0);
    assert.equal((await run(['spec-readiness', 'promote', '--input', exception.events[0].message], repository, {specReadinessDependencies: dependencies})).result, 0);
    assert.equal((await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01', '--subject-only'], repository)).result, 0);
    assert.equal((await run(['spec-readiness', 'verify', '--subject-only'], repository)).result, 2);
});

test('spec readiness commands append Effect Log records when it is enabled, and a write failure only adds one warning', async t => {
    const repository = await createRepository(t);
    const spec = '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n';
    const issue = '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n';
    const dependencies = {platformAdapter: {getCurrentAgentIdentity: () => ({platform: /** @type {const} */ ('codex'), sessionId: 'effect-test'})}};
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', spec);
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', issue);
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), '# Reviewer\n', 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');
    const stdin = JSON.stringify({inputs: [{filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'}]});
    const prepareArgs = ['spec-readiness', 'prepare', '--issue', 'issue:0001:01'];
    const logDirectory = join(await createTemporaryDirectory(t, 'arw-effect-'), 'log');
    const lines = async () => (await readFile(join(logDirectory, `effects-${new Date().toISOString().slice(0, 7)}.jsonl`), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));

    await writeConfig(repository.programDirectory, {agents: {}, configVersion: 3, editor: {args: ['{file}'], command: 'code'}, effectLog: {directory: logDirectory}, jira: {listLimit: 50}, reviewEditor: {args: ['--wait', '{file}'], command: 'code'}});
    const prepared = await run(prepareArgs, repository, {specReadinessDependencies: dependencies, stdin});
    assert.equal(prepared.result, 0);
    assert.equal(prepared.events.some(event => event.message.includes('effect log')), false);
    const draftPath = join(prepared.events[0].message, 'report', 'draft.txt');
    const generate = ['spec-readiness', 'generate', '--issue', 'issue:0001:01', '--input', draftPath];
    await writeFile(draftPath, '- a\n  - nested\n- b\n', 'utf8');
    assert.equal((await run(generate, repository, {specReadinessDependencies: dependencies})).result, 0);
    await writeFile(draftPath, 'No problems.\n', 'utf8');
    const generated = await run(generate, repository, {specReadinessDependencies: dependencies});
    assert.equal(generated.result, 0);
    assert.equal((await run(['spec-readiness', 'promote', '--input', generated.events[0].message], repository, {specReadinessDependencies: dependencies})).result, 0);
    assert.equal((await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01', '--subject-only'], repository)).result, 0);
    assert.equal((await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01'], repository)).result, 0);

    const records = await lines();
    const roundName = basename(prepared.events[0].message);
    assert.deepEqual(records.map(({kind, gate, result}) => [kind, gate, result]), [
        ['gate-round', 'spec-readiness', undefined],
        ['gate-result', 'spec-readiness', 'gap'],
        ['gate-result', 'spec-readiness', 'satisfied'],
        ['gate-verify', 'spec-readiness', undefined],
    ]);
    assert.equal(records[0].repository, basename(repository.root));
    assert.deepEqual(records[0].issues, ['issue:0001:01']);
    assert.deepEqual(records[1].findings, {[roundName]: 2});
    assert.deepEqual(records[2].findings, {[roundName]: 0});
    assert.equal(records.some(record => JSON.stringify(record).includes(repository.root)), false);

    await rm(logDirectory, {recursive: true});
    await writeFile(logDirectory, 'not a directory', 'utf8');
    const failed = await run(['spec-readiness', 'verify', '--issue', 'issue:0001:01'], repository);
    assert.equal(failed.result, 0);
    assert.deepEqual(failed.events.map(event => event.channel), ['stdout', 'stderr']);
    assert.match(failed.events[1].message, /^warning: effect log not written: \w+$/u);
});

test('spec readiness prepare writes no Effect Log file when it is not enabled', async t => {
    const repository = await createRepository(t);
    await writeArtifact(repository.root, '0001-workflow', 'spec.md', '# Test spec\n\n## Module Design\n\nNot required: No module boundary changes.\n');
    await writeIssue(repository.root, '0001-workflow', '01-implement.md', '# Implement workflow\n\nStatus: ready-for-agent\n\n## What to build\n\nImplement.\n\n## Acceptance criteria\n\n- [ ] Complete.\n\n## Blocked by\n\n- None\n');
    await mkdir(join(repository.root, 'docs', 'agents', 'roles'), {recursive: true});
    await writeFile(join(repository.root, 'docs', 'agents', 'roles', 'spec-readiness-reviewer.md'), '# Reviewer\n', 'utf8');
    await writeFile(join(repository.root, 'docs', 'agents', 'reviewer.md'), '# Reviewer rules\n', 'utf8');
    const prepared = await run(['spec-readiness', 'prepare', '--issue', 'issue:0001:01'], repository, {
        specReadinessDependencies: {platformAdapter: {getCurrentAgentIdentity: () => ({platform: 'codex', sessionId: 'off-test'})}},
        stdin: JSON.stringify({inputs: [{filePath: '.scratch/0001-workflow/spec.md', role: 'governing-spec'}]}),
    });
    assert.equal(prepared.result, 0);
    assert.equal(prepared.events.some(event => event.message.includes('effect log')), false);
});
