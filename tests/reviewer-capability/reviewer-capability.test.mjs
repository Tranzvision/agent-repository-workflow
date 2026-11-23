import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {loadScenario} from '../../lib/reviewer-capability/scenario.mjs';
import {normalizeBodyEvidence} from '../../lib/reviewer-capability/evidence.mjs';
import {sha256} from '../../lib/common/json.mjs';
import {pool, repeatedId, score, summary} from '../../lib/reviewer-capability/operations.mjs';
import {FORMAT_JUDGE_DIR} from '../../lib/reviewer-capability/format-judge.mjs';
import {candidateFingerprint} from '../../lib/reviewer-capability/pool.mjs';
import {createRandom} from '../../lib/reviewer-capability/random.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {item} from '../helpers/reviewer-capability-items.mjs';

const SPEC_READINESS = join(import.meta.dirname, '..', 'fixtures', 'reviewer-capability', 'spec-readiness-reviewer', 'spec-readiness');
const COMMIT_AUDIT = join(import.meta.dirname, '..', 'fixtures', 'reviewer-capability', 'requirements-reviewer', 'commit-audit');
const LISTING = {status: 'succeeded', result: {notifications: []}};
const association = (/** @type {string} */ expectation) => ({...item(expectation), candidateId: `c-${expectation}`});

/** A one-file Code Standards scenario: one problem on line 3, one clean case on line 5, anchors and a brief for pools. */
const scenario = async (/** @type {import('node:test').TestContext} */ t, role = 'code-standards-reviewer', severity = 'high') => {
    const directory = join(await createTemporaryDirectory(t, 'arw-capability-'), role, 'demo');
    await mkdir(join(directory, 'candidate', 'src'), {recursive: true});
    await writeFile(join(directory, 'candidate', 'src', 'a.mjs'), 'one\ntwo\nexport default function a() {}\nfour\nfive\nsix\n');
    await writeFile(join(directory, 'expected.json'), JSON.stringify({scopes: [{scope: 'CODE-STANDARDS-FINDINGS',
        problemCases: [{associationEvidence: [{filePath: 'src/a.mjs', line: 3}], evidence: [{filePath: 'src/a.mjs', line: 3}], expectation: 'a.mjs exports a function as default.',
            findingTerms: [['default']], result: 'gap', severity}],
        cleanCases: [{evidence: [{filePath: 'src/a.mjs', line: 5}], expectation: 'line five is fine.', findingTerms: [['five']]}, {noOtherSupportedFinding: true}]}]}));
    const control = (/** @type {string} */ id, /** @type {string} */ expected) => ({id, family: 'openai', model: 'm', expected, item: item(`control ${id}`)});
    await writeFile(join(directory, 'anchors.json'), JSON.stringify({anchors: [control('a1', 'matched'), control('a2', 'not-matched')], synthetic: [{...control('s1', 'matched'), type: 'real'}]}));
    await writeFile(join(directory, 'brief.md'), 'Pool <ADJ>/pool-<名>.json\n');
    // The registered format baseline of the demo scenario: one report of 20 locators with no format error, so pBase is 0.1.
    const sha = (await loadScenario(directory)).scenarioSha256;
    const runs = [{r: 0, rOverrun: 0, rRepairable: 0, rUnrepairable: 0, run: 'haiku-1', T: 20}];
    await writeFile(join(directory, '..', '..', 'registry.json'), JSON.stringify({demo: {scenarioSha256: {[`${role}/demo`]: sha}, pBase: 0.1, runs}}));
    await writeFile(join(directory, '..', '..', 'agent.json'), JSON.stringify(LISTING));
    return directory;
};
/** Scores with the registry and the agent listing `scenario` wrote next to the scenario; no repair is declared unless the input says so. */
const run = (/** @type {string} */ directory, /** @type {any} */ input) => score({agent: join(directory, '..', '..', 'agent.json'), noRepair: true, registry: join(directory, '..', '..', 'registry.json'), scenario: directory, ...input});
const report = async (/** @type {string} */ directory, /** @type {string} */ text, name = 'report.md') => {
    await writeFile(join(directory, name), text);
    return join(directory, name);
};

test('the shuffle matches Python random.Random(20261020)', () => {
    const values = Array.from({length: 30}, (_, index) => index);
    createRandom(20261020).shuffle(values);
    assert.deepEqual(values, [19, 7, 18, 12, 5, 0, 11, 9, 16, 13, 8, 28, 21, 3, 17, 29, 25, 22, 4, 2, 27, 26, 1, 15, 6, 10, 20, 23, 14, 24]);
});

test('body evidence rejects range endpoints past the last real line', () => {
    const filePath = 'example.md';
    for (const source of ['body\n', 'body\r\n', 'body']) {
        const sources = new Map([[filePath, source]]);
        assert.deepEqual(normalizeBodyEvidence([{filePath, lineStart: 1, lineEnd: 1}], sources), [{filePath, line: 1}]);
        assert.throws(() => normalizeBodyEvidence([{filePath, lineStart: 1, lineEnd: 2}], sources), /Evidence line does not exist: example\.md:2/u);
    }
    assert.throws(() => normalizeBodyEvidence([{filePath, lineStart: 1, lineEnd: 1}], new Map([[filePath, '']])), /Evidence line does not exist: example\.md:1/u);
});

