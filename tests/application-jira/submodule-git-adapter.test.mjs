import assert from 'node:assert/strict';
import test from 'node:test';

import {createSubmoduleGitAdapter} from '../../lib/application-jira/submodule-git-adapter.mjs';

const input = {branch: 'dev', head: 'local', mode: /** @type {'local'} */ ('local'), module: 'billing', remote: 'origin', repositoryRoot: '/application/billing', targetBranch: 'dev'};
const state = {branch: 'dev', head: 'local'};

test('Submodule Git Adapter preserves failure diagnostics, stages and observed state', async () => {
    /** @type {{method: keyof ReturnType<typeof createSubmoduleGitAdapter>, command: string, code: string, message: string, extra: object}[]} */
    const cases = [
        {method: 'inspectConvergence', command: 'status', code: 'submodule-preflight-failed', message: 'Git preflight failed', extra: {state: {...state, clean: false}, stage: 'preflight'}},
        {method: 'fetch', command: 'fetch', code: 'submodule-fetch-failed', message: 'Fetch failed', extra: {stage: 'fetch'}},
        {method: 'compareRemote', command: 'remote-head', code: 'submodule-remote-observation-failed', message: 'Remote branch could not be observed', extra: {stage: 'final-verification'}},
        {method: 'compareRemote', command: 'merge-base', code: 'submodule-relation-failed', message: 'Commit relation could not be determined', extra: {stage: 'final-verification'}},
        {method: 'fastForward', command: 'merge', code: 'submodule-fast-forward-failed', message: 'Fast-forward failed', extra: {state}},
        {method: 'inspectSwitch', command: 'show-ref', code: 'submodule-preflight-failed', message: 'Git preflight failed', extra: {stage: 'preflight'}},
        {method: 'switchBranch', command: 'switch', code: 'submodule-switch-failed', message: 'Branch switch failed', extra: {state}},
        {method: 'restore', command: 'switch', code: 'submodule-recovery-failed', message: 'Branch recovery failed', extra: {state}},
        {method: 'restore', command: 'reset', code: 'submodule-recovery-failed', message: 'Branch recovery failed', extra: {state}},
    ];
    /** @type {import('../../lib/common/git-process.mjs').GitProcessResult[]} */
    const failures = [
        {code: 2, failure: null, stdout: Buffer.alloc(0), stderr: 'fatal'},
        {code: null, failure: 'process', stdout: Buffer.alloc(0), stderr: ''},
        {code: null, failure: 'timeout', stdout: Buffer.alloc(0), stderr: ''},
    ];
    for (const scenario of cases) {
        for (const failure of failures) {
            let resetAttempted = false;
            const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => {
                if (argv[0] === 'reset') resetAttempted = true;
                const remoteHead = argv[0] === 'rev-parse' && argv[2].startsWith('refs/');
                if ((remoteHead ? 'remote-head' : argv[0]) === scenario.command) return failure;
                return {code: 0, failure: null, stderr: '', stdout: Buffer.from(argv[0] === 'symbolic-ref' ? 'dev\n' : remoteHead ? 'remote\n' : 'local\n')};
            }}});
            assert.deepEqual(await adapter[scenario.method](input), {
                diagnostics: [{code: scenario.code, message: `${scenario.message} for configured Module billing.`}],
                status: 'failed',
                ...scenario.extra,
            }, `${scenario.method}: ${scenario.command}: ${failure.failure ?? failure.code}`);
            if (scenario.method === 'restore') assert.equal(resetAttempted, scenario.command === 'reset');
        }
    }
});

