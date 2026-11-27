import assert from 'node:assert/strict';
import fsPromises, {mkdir, writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {homedir} from 'node:os';
import {join, relative} from 'node:path';
import test from 'node:test';

import {inspect} from '../../lib/reviewer-capability/inspection.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {runProcess} from '../helpers/process.mjs';

const THREAD = 'thread-1';
const KEY = 'The reviewer must report that the dispatch plan drops the retry budget.';
const lines = (/** @type {any[]} */ records) => `${records.map(record => JSON.stringify(record)).join('\n')}\n`;

/** Codex record builders. */
const codex = {
    meta: (id = THREAD) => ({type: 'session_meta', payload: {id}}),
    call: (/** @type {string} */ id, input = 'const r = await tools.exec_command({cmd: "ls"});', name = 'exec') => ({type: 'response_item', payload: {type: 'custom_tool_call', call_id: id, name, input}}),
    fn: (/** @type {string} */ id) => ({type: 'response_item', payload: {type: 'function_call', call_id: id, name: 'exec_command', arguments: '{"cmd":"ls"}'}}),
    out: (/** @type {string} */ id, text = 'ok') => ({type: 'response_item', payload: {type: 'custom_tool_call_output', call_id: id, output: [{type: 'input_text', text}]}}),
    run: (/** @type {string} */ command, /** @type {string} */ cwd) => ({type: 'event_msg', payload: {type: 'item_completed', item: {type: 'CommandExecution', command: ['/bin/bash', '-lc', command], cwd: `file://${cwd}`}}}),
    done: {type: 'event_msg', payload: {type: 'task_complete'}},
};
/** Claude record builders. */
const claude = {
    owner: (id = THREAD) => ({type: 'session-owner', sessionId: id}),
    use: (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ input) => ({type: 'assistant', isSidechain: false, message: {content: [{type: 'tool_use', id, name, input}]}}),
    result: (/** @type {string} */ id, /** @type {string} */ content) => ({type: 'user', isSidechain: false, message: {content: [{type: 'tool_result', tool_use_id: id, content}]}}),
};

/** An instance with one file, an agent.json for `members` and a record of `records`; the fixtures hold one scenario whose answer key is `KEY`. */
const setup = async (/** @type {import('node:test').TestContext} */ t, /** @type {any[]} */ records, /** @type {any} */ options = {}) => {
    const root = await createTemporaryDirectory(t, 'arw-inspect-');
    const instance = join(root, 'run', 'one');
    await mkdir(join(instance, 'src'), {recursive: true});
    await mkdir(join(root, 'run', 'two'), {recursive: true});
    await writeFile(join(instance, 'src', 'a.mjs'), 'export const a = 1;\n');
    const sessionPath = join(root, 'record.jsonl');
    if (options.record !== false) await writeFile(sessionPath, options.text ?? lines(records));
    const member = {threadId: THREAD, sessionPath};
    if (options.agent !== false) await writeFile(join(instance, 'agent.json'), options.agentText ?? JSON.stringify(options.agent ?? {result: {threadId: THREAD, completion: options.completion, snapshot: {members: [member]}}}));
    const fixtures = join(root, 'fixtures');
    await mkdir(join(fixtures, 'role', 'scenario'), {recursive: true});
    await writeFile(join(fixtures, 'role', 'scenario', 'expected.json'), JSON.stringify({expectation: KEY, short: 'tiny', path: 'a/very/long/path/without/any/blank/in/it/at/all.md'}));
    return {fixtures, instance, root, sessionPath};
};
const run = async (/** @type {import('node:test').TestContext} */ t, /** @type {any[]} */ records, /** @type {any} */ options = {}) => {
    const {fixtures, instance, root} = await setup(t, records, options);
    return {result: /** @type {any} */ (await inspect({fixtures, instance})), instance, root};
};
const codexRecords = (/** @type {any[]} */ ...middle) => [codex.meta(), ...middle, codex.done];

const agy = {
    init: (/** @type {string} */ cwd, id = THREAD) => ({event: 'init', conversation_id: id, init: {cwd}}),
    step: (/** @type {number} */ index, /** @type {object} */ fields) => ({event: 'step_update', step_update: {
        conversation_id: THREAD, step_index: index, state: 'DONE', ...fields,
    }}),
    tool: (/** @type {string} */ name, /** @type {object} */ parameters, output = 'ok') => ({
        step_type: 'tool', tool_name: name, tool_info: {name, parameters, output},
    }),
    done: {event: 'result', result: {conversation_id: THREAD, status: 'SUCCESS', response: 'Reviewed.', num_turns: 1}},
};

test('inspect accepts a completed agy record and counts a tool step once', async t => {
    const {instance, fixtures, sessionPath} = await setup(t, []);
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(0, {step_type: 'user_input'}),
        agy.step(1, {step_type: 'system_message', duration_seconds: 1}),
        agy.step(2, {step_type: 'tool', tool_name: 'run_command', state: 'ACTIVE'}),
        agy.step(2, agy.tool('run_command', {CommandLine: 'cat src/a.mjs'})),
        agy.done,
    ]));

    assert.deepEqual(await inspect({fixtures, instance}), {
        calls: 1, diagnostics: [], flags: [], interrupted: false, sessionPath,
        status: 'succeeded', threadId: THREAD, unfinished: [],
    });
});

