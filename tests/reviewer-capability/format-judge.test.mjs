import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {sha256} from '../../lib/common/json.mjs';
import {adoptLines, formatCandidate, FORMAT_JUDGE_DIR} from '../../lib/reviewer-capability/format-judge.mjs';
import {pool, score} from '../../lib/reviewer-capability/operations.mjs';
import {candidateFingerprint} from '../../lib/reviewer-capability/pool.mjs';
import {isFinalScore} from '../../lib/reviewer-capability/results.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';

const SPEC_READINESS = join(import.meta.dirname, '..', 'fixtures', 'reviewer-capability', 'spec-readiness-reviewer', 'spec-readiness');
const BAD = '* SPEC-READINESS-INPUTS, gap: the subject selects an absent Input.\n';
const GOOD = '- SPEC-READINESS-INPUTS, gap: the subject selects an absent Input.\n';
const LISTING = {status: 'succeeded', result: {notifications: []}};
const brief = sha256(await readFile(join(FORMAT_JUDGE_DIR, 'brief.md'), 'utf8'));

/** A temporary directory holding one report and an agent listing; `score` over it with the given decision stores. */
const setup = async (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ text, /** @type {any} */ listing = LISTING) => {
    const root = await createTemporaryDirectory(t, 'arw-format-judge-');
    await writeFile(join(root, 'agent.json'), JSON.stringify(listing));
    await writeFile(join(root, 'r.md'), text);
    const scoreIt = async (/** @type {any} */ input = {}, /** @type {any[]} */ store = []) => {
        const paths = [];
        for (const [index, decisions] of store.entries()) {
            paths.push(join(root, `d${index}.json`));
            await writeFile(paths.at(-1) ?? '', JSON.stringify({decisions}));
        }
        return score({agent: join(root, 'agent.json'), decisions: paths, noRepair: true, report: join(root, 'r.md'), scenario: SPEC_READINESS, ...input});
    };
    return {root, scoreIt};
};
/** A stored decision for the format candidate of a report. */
const stored = (/** @type {any} */ candidate, /** @type {any} */ extra) => ({[candidate.candidateId]: {decision: 'format-accept', reason: 'r', source: 'pool t:1', kind: 'format',
    fingerprint: candidateFingerprint(candidate), brief_sha256: brief, allowedDecisions: candidate.allowedDecisions, ...extra}});

test('adoptLines takes only symbol-only rewrites of whole lines and counts the changed ones', () => {
    const text = '* A-B, gap: x.md:3\nkeep\n';
    assert.deepEqual(adoptLines(text, [{line: 1, text: '- A-B, gap: x.md:3'}]), {errors: 1, text: '- A-B, gap: x.md:3\nkeep\n'});
    assert.equal(adoptLines(text, [{line: 1, text: '* A-B, gap: x.md:3'}]), undefined, 'an unchanged line is no repair');
    for (const lines of [[{line: 1, text: '- A-B, gap: x.md:4'}], [{line: 1, text: '- a-b, gap: x.md:3'}], [{line: 1, text: '- A-B, gap: x.md:3\n- C'}], [{line: 3, text: 'x'}],
        [{line: 1, text: '- A-B gap x.md:3'}, {line: 1, text: '- A-B, gap: x.md:3'}], [{line: 1, text: 7}], 'x', undefined]) {
        assert.equal(adoptLines(text, /** @type {any} */ (lines)), undefined, JSON.stringify(lines));
    }
});