test('the answer key checks the same weighted k tiers as scoring', async t => {
    const directory = await scenario(t);
    const path = join(directory, 'expected.json');
    const key = JSON.parse(await readFile(path, 'utf8'));
    Object.assign(key.scopes[0].problemCases[0], {k: 1, judgmentShare: 0.5});
    key.scopes[0].cleanCases[0].k = 1;
    await writeFile(path, JSON.stringify(key));
    await assert.rejects(loadScenario(directory), /0\.5 problem and 1 clean cases at k 1/u);
    key.scopes[0].cleanCases[0].judgmentShare = 0.5;
    await writeFile(path, JSON.stringify(key));
    await loadScenario(directory);
});

test('spec readiness scenario uses the same fenced heading boundaries as the issue subject', async t => {
    const directory = await scenario(t, 'spec-readiness-reviewer');
    const subjectPath = '.scratch/0001-demo/issues/01-demo.md';
    const issueDirectory = join(directory, 'candidate', '.scratch', '0001-demo', 'issues');
    await mkdir(issueDirectory, {recursive: true});
    const content = '## What to build\n\nBody.\n\n## Acceptance criteria\n\n~~~md\n## Example heading\n~~~\n\n- [ ] Actual criterion.\n';
    const path = join(directory, 'candidate', subjectPath);
    await writeFile(path, `# Demo\n\n${content}\n## Blocked by\n\n- None\n`);
    assert.equal((await loadScenario(directory)).sources.get(subjectPath), `${content}\n`);
    await writeFile(path, '# Demo\n\n## What to build\n\nMissing acceptance criteria.\n');
    await assert.rejects(loadScenario(directory), /malformed What to build or Acceptance criteria placement/u);
});

test('scoring: no findings earns nothing, a matched association earns the problem, an unmatched finding costs a clean case', async t => {
    const directory = await scenario(t);
    const none = await run(directory, {report: await report(directory, 'No findings.\n')});
    // Nothing in it reads as a finding: a model failure for now, and one format candidate for the judge to reject (second layer).
    assert.deepEqual([none.status, none.candidates.map((/** @type {any} */ candidate) => candidate.kind), none.scores.score], ['succeeded', ['format'], 0]);

    const hit = await run(directory, {report: await report(directory, '- `src/a.mjs:3` default export.\n')});
    assert.deepEqual(hit.candidates.map((/** @type {any} */ candidate) => candidate.kind), ['association']);
    const [candidate] = hit.candidates;
    const store = join(directory, 'decisions.json');
    await writeFile(store, JSON.stringify({decisions: {[candidate.candidateId]: {brief_sha256: sha256('Pool <ADJ>/pool-<名>.json\n'), decision: 'matched', fingerprint: candidateFingerprint(candidate)}}}));
    const decided = await run(directory, {decisions: [store], report: join(directory, 'report.md')});
    assert.deepEqual([decided.candidates, decided.scores.earnedProblemPoints > 0.9, decided.scores.score], [[], true, 1]);
    // A decision whose fingerprint no longer matches the candidate is not applied.
    await writeFile(store, JSON.stringify({decisions: {[candidate.candidateId]: {decision: 'matched', fingerprint: 'stale'}}}));
    assert.equal((await run(directory, {decisions: [store], report: join(directory, 'report.md')})).candidates.length, 1);

    const clean = await run(directory, {report: await report(directory, '- `src/a.mjs:5` five is wrong.\n')});
    assert.deepEqual([clean.candidates.map((/** @type {any} */ item) => item.kind), clean.scores.score < 0], [['finding'], true]);
});

test('scoring: bare locators in a finding restore Commit Audit Gate 2 evidence', async t => {
    const directory = await createTemporaryDirectory(t, 'arw-capability-report-');
    const finding = '- src/dispatch/queue.mjs:32, routeDuration omits parking (queue.mjs:32, 33).'
        + '\n  See [.scratch/0001-dispatch-control/spec.md:11] and [docs/dispatch/dispatch-policy.md:65-66, 68].'
        + ' Compare 12:30 and `13:45` at https://example.test/file.mjs:8 or http://[::1]/?path=src/dispatch/queue.mjs:7.';
    const path = await report(directory, finding + '\n');
    const {candidates, status} = await score({enumerate: true, noRepair: true, report: path, scenario: COMMIT_AUDIT});

    assert.equal(status, 'succeeded');
    assert.deepEqual(candidates.map((/** @type {any} */ candidate) => candidate.check), ['COMMIT-AUDIT-GATE-2']);
    assert.equal(candidates[0].finding, finding);
    assert.equal(await readFile(path, 'utf8'), finding + '\n');
    assert.deepEqual(candidates[0].evidence, [
        {filePath: 'src/dispatch/queue.mjs', line: 32},
        {filePath: 'src/dispatch/queue.mjs', line: 33},
        {filePath: '.scratch/0001-dispatch-control/spec.md', line: 11},
        {filePath: 'docs/dispatch/dispatch-policy.md', lineStart: 65, lineEnd: 66},
        {filePath: 'docs/dispatch/dispatch-policy.md', line: 68},
    ]);
});