test('inspect accepts the agy 1.5.15 record shape: read_file and write_file with Path, a TOOL_ERROR step, a write step without output', async t => {
    const {instance, fixtures, root, sessionPath} = await setup(t, []);
    const step = (/** @type {number} */ index, /** @type {string} */ state, /** @type {string} */ name, /** @type {object} */ parameters, /** @type {object} */ rest = {}) => agy.step(index, {
        state, step_type: 'tool', tool_name: name, tool_info: {name, parameters, ...rest},
    });
    const missing = {Path: join(instance, 'AGENTS.md')};
    const report = {Path: join(instance, '.tmp', 'review', 'reports', 'report.txt')};
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(0, {step_type: 'user_input'}),
        agy.step(1, {step_type: 'agent_response', duration_seconds: 3.1, usage: {input_tokens: 10448, output_tokens: 132}}),
        step(2, 'ACTIVE', 'read_file', missing),
        step(2, 'DONE', 'read_file', missing, {output: '120 lines, 14655 bytes'}),
        step(3, 'ACTIVE', 'read_file', missing),
        step(3, 'ERROR', 'read_file', missing, {error: {type: 'TOOL_ERROR', message: 'file does not exist'}}),
        step(4, 'ERROR', 'read_file', missing, {error: {type: 'TOOL_ERROR', message: 'file does not exist'}}),
        step(5, 'ACTIVE', 'write_file', report),
        step(5, 'DONE', 'write_file', report),
        agy.done,
    ]));
    assert.deepEqual(await inspect({fixtures, instance}), {
        calls: 4, diagnostics: [], flags: [], interrupted: false, sessionPath,
        status: 'succeeded', threadId: THREAD, unfinished: [],
    });
    await writeFile(sessionPath, lines([agy.init(instance), step(1, 'DONE', 'read_file', {Path: join(root, 'two', 'x.txt')}, {output: 'x'}), step(2, 'DONE', 'write_file', {Path: join(root, 'two', 'y.txt')}), agy.done]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.position, flag.kind]), [[3, 'path']], 'only the write to an external path is flagged');
});

test('agy inspection flags paths, tools, and returned answer keys', async t => {
    const {instance, fixtures, root} = await setup(t, []);
    const sibling = join(root, 'run', 'two');
    const external = join(sibling, 'another [review].txt');
    const commandTarget = join(sibling, 'external.txt');
    await writeFile(external, 'external');
    await writeFile(commandTarget, 'external');
    const sessionPath = join(instance, 'agy.jsonl');
    await writeFile(join(instance, 'agent.json'), JSON.stringify({result: {
        threadId: THREAD, snapshot: {members: [{sessionPath}]},
    }}));
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(1, agy.tool('view_file', {AbsolutePath: external}, KEY)),
        agy.step(2, agy.tool('run_command', {CommandLine: 'cat ./external.txt', Cwd: '../two'})),
        agy.step(3, agy.tool('search_web', {query: 'external evidence'})),
        agy.step(4, agy.tool('write_to_file', {TargetFile: 'report.txt', CodeContent: external})),
        agy.step(5, {step_type: 'agent_response', text_delta: KEY}),
        agy.step(6, agy.tool('grep_search', {SearchPath: '../two/*.txt', Query: 'external'})),
        agy.done,
    ]));

    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.position, flag.kind, flag.match]), [
        [2, 'path', external], [2, 'answer-key', KEY.toLowerCase()],
        [3, 'path', commandTarget], [3, 'path', sibling], [4, 'tool', 'search_web'], [7, 'path', sibling],
    ]);
});

test('agy write tools are flagged for an external path that does not exist, a read of it is not', async t => {
    const {instance, fixtures, root} = await setup(t, []);
    const missing = join(root, 'run', 'two', 'new.txt');
    const sessionPath = join(instance, 'agy.jsonl');
    await writeFile(join(instance, 'agent.json'), JSON.stringify({result: {threadId: THREAD, snapshot: {members: [{sessionPath}]}}}));
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(1, agy.tool('write_to_file', {TargetFile: missing, CodeContent: 'x'})),
        agy.step(2, agy.tool('view_file', {AbsolutePath: missing})),
        agy.done,
    ]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.position, flag.kind, flag.match]), [[2, 'path', missing]]);
});

test('agy inspection checks the known arguments of an interrupted tool call', async t => {
    const {instance, fixtures, root, sessionPath} = await setup(t, [], {completion: null});
    const target = join(root, 'run', 'two');
    const parameters = {CommandLine: 'ls', Cwd: target};
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(1, {step_type: 'tool', tool_name: 'run_command', state: 'ACTIVE', tool_info: {name: 'run_command', parameters}}),
    ]));

    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.equal(result.status, 'succeeded');
    assert.equal(result.interrupted, true);
    assert.deepEqual(result.unfinished.map((/** @type {any} */ call) => call.position), [2]);
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.kind, flag.match]), [['path', target]]);
});