test('adoptLines keeps every token and the separator next to a number, and holds JSONL values equal', () => {
    const text = 'x `a.md:12-14` and 12, 14 ok "p q"\n';
    const one = (/** @type {string} */ to, json = false) => adoptLines(text, [{line: 1, text: to}], {json});
    assert.ok(one('x a.md:12-14 and 12, 14 ok "p q"'), 'markup around tokens may go');
    for (const to of ['x `a.md:1,214` and 12, 14 ok "p q"', 'x `a.md:121-4` and 12, 14 ok "p q"', 'x `a.md:12,14` and 12, 14 ok "p q"', 'x `a.md:12-14` and 12-14 ok "p q"',
        'x `a.md 12-14` and 12, 14 ok "p q"', 'x `a.md:12-14` and 12, 14 ok "pq"']) assert.equal(one(to), undefined, to);
    const row = '{"lines": [12, 14], "a": "x y"}';
    assert.deepEqual(adoptLines(`\`${row}\`\n`, [{line: 1, text: row}], {json: true})?.errors, 1);
    assert.equal(adoptLines('```json\n', [{line: 1, text: ''}], {json: true}), undefined);
    for (const to of ['{"lines": [1, 214], "a": "x y"}', '{"lines": [12, 14], "a": "xy"}', '{"lines": [12, 13, 14], "a": "x y"}', `\`${row}\``]) {
        assert.equal(adoptLines(`\`${row}\`\n`, [{line: 1, text: to}], {json: true}), undefined, to);
    }
    assert.equal(adoptLines('`{"a": 1`\n', [{line: 1, text: '{"a": 1}'}], {json: true}), undefined, 'a line that was not JSON once unwrapped is not repaired');
});

test('a format candidate exists only for a readable, non-empty report of a delivered review', () => {
    const input = {completion: null, extension: '.md', instanceId: 'i', role: 'spec-readiness-reviewer', text: BAD};
    const candidate = formatCandidate(input);
    assert.deepEqual([candidate?.candidateId, candidate?.kind, candidate?.check, candidate?.expectation], ['i/format', 'format', 'spec-readiness-items', null]);
    assert.match(candidate?.finding ?? '', /^1\| \* SPEC-READINESS-INPUTS/u);
    assert.equal(candidateFingerprint(candidate), candidateFingerprint(formatCandidate(input)));
    assert.notEqual(candidateFingerprint(candidate), candidateFingerprint(formatCandidate({...input, text: `${BAD}x`})));
    assert.equal(formatCandidate({...input, text: ' \n'}), undefined);
    assert.equal(formatCandidate({...input, completion: {status: 'incomplete'}}), undefined);
    assert.equal(formatCandidate({...input, role: 'requirements-reviewer', extension: '.jsonl'})?.check, 'jsonl-rows');
});

test('score: an undecided format candidate keeps the rejection, is listed and keeps the score from being final', async t => {
    const {scoreIt} = await setup(t, BAD);
    const listed = await scoreIt({enumerate: true});
    assert.deepEqual(listed.candidates.map((/** @type {any} */ candidate) => candidate.kind), ['format']);
    const result = await scoreIt();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.scores.modelFailure.reason, 'Report has no scorable finding.');
    assert.equal(result.candidates.length, 1);
    assert.equal(isFinalScore(result), false);
});

test('score: an accepted mapping is scored as the normalized report and costs one format error per changed line', async t => {
    const {scoreIt} = await setup(t, BAD);
    const [candidate] = (await scoreIt({enumerate: true})).candidates;
    const result = await scoreIt({}, [stored(candidate, {lines: [{line: 1, text: GOOD.trimEnd()}]})]);
    assert.equal(result.scores.modelFailure, undefined);
    assert.equal(result.scores.rJudged, 1);
    assert.equal(result.scores.r, 1);
    assert.deepEqual(result.candidates.filter((/** @type {any} */ item) => item.kind === 'format'), []);
    assert.equal(result.decisionSources['pool t:1'], 1);
    // The normalized report scores like a report that was written right, apart from that one error.
    const direct = await (await setup(t, GOOD)).scoreIt();
    assert.equal(result.scores.scoreBeforePenalty, direct.scores.scoreBeforePenalty);
    assert.equal(direct.scores.rJudged, 0);
});