test('scoring: inputs that cannot be scored are blocked', async t => {
    const directory = await scenario(t);
    assert.equal((await run(directory, {report: join(directory, 'missing.md')})).status, 'blocked');
    const noContent = await run(directory, {report: await report(directory, 'text without bullets\n')});
    assert.deepEqual([noContent.status, noContent.scores.score, noContent.scores.modelFailure !== undefined, noContent.scores.final], ['succeeded', 0, true, 0]);
    assert.equal((await run(directory, {report: await report(directory, '{}\n', 'r.jsonl')})).status, 'blocked');
    assert.equal((await run(directory, {report: join(directory, 'report.md'), scenario: join(directory, 'nowhere')})).status, 'blocked');
});

test('scoring: a short locator is completed and a Spec Readiness txt report scores like its JSONL form', async t => {
    const directory = await scenario(t);
    const short = await run(directory, {report: await report(directory, '- `a.mjs:3` default export.\n')});
    assert.deepEqual(short.candidates[0].evidence, [{filePath: 'src/a.mjs', line: 3}]);

    const reports = await createTemporaryDirectory(t, 'arw-capability-report-');
    const subject = '.scratch/0001-reviewer-capability/issues/01-review-readiness.md';
    await writeFile(join(reports, 'agent.json'), JSON.stringify(LISTING));
    const text = await report(reports, `- SPEC-READINESS-INPUTS, gap: the subject selects an absent Input (${subject}:21).\n`, 'r.txt');
    const rows = await report(reports, `${JSON.stringify({check: 'SPEC-READINESS-INPUTS', evidence: [`${subject}:21`], finding: `the subject selects an absent Input (${subject}:21).`, result: 'gap'})}\n`, 'r.jsonl');
    const [fromText, fromRows] = await Promise.all([text, rows].map(path => score({agent: join(reports, 'agent.json'), noRepair: true, report: path, scenario: SPEC_READINESS})));
    assert.equal(fromText.status, 'succeeded');
    assert.deepEqual(fromText.candidates.map((/** @type {any} */ item) => item.evidence), fromRows.candidates.map((/** @type {any} */ item) => item.evidence));
    assert.equal(fromText.scores.score, fromRows.scores.score);
});

test('score: stale decisions stay pending, provisional bounds enclose the score, enumerate lists the candidates', async t => {
    const directory = await scenario(t);
    const path = await report(directory, '- `src/a.mjs:3` default export.\n');
    const [candidate] = (await run(directory, {report: path})).candidates;
    const store = join(directory, 'decisions.json');
    const entry = {brief_sha256: sha256('Pool <ADJ>/pool-<名>.json\n'), decision: 'matched', fingerprint: candidateFingerprint(candidate), source: 'pool x'};
    const stored = async (/** @type {any} */ change) => { await writeFile(store, JSON.stringify({decisions: {[candidate.candidateId]: {...entry, ...change}}})); return run(directory, {decisions: [store], report: path}); };

    const fresh = await stored({});
    assert.deepEqual([fresh.decisions, fresh.decisionSources, fresh.staleDecisions, fresh.provisional, fresh.candidates], [1, {'pool x': 1}, [], null, []]);
    for (const change of [{brief_sha256: 'old'}, {fingerprint: 'old'}, {decision: 'unsupported'}]) {
        const stale = await stored(change);
        assert.deepEqual([stale.staleDecisions, stale.candidates.length, stale.decisions], [[candidate.candidateId], 1, 0]);
    }
    const lower = await run(directory, {provisional: 'lower', report: path});
    const upper = await run(directory, {provisional: 'upper', report: path});
    assert.deepEqual([lower.candidates, upper.candidates, lower.provisional, upper.decisionSources], [[], [], 'lower', {provisional: 1}]);
    assert.ok(lower.scores.score <= fresh.scores.score && fresh.scores.score <= upper.scores.score && lower.scores.score < upper.scores.score);

    const enumerated = await run(directory, {enumerate: true, report: path, agent: undefined});
    assert.deepEqual([enumerated.status, enumerated.enumerated, 'scores' in enumerated], ['succeeded', enumerated.candidates.length, false]);
    for (const input of [{enumerate: true, provisional: 'lower'}, {enumerate: true, decisions: [store]}, {provisional: 'middle'}]) {
        assert.equal((await run(directory, {report: path, ...input})).status, 'blocked');
    }
});

test('a repeated candidate id is found', () => {
    assert.deepEqual([repeatedId([{candidateId: 'a'}, {candidateId: 'b'}]), repeatedId([{candidateId: 'a'}, {candidateId: 'b'}, {candidateId: 'a'}])], [undefined, 'a']);
});

