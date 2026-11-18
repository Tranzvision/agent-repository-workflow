import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {prepareReviewerRound} from '../../lib/reviewer-runtime/reviewer-round.mjs';
import {reviewerRecoveryPath} from '../../lib/reviewer-runtime/reviewer-session-record.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';

test('a round follows a usable thread, opens a new thread after a failed run, and stops on an unreadable record', async t => {
    const stateDirectory = await createTemporaryDirectory(t, 'arw-round-');
    const ruleFiles = new Map([['docs/agents/roles/r.md', Buffer.from('role')], ['docs/agents/reviewer.md', Buffer.from('common')]]);
    const recordPath = reviewerRecoveryPath({stateDirectory, role: 'r', identity: {kind: 'ordinary', issueIds: ['issue:0001:01']}});
    const round = async (/** @type {string} */ name) => {
        const roundDirectory = join(stateDirectory, name);
        await prepareReviewerRound({repositoryRoot: '/repo', roundDirectory, ruleFiles, reviewers: [{role: 'r', issueIds: ['issue:0001:01'],
            reportPath: join(roundDirectory, 'r', 'review.txt'), handoff: previous => `previous: ${previous?.reportPath ?? 'none'}`}]});
        return JSON.parse(await readFile(join(roundDirectory, 'r.jsonl'), 'utf8'));
    };
    const first = await round('1');
    assert.equal(first.operation, 'spawn_agent');
    assert.equal(first.input.newThread, undefined);
    const record = {runId: 'run-1', threadId: 'thread-1', failure: null, reportPath: join(stateDirectory, '1', 'r', 'review.txt')};
    await writeFile(recordPath, JSON.stringify(record));
    const second = await round('2');
    assert.equal(second.operation, 'followup_task');
    assert.equal(second.input.runId, 'run-1');
    assert.match(second.input.handoff, /previous: .*\/1\/r\/review\.txt/u);
    await writeFile(recordPath, JSON.stringify({...record, failure: {code: 'reviewer-stop-failed', message: 'Not exited.'}}));
    const third = await round('3');
    assert.deepEqual([third.operation, third.input.newThread, third.input.runId], ['spawn_agent', true, undefined]);
    await writeFile(recordPath, '{');
    await assert.rejects(round('4'), SyntaxError);
});

test('a round inlines role text with repository-relative paths instead of paths relative to the role file', async t => {
    const roundDirectory = await createTemporaryDirectory(t, 'arw-round-');
    const ruleFiles = new Map([['docs/agents/roles/r.md', Buffer.from('read `../reviewer.md` and `./r/findings.md`')], ['docs/agents/reviewer.md', Buffer.from('common')]]);
    await prepareReviewerRound({repositoryRoot: '/repo', roundDirectory: join(roundDirectory, '1'), ruleFiles, reviewers: [{role: 'r', issueIds: ['issue:0001:01'],
        reportPath: join(roundDirectory, '1', 'r', 'review.txt'), handoff: () => ''}]});
    const {input} = JSON.parse(await readFile(join(roundDirectory, '1', 'r.jsonl'), 'utf8'));
    assert.equal(input.instructions, 'read `docs/agents/reviewer.md` and `docs/agents/roles/r/findings.md`\n\ncommon');
});