test('score: a rejection, a mapping that fails the check, a mapping that does not parse and a stale decision all keep the rejection', async t => {
    const {scoreIt} = await setup(t, BAD);
    const [candidate] = (await scoreIt({enumerate: true})).candidates;
    const kept = async (/** @type {any} */ extra, /** @type {string[]} */ left) => {
        const result = await scoreIt({}, [stored(candidate, extra)]);
        assert.equal(result.scores.modelFailure.reason, 'Report has no scorable finding.');
        assert.deepEqual(result.candidates.map((/** @type {any} */ item) => item.kind), left);
        return result;
    };
    await kept({decision: 'format-reject'}, []);
    await kept({lines: [{line: 1, text: '- SPEC-READINESS-INPUTS, uncertain: the subject selects an absent Input.'}]}, []);
    await kept({lines: [{line: 1, text: '- SPEC-READINESS-INPUTS gap the subject selects an absent Input.'}]}, []);
    const stale = await kept({brief_sha256: 'old', lines: [{line: 1, text: GOOD.trimEnd()}]}, ['format']);
    assert.deepEqual(stale.staleDecisions, ['spec-readiness-r/format']);
});

test('score: a report with nothing readable, or of an incomplete review, has no format candidate', async t => {
    assert.deepEqual((await (await setup(t, '\n')).scoreIt()).candidates, []);
    const incomplete = await setup(t, BAD, {status: 'succeeded', result: {completion: {status: 'incomplete'}, notifications: []}});
    assert.deepEqual((await incomplete.scoreIt()).candidates, []);
});

test('pool: format candidates get their own pool with the synthetic format controls; a pass stores the line mapping', async t => {
    const {root, scoreIt} = await setup(t, BAD);
    const candidates = join(root, 'c.json');
    await writeFile(candidates, JSON.stringify((await scoreIt({enumerate: true})).candidates));
    const roots = join(root, 'pools');
    const built = await pool({action: 'build', candidates: [candidates], name: 'f', root: roots, scenario: FORMAT_JUDGE_DIR});
    assert.equal(built.status, 'succeeded');
    assert.equal(built.pools[0].real, 1);
    assert.equal((await pool({action: 'prompt', name: 'f', root: roots})).status, 'succeeded');
    const items = JSON.parse(await readFile(built.pools[0].pool, 'utf8'));
    const key = JSON.parse(await readFile(built.pools[0].key, 'utf8'));
    const reply = (/** @type {string} */ wrong) => ({decisions: items.map((/** @type {any} */ entry) => {
        const meta = key.items[entry.id];
        if (meta.source === 'instance') return {id: entry.id, decision: 'format-accept', reason: 'only the bullet mark', lines: [{line: 1, text: GOOD.trimEnd()}]};
        return {id: entry.id, decision: meta.control === wrong ? 'format-accept' : meta.expected, reason: 'x'};
    })});
    await writeFile(join(roots, 'f', 'bad.json'), JSON.stringify(reply('f4')));
    const failed = await pool({action: 'split', decisions: join(roots, 'f', 'bad.json'), name: 'f', root: roots});
    assert.equal(failed.status, 'blocked');
    await writeFile(join(roots, 'f', 'good.json'), JSON.stringify(reply('')));
    const passed = await pool({action: 'split', decisions: join(roots, 'f', 'good.json'), name: 'f', root: roots});
    assert.equal(passed.status, 'succeeded');
    assert.equal(passed.written, 1);
    const result = await scoreIt({}, [JSON.parse(await readFile(join(roots, 'f', 'decisions.json'), 'utf8')).decisions]);
    assert.equal(result.scores.rJudged, 1);
    assert.equal(result.scores.modelFailure, undefined);
});

test('pool build keeps format candidates apart from the others', async t => {
    const {root, scoreIt} = await setup(t, BAD);
    const [format] = (await scoreIt({enumerate: true})).candidates;
    await writeFile(join(root, 'c.json'), JSON.stringify([format, {...format, kind: 'association', candidateId: 'other'}]));
    const mixed = await pool({action: 'build', candidates: [join(root, 'c.json')], name: 'm', root: join(root, 'pools'), scenario: FORMAT_JUDGE_DIR});
    assert.equal(mixed.status, 'blocked');
    assert.match(mixed.diagnostics[0], /own pool/u);
});