test('pools: Commit Audit rejects a copied Gate 1 decision for Gate 2', async t => {
    const root = await createTemporaryDirectory(t, 'arw-capability-pool-');
    const path = await report(root, '- `src/dispatch/executor.mjs:4` The public index omits its executor export.\n');
    const input = {noRepair: true, report: path, scenario: COMMIT_AUDIT};
    const {candidates} = await score({...input, enumerate: true});
    const [gate1, gate2] = candidates;
    const gate1Option = gate1.problemOptions.find((/** @type {any} */ option) => option.expectation === 'The public dispatch entry omits the executor surface.');
    const gate2Option = gate2.problemOptions.find((/** @type {any} */ option) => option.expectation === 'The public entry does not export `executor.mjs`.');
    const candidatesFile = join(root, 'candidates.json');
    const name = 'gate';
    await writeFile(candidatesFile, JSON.stringify(candidates));
    const build = {action: /** @type {const} */ ('build'), candidates: [candidatesFile], name, root, scenario: COMMIT_AUDIT};
    const built = await pool(build);
    assert.equal(built.status, 'succeeded');
    const [paths] = built.pools;
    await mkdir(join(paths.adj, 'view'));
    assert.equal((await pool({action: 'prompt', name, root})).status, 'succeeded');

    const {items} = JSON.parse(await readFile(paths.key, 'utf8'));
    const judge = (/** @type {string} */ gate2Decision) => ({decisions: Object.entries(items).map(([id, value]) => {
        const meta = /** @type {any} */ (value);
        return {id, decision: meta.expected ?? (meta.stableId === gate2.candidateId ? gate2Decision : gate1Option.decision), reason: 'Checked this candidate.'};
    })});
    const reply = join(paths.adj, 'decisions-gate.json');
    const split = async (/** @type {string} */ decision) => {
        await writeFile(reply, JSON.stringify(judge(decision)));
        return pool({action: 'split', decisions: reply, name, root});
    };
    const invalid = await split(gate1Option.decision);
    assert.equal(invalid.status, 'blocked');
    assert.match(invalid.diagnostics[0], /problem-gate-1-1 is not allowed/u);
    const storePath = join(root, name, 'decisions.json');
    await assert.rejects(readFile(storePath), {code: 'ENOENT'});

    assert.equal(gate2.problemOptions.find((/** @type {any} */ option) => option.decision === 'problem-gate-2-1').expectation.includes('parking'), true);
    assert.equal(gate2Option.decision, 'problem-gate-2-7');
    assert.equal((await split(gate2Option.decision)).written, 2);
    const override = await pool({action: 'override', decision: gate2Option.decision, id: gate2.candidateId, name, reason: 'Checked the missing export.', root});
    assert.equal(override.status, 'succeeded');
    const agent = join(root, 'agent.json');
    await writeFile(agent, JSON.stringify(LISTING));
    const rescored = await score({...input, agent, decisions: [storePath]});
    assert.deepEqual([rescored.candidates, rescored.scores.semanticProblemHits], [[], 2]);

    await writeFile(candidatesFile, JSON.stringify(candidates).replace(/problem-gate-[12]-/gu, 'problem-'));
    const legacy = await pool({...build, name: 'legacy'});
    assert.equal(legacy.status, 'blocked');
    assert.match(legacy.diagnostics[0], /score again/u);
    await assert.rejects(readFile(join(root, 'legacy', 'key.json')), {code: 'ENOENT'});
});