test('agy inspection blocks unusable records instead of returning a clean result', async t => {
    const {instance, fixtures, root, sessionPath} = await setup(t, []);
    const init = agy.init(instance);
    const active = agy.step(1, {step_type: 'tool', tool_name: 'run_command', state: 'ACTIVE'});
    const delegated = agy.step(1, {step_type: 'tool', subagent_info: {subagents: [{conversation_id: 'child'}]}});
    const cases = [
        ['missing init', [agy.done]],
        ['wrong thread', [agy.init(instance, 'another-thread'), agy.done]],
        ['wrong working directory', [agy.init(root), agy.done]],
        ['wrong result thread', [init, {event: 'result', result: {...agy.done.result, conversation_id: 'another-thread'}}]],
        ['subagent', [init, delegated, agy.done]],
        ['malformed tool call', [init, agy.step(1, agy.tool('view_file', {AbsolutePath: false})), agy.done]],
        ['missing final result', [init]],
        ['unfinished tool', [init, active, agy.done]],
        ['system message with tool fields', [init, agy.step(1, {step_type: 'system_message', tool_name: 'run_command'}), agy.done]],
        ['error step without error message', [init, agy.step(1, {step_type: 'tool', tool_name: 'read_file', state: 'ERROR', tool_info: {name: 'read_file', parameters: {Path: 'a'}, output: 'ok'}}), agy.done]],
        ['error state on a user input step', [init, agy.step(1, {step_type: 'user_input', state: 'ERROR'}), agy.done]],
        ['error state on a response of a run that did not succeed', [init, agy.step(1, {step_type: 'agent_response', state: 'ERROR'}), {event: 'result', result: {...agy.done.result, status: 'ERROR'}}]],
        ['error_message step then a 401 result', [init, agy.step(1, {step_type: 'error_message'}), {event: 'result', result: {...agy.done.result, status: 'ERROR', error: 'UNAUTHENTICATED (code 401)'}}]],
        ['unknown step state', [init, agy.step(1, {step_type: 'tool', tool_name: 'read_file', state: 'CANCELED', tool_info: {name: 'read_file', parameters: {Path: 'a'}, error: {message: 'x'}}}), agy.done]],
        ['unknown step type', [init, agy.step(1, {step_type: 'notice'}), agy.done]],
        ['trailing event', [init, agy.done, agy.step(1, {step_type: 'checkpoint'})]],
        ['old json envelope', [agy.done.result]],
    ];
    for (const [scenario, records] of /** @type {Array<[string, any[]]>} */ (cases)) {
        await writeFile(sessionPath, lines(records));
        assert.equal((await inspect({fixtures, instance})).status, 'blocked', scenario);
    }
    await writeFile(join(instance, 'agent.json'), JSON.stringify({result: {
        threadId: THREAD, completion: null, snapshot: {members: [{sessionPath}]},
    }}));
    await writeFile(sessionPath, lines([init, active]));
    assert.equal((await inspect({fixtures, instance})).status, 'blocked', 'interrupted before tool parameters were captured');
});

test('a Reviewer that reads inside the instance with allowed tools has no flags, on both backends', async t => {
    const first = await setup(t, []);
    const codexClean = codexRecords(codex.call('c1'), codex.run('git diff --cached HEAD && sed -n "/a/,/b/p" src/a.mjs 2>/dev/null', first.instance), codex.out('c1', 'file text'));
    await writeFile(first.sessionPath, lines(codexClean));
    const codexResult = /** @type {any} */ (await inspect(first));
    assert.deepEqual([codexResult.status, codexResult.threadId, codexResult.calls, codexResult.flags, codexResult.interrupted, codexResult.unfinished], ['succeeded', THREAD, 2, [], false, []]);
    const {result} = await run(t, [claude.owner(), claude.use('u1', 'Read', {file_path: 'src/a.mjs'}), claude.result('u1', 'text'), claude.use('u2', 'Bash', {command: 'git show :src/a.mjs | head -3'}), claude.result('u2', 'x')]);
    assert.deepEqual([result.status, result.calls, result.flags], ['succeeded', 2, []]);
});

test('an incomplete record blocks instead of passing', async t => {
    const good = codexRecords(codex.call('c1'), codex.run('ls', '/x'), codex.out('c1'));
    /** @type {Array<[string, any[], any]>} */
    const cases = [
        ['no agent.json', good, {agent: false}],
        ['agent.json not JSON', good, {agentText: '{nope'}],
        ['no result', good, {agent: {}}],
        ['no threadId', good, {agent: {result: {snapshot: {members: [{sessionPath: 'a'}]}}}}],
        ['no member', good, {agent: {result: {threadId: THREAD, snapshot: {members: []}}}}],
        ['no session_meta', [codex.call('c1'), codex.done], {}],
        ['claude without sessionId', [claude.use('u1', 'Read', {}), claude.result('u1', 'x')], {}],
        ['no sessionPath', good, {agent: {result: {threadId: THREAD, snapshot: {members: [{threadId: THREAD}]}}}}],
        ['two members', good, {agent: {result: {threadId: THREAD, snapshot: {members: [{sessionPath: 'a'}, {sessionPath: 'b'}]}}}}],
        ['record file missing', good, {record: false}],
        ['another thread', [codex.meta('other'), codex.done], {}],
        ['bad JSON line', good, {text: `${lines(good)}{broken\n`}],
        ['call without output', codexRecords(codex.call('c1'), codex.run('ls', '/x')), {}],
        ['no task_complete', good.slice(0, -1), {}],
        ['exec_command without execution entry', codexRecords(codex.call('c1'), codex.out('c1')), {}],
        ['function_call exec_command without execution entry', codexRecords(codex.fn('c1'), codex.out('c1')), {}],
        ['claude tool_use without result', [claude.owner(), claude.use('u1', 'Read', {file_path: 'x'})], {}],
        ['codex cwd not a string', codexRecords(codex.call('c1'), {type: 'event_msg', payload: {type: 'item_completed', item: {type: 'CommandExecution', command: ['ls'], cwd: 7}}}, codex.out('c1')), {}],
        ['codex command not an array', codexRecords(codex.call('c1'), {type: 'event_msg', payload: {type: 'item_completed', item: {type: 'CommandExecution', command: 'ls', cwd: '/x'}}}, codex.out('c1')), {}],
        ['null member', good, {agent: {result: {threadId: THREAD, snapshot: {members: [null]}}}}],
        ['null content block', [claude.owner(), {type: 'assistant', message: {content: [null]}}], {}],
        ['record line not an object', [...good, null], {}],
        ['claude sidechain', [claude.owner(), {...claude.use('u1', 'Read', {}), isSidechain: true}], {}],
    ];
    for (const [name, records, options] of cases) {
        const {result} = await run(t, records, options);
        assert.equal(result.status, 'blocked', name);
        assert.equal(result.flags, undefined, name);
    }
});