test('Submodule Git Adapter distinguishes missing references and all remote relations', async () => {
    for (const relation of ['equal', 'behind', 'ahead', 'diverged']) {
        const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => {
            let code = 0;
            let stdout = argv[0] === 'symbolic-ref' ? 'dev' : 'local';
            if (argv[0] === 'show-ref') code = 1;
            if (argv[0] === 'rev-parse' && argv[2].startsWith('refs/') && relation !== 'equal') stdout = 'remote';
            if (argv[0] === 'merge-base') code = (relation === 'behind' && argv[2] === 'local') || (relation === 'ahead' && argv[2] === 'remote') ? 0 : 1;
            return {code, failure: null, stderr: '', stdout: Buffer.from(stdout)};
        }}});
        assert.deepEqual(await adapter.compareRemote(input), {
            diagnostics: [], relation, state: {...state, remoteHead: relation === 'equal' ? 'local' : 'remote'}, status: 'succeeded',
        });
        assert.deepEqual(await adapter.inspectSwitch(input), {
            diagnostics: [], state: {...state, clean: false, localBranchExists: false, remoteBranchExists: false}, status: 'succeeded',
        });
    }
});


test('Submodule fetch alone uses the extended network timeout', async () => {
    /** @type {Array<{argv: string[], timeoutMs?: number}>} */
    const calls = [];
    const adapter = createSubmoduleGitAdapter({git: {run: async request => {
        calls.push(request);
        return {code: 0, failure: null, stdout: Buffer.from('dev\n'), stderr: ''};
    }}});
    assert.equal((await adapter.fetch(input)).status, 'succeeded');
    await adapter.inspectConvergence(input);
    assert.equal(calls[0].timeoutMs, 600_000);
    assert.ok(calls.length > 1);
    assert.ok(calls.slice(1).every(call => call.timeoutMs === undefined));
});

test('Submodule inspection distinguishes detached HEAD from a failed branch observation', async () => {
    for (const code of [1, 128]) {
        const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => ({code: argv[0] === 'symbolic-ref' ? code : 0,
            failure: null, stderr: '', stdout: Buffer.from(argv[0] === 'rev-parse' ? 'local\n' : '')})}});
        const result = await adapter.inspectSwitch(input);
        assert.equal(result.status, code === 1 ? 'succeeded' : 'failed');
        if (result.status === 'succeeded') assert.equal(result.state?.branch, '');
    }
});

test('Submodule inspection reports an unborn HEAD separately from Git failure', async () => {
    const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => ({code: argv[0] === 'rev-parse' ? 1 : 0,
        failure: null, stderr: '', stdout: Buffer.from(argv[0] === 'symbolic-ref' ? 'dev\n' : '')})}});
    for (const result of [await adapter.inspectSwitch(input), await adapter.inspectConvergence(input)]) {
        assert.equal(result.status, 'failed');
        assert.equal(result.diagnostics[0]?.code, 'submodule-head-missing');
    }
});

test('Submodule Git Adapter reports failed when the state after a mutation cannot be observed', async () => {
    const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => argv[0] === 'symbolic-ref'
        ? {code: null, failure: 'process', stdout: Buffer.alloc(0), stderr: ''}
        : {code: 0, failure: null, stdout: Buffer.from('local\n'), stderr: ''}}});
    for (const result of [await adapter.switchBranch(input), await adapter.fastForward(input), await adapter.restore(input), await adapter.compareRemote(input)]) {
        assert.equal(result.status, 'failed');
    }
});

test('Submodule Git Adapter passes option-shaped operands to Git as data', async () => {
    /** @type {string[][]} */
    const calls = [];
    const adapter = createSubmoduleGitAdapter({git: {run: async ({argv}) => {
        if (['fetch', 'merge', 'switch'].includes(argv[0])) calls.push(argv);
        return {code: 0, failure: null, stdout: Buffer.from('dev\n'), stderr: ''};
    }}});
    const operands = {...input, remote: '--example-remote', branch: '--example-branch', targetBranch: '--example-branch'};
    await adapter.fetch(operands);
    await adapter.fastForward(operands);
    await adapter.switchBranch(operands);
    await adapter.switchBranch({...operands, mode: 'remote-tracking'});

    assert.deepEqual(calls, [
        ['fetch', '--no-tags', '--', '--example-remote', '--example-branch'],
        ['merge', '--ff-only', '--', '--example-remote/--example-branch'],
        ['switch', '--', '--example-branch'],
        ['switch', '--track', '-c', '--example-branch', '--', '--example-remote/--example-branch'],
    ]);
});