test('pools: prompt checks adj, split gives the review lists, override and anchor-add validate', async t => {
    const directory = await scenario(t);
    const root = await createTemporaryDirectory(t, 'arw-capability-pool-');
    const candidates = join(root, 'candidates.json');
    const finding = (/** @type {string} */ name, /** @type {any} */ extra = {}) => ({...item(name), candidateId: `c-${name}`, expectation: null, kind: 'finding', allowedDecisions: ['problem-1', 'unsupported'], ...extra});
    await writeFile(candidates, JSON.stringify([association('real one'), association('real two'), finding('maybe', {finding: 'x'}), finding('plain', {evidence: [{filePath: 'f', line: 3}]})]));
    const built = await pool({action: 'build', candidates: [candidates], name: 'p', root, scenario: directory});
    assert.deepEqual([built.status, built.alreadyDecidedSkipped, built.pools.map((/** @type {any} */ entry) => [entry.real, entry.controls])], ['succeeded', 0, [[4, 3]]]);
    const items = JSON.parse(await readFile(join(root, 'p', 'adj', 'pool-p.json'), 'utf8'));
    assert.equal(items.every((/** @type {any} */ entry) => !('candidateId' in entry) && /^[EF]\d\d$/u.test(entry.group)), true);

    // The judge's directory must hold the views the pool names, and nothing else.
    const adj = join(root, 'p', 'adj');
    assert.match((await pool({action: 'prompt', name: 'p', root})).diagnostics[0], /stage view, change\.diff/u);
    await mkdir(join(adj, 'view'));
    await writeFile(join(adj, 'view', 'a.txt'), 'a');
    await writeFile(join(adj, 'change.diff'), 'd');
    await writeFile(join(adj, 'notes.txt'), 'n');
    assert.match((await pool({action: 'prompt', name: 'p', root})).diagnostics[0], /more than the pool and its views: notes\.txt/u);
    await rm(join(adj, 'notes.txt'));
    const prompt = await pool({action: 'prompt', name: 'p', root});
    assert.match(await readFile(prompt.prompt, 'utf8'), /^Pool adj\/pool-p\.json\n\n调用方附加说明/u);
    assert.equal((await pool({action: 'split', decisions: join(root, 'none.json'), name: 'p', root})).status, 'blocked');

    const key = JSON.parse(await readFile(join(root, 'p', 'key.json'), 'utf8')).items;
    const stable = (/** @type {string} */ id) => key[id].stableId;
    const reasons = /** @type {Record<string, string>} */ ({'c-maybe': '可能不成立', 'c-plain': 'no support', 'c-real one': 'ok', 'c-real two': 'ok'});
    const judge = (/** @type {boolean} */ right) => ({decisions: items.map((/** @type {any} */ entry) => {
        const meta = key[entry.id];
        if (meta.source !== 'instance') return {id: entry.id, decision: right ? meta.expected : 'not-matched', reason: 'r'};
        return {id: entry.id, decision: meta.kind === 'association' ? 'matched' : 'unsupported', reason: reasons[stable(entry.id)]};
    })});
    await writeFile(join(root, 'wrong.json'), JSON.stringify(judge(false)));
    const failed = await pool({action: 'split', decisions: join(root, 'wrong.json'), name: 'p', root});
    assert.deepEqual([failed.status, failed.written, failed.passed], ['blocked', 0, false]);
    assert.equal(JSON.parse(await readFile(join(root, 'p', 'split-p.json'), 'utf8')).verdict.written, 0);
    await assert.rejects(readFile(join(root, 'p', 'decisions.json')), {code: 'ENOENT'});

    await writeFile(join(root, 'right.json'), JSON.stringify(judge(true)));
    // A pool file changed after the key was written is refused by prompt and split.
    const poolFile = join(adj, 'pool-p.json');
    const original = await readFile(poolFile, 'utf8');
    await writeFile(poolFile, original.replace('"f"', '"g"'));
    for (const action of /** @type {const} */ (['prompt', 'split'])) assert.match((await pool({action, decisions: join(root, 'right.json'), name: 'p', root})).diagnostics[0], /pool file differs/u);
    await writeFile(poolFile, original);
    const plainId = items.find((/** @type {any} */ entry) => key[entry.id].stableId === 'c-plain').id;
    const passed = await pool({action: 'split', decisions: join(root, 'right.json'), hard: [plainId, 'nope'], name: 'p', root});
    assert.deepEqual([passed.status, passed.written, passed.anchorAgreementByFamily.openai.n, passed.anchorAgreementByModel.m.rate, passed.syntheticByFamily.openai.n], ['succeeded', 4, 2, 1, 1]);
    const {review} = JSON.parse(await readFile(join(root, 'p', 'split-p.json'), 'utf8'));
    assert.deepEqual(review.supported, []);
    assert.deepEqual(review.disputedUnsupported.map((/** @type {any} */ entry) => [entry.stableId, entry.why]), [['c-maybe', ['hedged reason']], ['c-plain', ['among the hardest the adjudicator named']]]);

    // A brief that changed after the prompt makes the pool stale.
    await writeFile(join(directory, 'brief.md'), 'changed <ADJ> <名>\n');
    assert.match((await pool({action: 'split', decisions: join(root, 'right.json'), name: 'p', root})).diagnostics[0], /current brief/u);

    const override = (/** @type {any} */ input) => pool({action: 'override', id: 'c-real one', name: 'p', reason: 'checked', root, ...input});
    const storePath = join(root, 'p', 'decisions.json');
    const originalStore = await readFile(storePath, 'utf8');
    const rename = t.mock.method(fsPromises, 'rename', async () => { throw Object.assign(new Error('rename denied'), {code: 'EACCES'}); });
    syncBuiltinESMExports();
    try {
        const interrupted = await override({decision: 'not-matched', by: 'me'});
        assert.equal(interrupted.status, 'blocked');
        assert.equal(await readFile(storePath, 'utf8'), originalStore);
    } finally {
        rename.mock.restore();
        syncBuiltinESMExports();
    }
    assert.equal((await override({decision: 'not-matched', by: 'me'})).entry.source, 'override (me)');
    for (const input of [{decision: 'unsupported'}, {decision: 'maybe'}, {decision: 'matched', reason: ' '}, {id: 'c-gone', decision: 'matched'}]) assert.equal((await override(input)).status, 'blocked');
    const store = JSON.parse(await readFile(join(root, 'p', 'decisions.json'), 'utf8'));
    assert.deepEqual([store.decisions['c-real one'].decision, store.history.length], ['not-matched', 1]);

    const candidate = join(root, 'candidate.json');
    await writeFile(candidate, JSON.stringify(association('new anchor')));
    const add = (/** @type {any} */ input) => pool({action: 'anchor-add', candidate, confirmedBy: 'me', expected: 'matched', family: 'strata', model: 'm2', scenario: directory, ...input});
    const added = await add({});
    assert.deepEqual([added.status, added.anchor.id, added.anchor.origin], ['succeeded', 'a03', {candidateId: 'c-new anchor'}]);
    assert.equal(JSON.parse(await readFile(join(directory, 'anchors.json'), 'utf8')).anchors.length, 3);
    assert.ok((await readFile(join(directory, 'anchors.json'), 'utf8')).endsWith('}\n'));
    for (const input of [{id: 'a1'}, {model: ' '}, {family: 'x'}, {expected: 'supported'}]) assert.equal((await add(input)).status, 'blocked');
    await writeFile(candidate, JSON.stringify(finding('f')));
    assert.equal((await add({id: 'a09'})).status, 'blocked');
    // The new anchor takes part in the next pool and clashes with its own candidate.
    await writeFile(candidates, JSON.stringify([association('new anchor')]));
    assert.match((await pool({action: 'build', candidates: [candidates], name: 'q', root, scenario: directory})).diagnostics[0], /registered anchor/u);
    await writeFile(candidates, JSON.stringify([association('another')]));
    assert.equal((await pool({action: 'build', candidates: [candidates], name: 'q', root, scenario: directory})).status, 'succeeded');
    const anchorMeta = Object.values((await readFile(join(root, 'q', 'key.json'), 'utf8').then(JSON.parse)).items).find((/** @type {any} */ meta) => meta.control === 'a03');
    assert.deepEqual([anchorMeta.source, anchorMeta.origin], ['anchor', {candidateId: 'c-new anchor'}]);
});