test('an interrupted instance is checked from the record it left, its calls without output listed as unfinished', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, [], {completion: null});
    const other = join(root, 'run', 'two');
    const cut = 'const r = await tools.exec_command({cmd: "cat src/a.mjs"});';
    await writeFile(sessionPath, lines([
        codex.meta(), codex.call('c1'), codex.run(`ls ${other}`, instance), codex.out('c1', KEY),
        codex.call('c2', 'await tools.view_image({path: "x"});'), codex.out('c2'), codex.call('c3', cut),
    ]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual([result.status, result.interrupted, result.calls, result.unfinished], ['succeeded', true, 4, [{position: 7, text: cut}]]);
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.kind, flag.position, flag.match]), [['path', 3, other], ['answer-key', 4, KEY.toLowerCase()], ['tool', 5, 'view_image']]);
    const claudeCut = await run(t, [claude.owner(), claude.use('u1', 'Grep', {pattern: 'retry', path: other}), claude.use('u2', 'Write', {content: 'notes'})], {completion: null});
    assert.deepEqual([claudeCut.result.status, claudeCut.result.unfinished, claudeCut.result.flags.map((/** @type {any} */ flag) => flag.kind)], ['succeeded', [{position: 2, text: `retry ${other}`}, {position: 3, text: ''}], ['path']]);
    const long = `const r = await tools.exec_command({cmd: "cat ${'x'.repeat(250)}"});`;
    const onlyCut = await run(t, [codex.meta(), codex.call('c1', long)], {completion: null});
    assert.deepEqual([onlyCut.result.status, onlyCut.result.unfinished], ['succeeded', [{position: 2, text: long.slice(0, 200)}]]);
    assert.equal((await run(t, [codex.meta(), codex.fn('c1')], {completion: null})).result.status, 'succeeded');
    assert.equal((await run(t, codexRecords(codex.fn('c1'), codex.run('ls', instance), codex.out('c1')))).result.status, 'succeeded');
    const ready = {status: 'ready', reportPath: '/r'};
    /** @type {Array<[string, any[], any]>} */
    const cases = [
        ['answered exec_command without execution entry', [codex.meta(), codex.call('c1'), codex.out('c1')], {completion: null}],
        ['answered function_call exec_command without execution entry', [codex.meta(), codex.fn('c1'), codex.out('c1')], {completion: null}],
        ['completed without task_complete', [codex.meta(), codex.call('c1'), codex.run('ls', '/x'), codex.out('c1')], {completion: ready}],
        ['completed with a call without output', codexRecords(codex.call('c1'), codex.run('ls', '/x')), {completion: ready}],
        ['another thread', [codex.meta('other')], {completion: null}],
        ['bad JSON line', [], {completion: null, text: `${JSON.stringify(codex.meta())}\n{broken\n`}],
        ['record line not an object', [codex.meta(), null], {completion: null}],
        ['record file missing', [], {completion: null, record: false}],
        ['claude sidechain', [claude.owner(), {...claude.use('u1', 'Read', {}), isSidechain: true}], {completion: null}],
    ];
    for (const [name, records, options] of cases) assert.equal((await run(t, records, options)).result.status, 'blocked', name);
});

test('calls that leave the instance, and tools outside the allow list, are flagged', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    const other = join(root, 'run', 'two');
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const records = codexRecords(
        codex.call('c1', 'await tools.view_image({path: "x"});'), codex.out('c1'),
        codex.run(`cat ../x; git -C ${root} status; find / -name "*.json"`, instance),
        codex.run(`cat ${other}/notes.md`, instance),
        codex.run('ls', other),
    );
    await writeFile(sessionPath, lines(records));
    const {flags} = /** @type {any} */ (await inspect({fixtures, instance}));
    const matches = flags.map((/** @type {any} */ flag) => `${flag.kind}:${flag.match}`);
    assert.ok(matches.includes('tool:view_image'));
    assert.ok(matches.includes(`path:${join(root, 'run', 'x')}`));
    assert.ok(matches.includes(`path:${root}`));
    assert.ok(matches.includes('path:/'));
    assert.ok(matches.includes(`path:${other}`));
    assert.ok(flags.every((/** @type {any} */ flag) => flag.text.length <= 200));
    assert.deepEqual(flags.map((/** @type {any} */ flag) => flag.position), [...flags.map((/** @type {any} */ flag) => flag.position)].sort((a, b) => a - b));
    const outside = await run(t, [claude.owner(), claude.use('u1', 'Read', {file_path: '/tmp'}), claude.result('u1', 'x'), claude.use('u2', 'WebFetch', {url: 'https://example.test'}), claude.result('u2', 'x')]);
    assert.deepEqual(outside.result.flags.map((/** @type {any} */ flag) => [flag.kind, flag.match]), [['path', '/tmp'], ['tool', 'WebFetch']]);
});