/** severityUnits from {level: [weight, earned, reportedK]}; levels not given hold no problem case. */
const units = (/** @type {Record<string, number[]>} */ levels) => Object.fromEntries(['high', 'medium', 'low'].map(level => {
    const [weight, earned, reportedK] = levels[level] ?? [0, 0, 0];
    return [level, {earned, reportedK, weight}];
}));

test('summary: the first five files count, compare uses all files, unfinished and repeated inputs are blocked', async t => {
    const directory = await scenario(t);
    const write = async (/** @type {string} */ name, /** @type {any} */ scores, /** @type {any} */ extra = {}) => {
        // One high problem unit earns `final`, so the full report range scores it back to `final` (no overall deduction).
        const final = scores.final ?? 0.5;
        await writeFile(join(directory, name), JSON.stringify({candidates: [], provisional: null, scores: {f: 0.1, final, kCleanWeight: 1, kFailedCleanWeight: 0, missingChecks: 0, overallDeduction: 0, rawScore: 0.6,
            rRepairable: 1, scenarioSha256: 'v1', scoreBeforePenalty: 0.6, severityUnits: units({high: [1, final, final / 4]}), ...scores}, status: 'succeeded', ...extra}));
        return join(directory, name);
    };
    const files = await Promise.all([0.2, 0.4, 0.6, 0.8, 1, 0.9].map((final, index) => write(`s${index}.json`, {final})));
    const result = await summary({cells: [{files, label: 'cell'}], markdown: true});
    assert.deepEqual([result.status, result.cells[0].n, result.cells[0].nGiven, result.cells[0].extraIds, result.instances.map((/** @type {any} */ row) => row.main)], ['succeeded', 5, 6, [files[5]], [true, true, true, true, true, false]]);
    assert.ok(Math.abs(result.cells[0].mean - 0.6) < 1e-12 && Math.abs(result.cells[0].meanR83 - 0.6) < 1e-12);
    assert.equal(result.diagnostics.length, 1);
    assert.ok(result.markdown.split('\n').every((/** @type {string} */ line) => line === '' || line.startsWith('|')));
    const finals = (/** @type {number[]} */ values, /** @type {string} */ prefix) => Promise.all(values.map((final, index) => write(`${prefix}${index}.json`, {final})));
    const [control, candidate] = await Promise.all([finals([0.5, 0.6, 0.7], 'c'), finals([0.4, 0.5, 0.6], 'd')]);
    const ten = await finals([0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.6], 't');
    const compared = (await summary({cells: [{files: control, label: 'control'}, {files: candidate, label: 'candidate'}], compare: ['control', 'candidate'], markdown: true})).comparison;
    assert.deepEqual([compared.nControl, compared.nCandidate, compared.df], [3, 3, 4]);
    assert.ok([compared.diff + 0.1, compared.se - 0.08165, compared.ci95[0] + 0.3267, compared.ci95[1] - 0.1267].every(value => Math.abs(value) < 1e-4));
    const tenth = await summary({cells: [{files: ten, label: 'control'}, {files: candidate, label: 'candidate'}], compare: ['control', 'candidate']});
    assert.deepEqual([tenth.comparison.nControl, tenth.cells[0].n], [10, 5]);
    const flat = await write('flat.json', {final: 0.5});
    const same = await summary({cells: [{files: [flat, await write('flat2.json', {final: 0.5})], label: 'a'}, {files: [await write('flat3.json', {final: 0.3}), await write('flat4.json', {final: 0.3})], label: 'b'}], compare: ['a', 'b']});
    assert.deepEqual([same.comparison.df, same.comparison.ci95.map((/** @type {number} */ value) => Math.round(value * 10) / 10)], [null, [-0.2, -0.2]]);
    const blocked = (/** @type {any} */ cells) => summary({cells}).then(output => output.status);
    assert.deepEqual(await Promise.all([['control', 'control'], ['control', 'missing'], ['single', 'control']].map(compare => summary({cells: [{files: control, label: 'control'}, {files: [control[0]], label: 'single'}], compare: /** @type {[string, string]} */ (compare)}).then(output => output.status))), Array(3).fill('blocked'));
    assert.deepEqual(await Promise.all([blocked([]), blocked([{files: [], label: 'a'}]), blocked([{files: [files[0]], label: 'a'}, {files: [files[1]], label: 'a'}]), blocked([{files: [files[0]], label: 'a'}, {files: [files[0]], label: 'b'}]),
        blocked([{files: [await write('open.json', {}, {candidates: [{}]})], label: 'a'}]), blocked([{files: [await write('prov.json', {}, {provisional: 'lower'})], label: 'a'}]),
        blocked([{files: [await write('single.json', {final: undefined})], label: 'a'}]), blocked([{files: [join(directory, 'missing.json')], label: 'a'}])]), Array(8).fill('blocked'));
});

test('scenario: each problem case takes one severity, clean cases none, merged cases the same; the handoff note is part of the identity', async t => {
    const directory = await scenario(t);
    const [scope] = JSON.parse(await readFile(join(directory, 'expected.json'), 'utf8')).scopes;
    const [problem] = scope.problemCases;
    const loads = async (/** @type {any[]} */ scopes) => {
        await writeFile(join(directory, 'expected.json'), JSON.stringify({scopes}));
        return loadScenario(directory).then(() => 'loaded', error => error.message);
    };
    const merged = (/** @type {string} */ severity) => [{...scope, problemCases: [{...problem, merge: 'm'}]}, {scope: 'OTHER', problemCases: [{...problem, merge: 'm', severity}], cleanCases: []}];
    const results = [];
    for (const scopes of [[{...scope, problemCases: [{...problem, severity: undefined}]}], [{...scope, problemCases: [{...problem, severity: 'critical'}]}],
        [{...scope, cleanCases: [{...scope.cleanCases[0], severity: 'low'}, scope.cleanCases[1]]}], merged('low'), merged('high')]) results.push(await loads(scopes));
    assert.deepEqual(results.map(message => message.replace(/^.*(needs a severity|takes no severity|one severity).*$/u, '$1')), ['needs a severity', 'needs a severity', 'takes no severity', 'one severity', 'loaded']);
    const before = (await loadScenario(directory)).scenarioSha256;
    await writeFile(join(directory, 'handoff.md'), 'note\n');
    assert.notEqual((await loadScenario(directory)).scenarioSha256, before);
});

test('report range: severity units add up to the k counts, the full range gives the score final, severity stays out of candidates', async t => {
    const directory = await scenario(t);
    const hit = await report(directory, '- `src/a.mjs:3` default export.\n');
    const [candidate] = (await run(directory, {report: hit})).candidates;
    const store = join(directory, 'decisions.json');
    await writeFile(store, JSON.stringify({decisions: {[candidate.candidateId]: {brief_sha256: sha256('Pool <ADJ>/pool-<名>.json\n'), decision: 'matched', fingerprint: candidateFingerprint(candidate)}}}));
    const rejectedPaths = [await report(directory, 'No findings.\n', 'none.md'), await report(directory, 'text without bullets\n', 'failed.md')];
    const formatBrief = sha256(await readFile(join(FORMAT_JUDGE_DIR, 'brief.md'), 'utf8'));
    const pending = (await Promise.all(rejectedPaths.map(path => run(directory, {report: path})))).flatMap(output => output.candidates);
    const rejected = join(directory, 'format-decisions.json');
    await writeFile(rejected, JSON.stringify({decisions: Object.fromEntries(pending.map(item => [item.candidateId, {brief_sha256: formatBrief, decision: 'format-reject', fingerprint: candidateFingerprint(item)}]))}));
    const outputs = [await run(directory, {decisions: [store], report: hit}), ...await Promise.all(rejectedPaths.map(path => run(directory, {decisions: [rejected], report: path})))];
    const sum = (/** @type {any} */ scores, /** @type {string} */ field) => Object.values(scores.severityUnits).reduce((total, level) => total + level[field], 0);
    for (const {scores} of outputs) assert.deepEqual([sum(scores, 'weight'), sum(scores, 'earned')], [scores.kProblemWeight, scores.kEarnedProblemPoints]);
    assert.deepEqual([outputs[0].scores.final > 0, outputs[2].scores.modelFailure !== undefined, outputs[2].scores.severityUnits.high], [true, true, {earned: 0, reportedK: 0, weight: 1}]);
    const files = await Promise.all(outputs.map(async (output, index) => { await writeFile(join(directory, `o${index}.json`), JSON.stringify(output)); return join(directory, `o${index}.json`); }));
    assert.deepEqual((await summary({cells: [{files, label: 'a'}]})).instances.map((/** @type {any} */ row) => row.final), outputs.map(output => output.scores.final));
    // The same answer key graded low gives the same candidates and fingerprints.
    const low = await scenario(t, 'code-standards-reviewer', 'low');
    const [lowCandidate] = (await run(low, {report: await report(low, '- `src/a.mjs:3` default export.\n')})).candidates;
    assert.deepEqual([lowCandidate, candidateFingerprint(lowCandidate)], [candidate, candidateFingerprint(candidate)]);
});