test('a path is flagged once per call, positions are file line numbers, and the Reviewer own record is allowed', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const records = codexRecords(codex.call('c1'), codex.run(`cat ../x ../x/ ${root}/run/x ${sessionPath}`, instance), codex.out('c1'));
    await writeFile(sessionPath, `\n${lines(records).replace('\n', '\n\n')}`);
    const {flags} = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(flags.map((/** @type {any} */ flag) => [flag.kind, flag.position, flag.match]), [['path', 5, join(root, 'run', 'x')]]);
    const transcript = join(root, 'projects', 'one');
    await mkdir(transcript, {recursive: true});
    const claudePath = join(transcript, `${THREAD}.jsonl`);
    await writeFile(claudePath, lines([claude.owner(), claude.use('u1', 'Grep', {path: transcript}), claude.result('u1', 'x'), claude.use('u2', 'Read', {file_path: claudePath}), claude.result('u2', 'x')]));
    await writeFile(join(instance, 'agent.json'), JSON.stringify({result: {threadId: THREAD, snapshot: {members: [{threadId: THREAD, sessionPath: claudePath}]}}}));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
});

test('a lone slash in a quoted pattern, a division or a prose separator is not the root directory', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const commands = [
        "git grep -E 'cost / 1e4' src",
        "git grep -F 'text.replace(/\"/' src",
        "rg '(^\\|/)src' src",
        'python3 -c "open(\'draft.txt\', \'a\').write(\'`failureCode`/`operation` and a / b\')"',
        'grep -c "x / y" src/a.mjs',
        "git grep -F 'read & write / execute' -- src",
        "git grep -F 'x; y / z' src",
    ];
    await writeFile(sessionPath, lines([codex.meta(), ...commands.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
    const real = ['ls /', 'ls -la /', 'cd / && ls', 'du -sh / | head', 'ls . /', 'ls "/"'];
    await writeFile(sessionPath, lines([codex.meta(), ...real.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags.map((/** @type {any} */ flag) => flag.match), Array(6).fill('/'));
    await writeFile(sessionPath, lines([codex.meta(), codex.call('c0'), codex.run('git status', '/'), codex.out('c0'), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags.map((/** @type {any} */ flag) => flag.match), ['/']);
    await writeFile(sessionPath, lines([claude.owner(), claude.use('u0', 'Bash', {command: "bash -lc 'ls /'"}), claude.result('u0', 'x'), claude.use('u1', 'Grep', {path: '/', pattern: 'x'}), claude.result('u1', 'x'), claude.use('u2', 'Grep', {path: 'src', pattern: '/'}), claude.result('u2', 'x'), claude.use('u3', 'Glob', {pattern: '/'}), claude.result('u3', 'x')]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags.map((/** @type {any} */ flag) => [flag.position, flag.match]), [[2, '/'], [4, '/'], [8, '/']]);
});

test('an awk match operator and regex literals are not a home or root directory read', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const commands = [
        "awk '{if ($0 ~ /Operations never modify/ || $1 !~ /A room/) print}' src/a.mjs",
        "awk '/[0-9]+/ {print}' src/a.mjs",
        "awk '$0 ~ /.*x/ {n++} END {print n}' src/a.mjs",
        "grep -E '/[a-z]+/' src/a.mjs",
        "awk -v name=a 'name ~ /^a/' src/a.mjs",
        "awk -v name=a 'name ~ /A b/' src/a.mjs",
        "awk '0 || name ~ \"x\"' src/a.mjs",
        "grep -E '/./' src/a.mjs",
        "awk '($0)~/.?/' src/a.mjs",
    ];
    await writeFile(sessionPath, lines([codex.meta(), ...commands.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
    const real = ['ls ~', 'ls /*', 'ls /[a-z]*', 'cat src/a.mjs ~', 'ls ~ /etc', "awk '{print}' src/a.mjs; ls ~ /etc", "awk '{print}' \"$(ls ~ /etc)\""];
    await writeFile(sessionPath, lines([codex.meta(), ...real.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags.map((/** @type {any} */ flag) => flag.match), [homedir(), '/', '/', homedir(), homedir(), homedir(), homedir()]);
});

test('a grep-family search pattern is not a path, its file arguments and other commands still are', async t => {
    const {fixtures, instance, sessionPath} = await setup(t, []);
    const patterns = [
        `git grep --cached -n "../../.*-service" -- src ${instance}`,
        `git grep --cached -n "from '../" -- src ${instance}`,
        `git grep --cached -n -E "from '../[^']+/[^']+-(service|store)\\.mjs'" -- src ${instance}`,
        "rg -n -e '../x' src",
        "grep -rn '~/a' src; egrep -n \"../y\" src/a.mjs",
    ];
    const write = (/** @type {string[]} */ commands) => writeFile(sessionPath, lines([codex.meta(), ...commands.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    await write(patterns);
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
    const real = ['grep -n x ../two', 'grep -n "x" ~ src', 'ls ../ | grep -n "x"', 'grep -n "$(cat ../two)" src', 'cat "../two" | wc', 'grep -f "../two" src', 'grep --file "../two" .', "rg --ignore-file '../two' pat", "rg -f '../two'", 'grep -nf "../two" src'];
    await write(real);
    assert.equal(/** @type {any} */ (await inspect({fixtures, instance})).flags.length, real.length);
});

test('a regex character class inside an inline program is not a glob of the root directory, a closed glob still is', async t => {
    const {fixtures, instance, sessionPath} = await setup(t, []);
    const write = (/** @type {string[]} */ commands) => writeFile(sessionPath, lines([codex.meta(), ...commands.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    await write([
        `node -e 'const escapeText = (text) => text.replace(/[&<>"]/g, (c) => c); console.log(escapeText("a"))'`,
        `node -e 'const NEEDS_QUOTES = /[",\\r\\n]/; console.log(NEEDS_QUOTES.test("a"))'`,
    ]);
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
    await write(['ls /[a-z]*', 'ls /[ab]', 'ls /*']);
    assert.equal(/** @type {any} */ (await inspect({fixtures, instance})).flags.length, 3);
});

test('a heredoc body that cat writes to a file is the Reviewer own writing, not a path access', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const body = `{"summary": "reads / writes", "see": "${root}/run/x and ../x"}`;
    const writers = [`cat > report.json <<'EOF'\n${body}\nEOF`, `cat >> report.json <<EOF\n${body}\nEOF`, `cd src && cat <<-EOF > report.json\n\t${body}\n\tEOF\ngit status`];
    const quoted = `bash -lc "cat > report.json <<'EOF'\n${body}\nEOF"`; // Claude only: Codex has its own wrapper already
    await writeFile(sessionPath, lines([codex.meta(), ...writers.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
    await writeFile(sessionPath, lines([claude.owner(), ...[...writers, quoted].flatMap((command, index) => [claude.use(`u${index}`, 'Bash', {command}), claude.result(`u${index}`, 'x')])]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
});

test('heredocs that run, other commands around a written body, and its target are still checked', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    const commands = [
        'cat > ../x <<EOF\nreport / text\nEOF',
        'cat > report.json <<EOF\nreport / text\nEOF\ncat ../x',
        'bash <<EOF\nls /\nEOF',
        'cat <<EOF | bash\nls ../x\nEOF',
        'cat > report.json <<EOF\n$(cat ../x)\nEOF',
        'cat > report.json <<EOF\n`cat ../x`\nEOF',
        'find / -name x',
        'cat <<EOF\nls /\nEOF',
        'cat >&2 <<EOF\nls /\nEOF',
        'cat > /dev/stdout <<EOF\nls /\nEOF',
        'cat > /proc/self/fd/1 <<EOF\nls /\nEOF',
        'eval "$(\ncat > /dev/stdout <<\'EOF\'\nls /\nEOF\n)"',
        "python3 scripts/cat.py <<'PY'\nls /\nPY",
        'bash ./cat-run.sh <<EOF\nls /\nEOF',
        'bash -c "$(cat <<\'EOF\'\nls /\nEOF\n)"',
    ];
    const expected = [join(root, 'run', 'x'), join(root, 'run', 'x'), '/', join(root, 'run', 'x'), join(root, 'run', 'x'), join(root, 'run', 'x'), ...Array(9).fill('/')];
    await writeFile(sessionPath, lines([codex.meta(), ...commands.flatMap((command, index) => [codex.call(`c${index}`), codex.run(command, instance), codex.out(`c${index}`)]), codex.done]));
    const {flags} = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(flags.map((/** @type {any} */ flag) => flag.match), expected);
    const wrapped = ['bash -lc "cat > report.json <<\'EOF\'\n$(ls /)\nEOF"', 'bash -lc "cat > report.json <<EOF\n$(cat /tmp)\nEOF"'];
    await writeFile(sessionPath, lines([claude.owner(), ...wrapped.flatMap((command, index) => [claude.use(`u${index}`, 'Bash', {command}), claude.result(`u${index}`, 'x')])]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags.map((/** @type {any} */ flag) => flag.match), ['/', '/tmp']);
});

test('answer-key text in tool output is flagged, in the Reviewer own writing or the instance it is not', async t => {
    const escaped = JSON.stringify(KEY).slice(1, -1);
    const {result} = await run(t, codexRecords(
        codex.call('c1'), codex.run('ls', '/x'), codex.out('c1', `{"expectation": "${escaped}"}`),
        codex.call('c2'), codex.out('c2', 'a/very/long/path/without/any/blank/in/it/at/all.md and the dispatch plan'),
        codex.call('c3'), codex.out('c3', `  ${KEY.toUpperCase()}`),
    ));
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.kind, flag.position]), [['answer-key', 4], ['answer-key', 8]]);
    const own = await run(t, [claude.owner(), claude.use('w1', 'Write', {file_path: 'report.txt', content: KEY}), claude.result('w1', 'written')]);
    assert.deepEqual(own.result.flags, []);
    const {fixtures, instance, sessionPath} = await setup(t, []);
    await writeFile(join(instance, 'src', 'copy.txt'), `${KEY}\n`);
    await writeFile(sessionPath, lines([claude.owner(), claude.use('u1', 'Read', {file_path: 'src/copy.txt'}), claude.result('u1', KEY)]));
    assert.deepEqual(/** @type {any} */ (await inspect({fixtures, instance})).flags, []);
});

test('unreadable inputs fail, repeated runs agree, and the entry maps results to exit codes', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    await writeFile(join(root, 'run', 'x'), 'outside\n');
    await writeFile(sessionPath, lines(codexRecords(codex.call('c1'), codex.run('cat ../x ../x', instance), codex.out('c1', `${KEY} ${KEY}`))));
    const first = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(JSON.stringify(first), JSON.stringify(await inspect({fixtures, instance})));
    assert.deepEqual([first.status, first.diagnostics, first.flags.map((/** @type {any} */ flag) => flag.kind)], ['succeeded', [], ['path', 'answer-key']]);
    const missing = /** @type {any} */ (await inspect({fixtures: sessionPath, instance}));
    assert.deepEqual([missing.status, missing.stage, missing.diagnostics.length], ['failed', 'fixture-read', 1]);
    const {instance: directory, fixtures: keys} = await setup(t, [], {agent: false});
    await mkdir(join(directory, 'agent.json'));
    const unreadable = /** @type {any} */ (await inspect({fixtures: keys, instance: directory}));
    assert.deepEqual([unreadable.status, unreadable.stage], ['failed', 'report-read']);
    const entry = join(import.meta.dirname, '..', '..', 'scripts', 'reviewer-capability.mjs');
    const [usage, blocked] = await Promise.all([runProcess(process.execPath, [entry, 'inspect']), runProcess(process.execPath, [entry, 'inspect', join(instance, 'src')])]);
    assert.equal(/** @type {any} */ (usage).exitCode, 2);
    assert.deepEqual([/** @type {any} */ (blocked).exitCode, JSON.parse(/** @type {any} */ (blocked).stdout).status], [1, 'blocked']);
});

test('relative and empty session paths are blocked at agent.json', async t => {
    const {fixtures, instance, sessionPath} = await setup(t, [claude.owner()]);
    for (const path of [relative(process.cwd(), sessionPath), '']) {
        await writeFile(join(instance, 'agent.json'), JSON.stringify({result: {threadId: THREAD, snapshot: {members: [{sessionPath: path}]}}}));
        const result = await inspect({fixtures, instance});
        assert.equal(result.status, 'blocked');
        assert.match(result.diagnostics[0], /agent.json/u);
    }
});

test('an instance file read failure is reported at fixture-read', async t => {
    const {fixtures, instance} = await setup(t, [claude.owner()]);
    const original = fsPromises.readFile;
    const mocked = t.mock.method(fsPromises, 'readFile', (/** @type {any[]} */ ...args) => {
        if (args[0] === join(instance, 'src', 'a.mjs')) throw new Error('instance read denied');
        return Reflect.apply(original, fsPromises, args);
    });
    syncBuiltinESMExports();
    try {
        const result = /** @type {any} */ (await inspect({fixtures, instance}));
        assert.deepEqual([result.status, result.stage, result.diagnostics], ['failed', 'fixture-read', ['instance read denied']]);
    } finally {
        mocked.mock.restore();
        syncBuiltinESMExports();
    }
});

test('agy inspection accepts every tool shape seen in the 1.5.14 to 1.5.16 trials: empty results, no-argument tools, the Reviewer prompt file and its own saved outputs', async t => {
    const {instance, fixtures, root, sessionPath} = await setup(t, []);
    const prompt = join(root, 'run', 'side', 'prompt.md');
    await mkdir(join(root, 'run', 'side'));
    await writeFile(prompt, 'Review.\n');
    const saved = join(root, 'home', '.gemini', 'antigravity-cli', 'brain', THREAD, '.system_generated', 'steps', '28', 'output.txt');
    await mkdir(join(saved, '..'), {recursive: true});
    await writeFile(saved, 'long output\n');
    const step = (/** @type {number} */ index, /** @type {string} */ name, /** @type {object} */ parameters, /** @type {object} */ rest = {}) => agy.step(index, {
        step_type: 'tool', tool_name: name, tool_info: {name, parameters, ...rest},
    });
    await writeFile(sessionPath, lines([
        agy.init(instance),
        step(1, 'read_file', {Path: prompt}, {output: '120 lines, 14661 bytes'}),
        step(2, 'read_file', {Path: join(instance, '.tmp', 'review', 'reports', 'report.txt')}),
        step(3, 'run_command', {CommandLine: 'git status --short'}),
        step(4, 'grep_search', {SearchPath: instance, Query: 'zzz'}),
        step(5, 'read_file', {Path: saved, StartLine: 1, EndLine: 800}, {output: '434 lines, 31959 bytes'}),
        step(6, 'run_command', {CommandLine: `sed -n 1,5p ${saved}`}),
        step(7, 'command_status', {CommandId: 'c1', WaitDurationSeconds: 5}),
        step(8, 'send_command_input', {CommandId: 'c1', Input: 'q'}, {output: 'done'}),
        step(9, 'wait', {}),
        agy.step(10, {step_type: 'tool', tool_name: 'wait_5_seconds', tool_info: {name: 'wait_5_seconds'}}),
        step(11, 'finish', {}),
        agy.done,
    ]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual([result.status, result.calls, result.flags], ['succeeded', 11, []]);
});

test('agy inspection still flags the neighbours of the allowed prompt file, outside writes, other threads and unknown tools', async t => {
    const {instance, fixtures, root, sessionPath} = await setup(t, []);
    const side = join(root, 'run', 'side');
    const brain = join(root, 'home', '.gemini', 'antigravity-cli', 'brain');
    await mkdir(side);
    await mkdir(join(brain, 'other', '.system_generated', 'steps', '1'), {recursive: true});
    await mkdir(join(brain, THREAD, '.system_generated', 'steps', '1'), {recursive: true});
    for (const file of [join(side, 'prompt.md'), join(side, 'other.md'), join(brain, 'other', '.system_generated', 'steps', '1', 'output.txt'), join(brain, THREAD, '.system_generated', 'steps', '1', 'secret.txt')]) await writeFile(file, 'x\n');
    const step = (/** @type {number} */ index, /** @type {string} */ name, /** @type {object} */ parameters) => agy.step(index, agy.tool(name, parameters));
    await writeFile(sessionPath, lines([
        agy.init(instance),
        step(1, 'read_file', {Path: join(side, 'other.md')}),
        step(2, 'write_file', {Path: join(side, 'prompt.md')}),
        step(3, 'read_file', {Path: join(brain, 'other', '.system_generated', 'steps', '1', 'output.txt')}),
        step(4, 'read_file', {Path: join(brain, THREAD, '.system_generated', 'steps', '1', 'secret.txt')}),
        step(5, 'read_url_content', {Url: 'https://example.com'}),
        agy.done,
    ]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual(result.flags.map((/** @type {any} */ flag) => [flag.position, flag.kind]), [[2, 'path'], [3, 'path'], [4, 'path'], [5, 'path'], [6, 'tool']]);
});

test('agy inspection accepts a response step that failed and was retried within a run that finished with SUCCESS (the 2026-11-25 hydrogen medium spec-readiness record)', async t => {
    const {instance, fixtures, sessionPath} = await setup(t, []);
    await writeFile(sessionPath, lines([
        agy.init(instance),
        agy.step(1, {step_type: 'agent_response', state: 'DONE', duration_seconds: 4.58, usage: {input_tokens: 11111, output_tokens: 96, thinking_tokens: 40, cache_read_tokens: 0, total_tokens: 11207}}),
        agy.step(33, {step_type: 'agent_response', state: 'ERROR', duration_seconds: 21.26, usage: {input_tokens: 19712, output_tokens: 2809, thinking_tokens: 2809, cache_read_tokens: 52778, total_tokens: 22521}}),
        agy.step(34, {step_type: 'agent_response', state: 'DONE'}),
        agy.done,
    ]));
    const result = /** @type {any} */ (await inspect({fixtures, instance}));
    assert.deepEqual([result.status, result.flags], ['succeeded', []]);
});

test('Claude inspection reports writes and edits to missing files outside the instance', async t => {
    const {fixtures, instance, sessionPath} = await setup(t, []);
    const external = await createTemporaryDirectory(t, 'arw-inspect-external-');
    const missing = join(external, 'missing.txt');
    await writeFile(sessionPath, lines([
        claude.owner(),
        claude.use('write', 'Write', {file_path: missing}), claude.result('write', 'ok'),
        claude.use('edit', 'Edit', {file_path: missing}), claude.result('edit', 'ok'),
        claude.use('read', 'Read', {file_path: missing}), claude.result('read', 'missing'),
    ]));
    const result = await inspect({fixtures, instance});
    assert.ok('flags' in result);
    assert.deepEqual(result.flags.map(({position, kind, match}) => [position, kind, match]), [
        [2, 'path', missing], [4, 'path', missing],
    ]);
});

test('Claude inspection allows reading its transcript directory and reports writes there', async t => {
    const {fixtures, instance, root, sessionPath} = await setup(t, []);
    const transcriptNeighbor = join(root, 'transcript.txt');
    await writeFile(transcriptNeighbor, 'transcript');
    await writeFile(sessionPath, lines([
        claude.owner(),
        claude.use('read', 'Read', {file_path: transcriptNeighbor}), claude.result('read', 'ok'),
        claude.use('write', 'Write', {file_path: transcriptNeighbor}), claude.result('write', 'ok'),
        claude.use('edit', 'Edit', {file_path: sessionPath}), claude.result('edit', 'ok'),
    ]));
    const result = await inspect({fixtures, instance});
    assert.ok('flags' in result);
    assert.deepEqual(result.flags.map(({position, kind, match}) => [position, kind, match]), [
        [4, 'path', transcriptNeighbor], [6, 'path', sessionPath],
    ]);
});

test('Claude inspection permits system directory reads but reports writes', async t => {
    const {fixtures, instance} = await setup(t, [
        claude.owner(),
        claude.use('read', 'Read', {file_path: '/etc/hosts'}), claude.result('read', 'ok'),
        claude.use('write', 'Write', {file_path: '/etc/hosts'}), claude.result('write', 'ok'),
    ]);
    const result = await inspect({fixtures, instance});
    assert.ok('flags' in result);
    assert.deepEqual(result.flags.map(({position, kind, match}) => [position, kind, match]), [[4, 'path', '/etc/hosts']]);
});