test('report range: unreported problems outside it cost nothing, reported ones p x k x value, compare picks its mode, bad ranges are blocked', async t => {
    const directory = await scenario(t);
    const write = async (/** @type {string} */ name, /** @type {any} */ severityUnits, scenarioSha256 = 'v1') => {
        await writeFile(join(directory, name), JSON.stringify({candidates: [], provisional: null, scores: {f: 0, final: 0, kCleanWeight: 1, kFailedCleanWeight: 0, overallDeduction: 0.1, rawScore: 0,
            rRepairable: 0, scenarioSha256, scoreBeforePenalty: 0, severityUnits}, status: 'succeeded'}));
        return join(directory, name);
    };
    // The high problem is found in both; the low one (k 1) is half found in the first and not reported in the second.
    const files = [await write('p1.json', units({high: [1, 1, 0.25], low: [1, 0.5, 0.5]})), await write('p2.json', units({high: [1, 1, 0.25], low: [1, 0, 0]}))];
    const high = [{label: 'a', levels: ['high']}];
    const cell = (/** @type {any} */ input) => summary({cells: [{files, label: 'a'}], ...input});
    const finals = async (/** @type {any} */ input) => (await cell(input)).instances.map((/** @type {any} */ row) => Number(row.final.toFixed(6)));
    assert.deepEqual(await Promise.all([finals({}), finals({ranges: high}), finals({rangePenalty: 0, ranges: high})]), [[0.675, 0.45], [0.7875, 0.9], [0.9, 0.9]]);
    const ranged = (await cell({ranges: high, markdown: true}));
    assert.deepEqual([ranged.cells[0].range, ranged.cells[0].outOfRangeK, ranged.instances.map((/** @type {any} */ row) => row.outOfRangeK)], [['high'], 0.25, [0.5, 0]]);
    assert.match(ranged.markdown, /\| a \| high \| 2 \|/u);
    const otherVersion = await write('v2.json', units({high: [1, 1, 0.25]}), 'v2');
    const old = await write('old.json', undefined);
    assert.deepEqual(await Promise.all([{ranges: [{label: 'b', levels: ['high']}]}, {ranges: [{label: 'a', levels: []}]}, {ranges: [{label: 'a', levels: ['critical']}]},
        {ranges: [...high, {label: 'a', levels: ['low']}]}, {rangePenalty: -1}, {rangePenalty: Number.NaN}, {ranges: [{label: 'a', levels: ['medium']}]}].map(input => cell(input).then(output => output.status))), Array(7).fill('blocked'));
    assert.deepEqual(await Promise.all([[files[0], otherVersion], [old]].map(paths => summary({cells: [{files: paths, label: 'a'}]}).then(output => output.status))), ['blocked', 'blocked']);
    // The candidate cell reports no low problem; compared over the same range the range penalty counts, over a changed range it does not.
    const candidate = [await write('q1.json', units({high: [1, 1, 0.25], low: [1, 0, 0]})), await write('q2.json', units({high: [1, 1, 0.25], low: [1, 0, 0]}))];
    const compare = (/** @type {any} */ ranges, other = candidate) => summary({cells: [{files, label: 'a'}, {files: other, label: 'b'}], compare: ['a', 'b'], ranges});
    const same = (await compare([])).comparison;
    assert.deepEqual([same.mode, same.scoringRange, Number(same.diff.toFixed(6))], ['same-range', ['high', 'medium', 'low'], -0.1125]);
    // Both cells on high only: the control's reported low problem costs p, so the same-range diff is not the unpenalized 0.
    const bothHigh = [{label: 'a', levels: ['high']}, {label: 'b', levels: ['high']}];
    const sameHigh = (await compare(bothHigh)).comparison;
    assert.deepEqual([sameHigh.mode, Number(sameHigh.diff.toFixed(6))], ['same-range', 0.05625]);
    const changed = (await compare([{label: 'b', levels: ['high']}])).comparison;
    assert.deepEqual([changed.mode, changed.scoringRange, Number(changed.diff.toFixed(6))], ['range-change', ['high'], 0]);
    assert.deepEqual(await Promise.all([compare([{label: 'a', levels: ['low']}, {label: 'b', levels: ['high']}]), compare([{label: 'a', levels: ['high', 'medium']}, {label: 'b', levels: ['medium', 'low']}]),
        compare([], [otherVersion, await write('v3.json', units({high: [1, 1, 0.25]}), 'v2')])].map(output => output.then(result => result.status))), Array(3).fill('blocked'));
});
