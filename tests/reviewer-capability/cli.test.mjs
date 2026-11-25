import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, appendFile, readFile, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {runArw} from '../../arw.mjs';
import {leaksOutsideInstance} from '../../lib/reviewer-capability-cli.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {installFakeCommand, runExitedProcess, runProcess} from '../helpers/process.mjs';

test('Reviewer capability plan lists standalone work without invoking the configured commands', async t => {
    const cwd = await createTemporaryDirectory(t, 'arw-capability-plan-');
    const called = join(cwd, 'called');
    const command = [process.execPath, '-e', 'require("node:fs").writeFileSync(process.argv[1], "called")', called];
    await writeFile(join(cwd, 'model.json'), JSON.stringify({command, version_command: command}));
    /** @type {string[]} */ const output = [];
    /** @type {string[]} */ const errors = [];
    const code = await runArw(['reviewer-capability', 'plan', '--config', 'model.json', '--model', 'fake',
        '--efforts', 'high', '--n', '1', '--out', 'results'], {cwd, stdout: line => output.push(line), stderr: line => errors.push(line)});
    assert.equal(code, 0, errors.join('\n'));
    assert.match(output.join('\n'), /4 model calls/u);
    await assert.rejects(access(called), {code: 'ENOENT'});
    await assert.rejects(access(join(cwd, 'results')), {code: 'ENOENT'});
});

test('Reviewer capability run persists usage stops and resumes only unfinished instances', {skip: process.platform === 'win32'}, async t => {
    // Multiple real Git scenarios and fake provider processes verify the resume boundary.
    const cwd = await createTemporaryDirectory(t, 'arw-capability-run-cli-');
    const calls = join(cwd, 'calls');
    const mode = join(cwd, 'mode');
    await writeFile(join(cwd, 'fake.mjs'), [
        "import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';",
        'const {CALLS, MODE, RB_REPORT_PATH, RB_SCENARIO} = process.env;',
        "if (!readFileSync(0, 'utf8').includes(RB_REPORT_PATH)) process.exit(91);",
        "appendFileSync(CALLS, RB_SCENARIO + '\\n');",
        "writeFileSync(RB_REPORT_PATH, 'No problems.');",
        "console.log(JSON.stringify({usage: {input_tokens: 30, cache_read_tokens: 12, output_tokens: Number(readFileSync(MODE, 'utf8'))}}));",
    ].join('\n'));
    const config = {command: [process.execPath, join(cwd, 'fake.mjs')], env: {CALLS: calls, MODE: mode}, provider: 'fake'};
    await writeFile(join(cwd, 'model.json'), JSON.stringify(config));
    await writeFile(mode, '300001');
    const args = ['reviewer-capability', 'run', '--config', 'model.json', '--model', 'fake', '--efforts', 'high',
        '--scenarios', 'code-spec,spec-readiness', '--n', '1', '--out', 'results'];
    /** @type {string[]} */ const messages = [];
    const collect = (/** @type {string} */ line) => messages.push(line);
    const run = (/** @type {string[]} */ extra = []) => runArw([...args, ...extra], {cwd, stdout: collect, stderr: collect});
    const stopped = await run();
    const out = join(cwd, 'results');
    assert.equal(stopped, 75, messages.join('\n') + '\n' + await readFile(join(out, 'attempts.jsonl'), 'utf8'));
    assert.match(await readFile(join(out, 'STOPPED.json'), 'utf8'), /300001/u);
    assert.equal(await run(), 75);
    await writeFile(mode, '8');
    await writeFile(join(out, 'STOP'), '');
    assert.equal(await run(['--ack', 'checked fake usage']), 0);
    assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n'), ['code-spec']);
    await unlink(join(out, 'STOP'));
    await appendFile(join(out, 'attempts.jsonl'), '{"cell":');
    assert.equal(await run(), 0);
    assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n'), ['code-spec', 'spec-readiness']);
    const runPath = join(out, 'runs', 'fake-high-spec-readiness-r1', 'run.json');
    const record = JSON.parse(await readFile(runPath, 'utf8'));
    assert.match(record.id, /^i-[0-9a-f]{12}$/u);
    assert.deepEqual(record.tokens, {uncachedInput: 18, cachedInput: 12, output: 8});
    assert.equal(record.validity.valid, true);

    const pack = () => runArw(['reviewer-capability', 'pack', '--out', 'results', '--bundle', 'result.tar.gz'],
        {cwd, stdout: collect, stderr: collect});
    assert.equal(await pack(), 0, messages.join('\n'));
    const archive = join(cwd, 'result.tar.gz');
    const tar = async (/** @type {string[]} */ args) => {
        const result = await runProcess('tar', args, {cwd});
        assert.equal(result.status, 'exited');
        assert.equal(result.exitCode, 0, result.stderr);
        return result.stdout;
    };
    const manifest = JSON.parse(await tar(['-xOzf', archive, 'manifest.json']));
    assert.equal(manifest.schema, 1);
    assert.deepEqual(manifest.arw, record.arw);
    assert.deepEqual(manifest.harness, {provider: 'fake', version: ''});
    assert.deepEqual(manifest.cells.map((/** @type {{dir: string}} */ cell) => cell.dir), ['fake-high-code-spec-r1', 'fake-high-spec-readiness-r1']);
    const members = (await tar(['-tzf', archive])).trim().split('\n');
    const expected = ['manifest.json'];
    for (const {dir, files} of manifest.cells) {
        assert.deepEqual(Object.keys(files).sort(), ['agent.json', 'candidates.json', 'driver.json', 'report.txt', 'run.json', 'score.json']);
        for (const [file, digest] of Object.entries(files)) {
            const name = `runs/${dir}/${file}`;
            expected.push(name);
            const bytes = await tar(['-xOzf', archive, name]);
            assert.deepEqual(digest, {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes)});
        }
    }
    assert.deepEqual(members.sort(), expected.sort());
    const original = await readFile(archive);
    const driverPath = join(out, 'runs', 'fake-high-spec-readiness-r1', 'driver.json');
    const driverBytes = await readFile(driverPath);
    const runBytes = await readFile(runPath);
    await writeFile(runPath, '{}');
    assert.equal(await pack(), 1);
    assert.deepEqual(await readFile(archive), original);
    const driver = JSON.parse(driverBytes.toString('utf8'));
    for (const kind of ['origin', 'version']) {
        const mixed = kind === 'origin' ? JSON.stringify({...record, arw: {...record.arw, treeDirty: !record.arw.treeDirty}}) : runBytes;
        await writeFile(runPath, mixed);
        await writeFile(driverPath, JSON.stringify({...driver, harnessVersion: kind === 'version' ? 'fake 2' : driver.harnessVersion,
            files: {...driver.files, 'run.json': {sha256: createHash('sha256').update(mixed).digest('hex'), bytes: Buffer.byteLength(mixed)}}}));
        assert.equal(await pack(), 1);
        assert.match(messages.at(-1) ?? '', /Mixed result provenance/u);
    }
    await writeFile(runPath, runBytes);
    await writeFile(driverPath, driverBytes);
    await installFakeCommand(t, cwd, 'tar', 'printf partial > "$2"\nexit 77\n');
    for (const target of ['result.tar.gz', 'missing.tar.gz']) {
        const code = await runArw(['reviewer-capability', 'pack', '--out', out, '--bundle', target], {cwd, stdout: collect, stderr: collect});
        assert.equal(code, 1);
        assert.match(messages.at(-1) ?? '', /tar failed \(77\)/u);
    }
    assert.deepEqual(await readFile(archive), original);
    await assert.rejects(access(join(cwd, 'missing.tar.gz')), {code: 'ENOENT'});

    await writeFile(join(cwd, 'model.json'), JSON.stringify({...config, provider: 'different'}));
    assert.equal(await run(), 1);
});

test('Reviewer capability handles missing reports, path leaks and usable reports from timeouts', {skip: process.platform === 'win32'}, async t => {
    // A real timeout exercises process-group cleanup, and separate Git instances exercise the retry thresholds.
    const cwd = await createTemporaryDirectory(t, 'arw-capability-outcomes-');
    const fake = join(cwd, 'fake.mjs');
    await writeFile(fake, [
        "import {writeFileSync} from 'node:fs';",
        "import {dirname, join} from 'node:path';",
        'const {RB_REPORT_PATH, MODE} = process.env;',
        "if (MODE === 'missing') process.exit(0);",
        "if (MODE === 'leak') { writeFileSync(RB_REPORT_PATH, 'tests/fixtures/reviewer-capability/expected.json'); process.exit(0); }",
        "if (MODE === 'delivered') writeFileSync(join(dirname(RB_REPORT_PATH), 'draft.txt'), 'No problems.');",
        'setInterval(() => {}, 20);',
    ].join('\n'));
    // The four modes use separate configs and output folders, so they run concurrently.
    await Promise.all([['missing', 3, 3], ['leak', 3, 2], ['timed-out', 0, 1], ['delivered', 0, 1]].map(async ([mode, expected, count]) => {
        const name = String(mode);
        await writeFile(join(cwd, `${name}.json`), JSON.stringify({command: [process.execPath, fake, '{prompt_file}'], env: {MODE: name}}));
        const result = await runArw(['reviewer-capability', 'run', '--config', `${name}.json`, '--model', 'fake', '--efforts', 'high',
            '--n', name === 'missing' ? '2' : '1', '--scenarios', 'code-spec', '--out', name, '--limit-seconds', '1'],
        {cwd, stdout: () => {}, stderr: assert.fail});
        assert.equal(result, expected, name);
        const logs = (await readFile(join(cwd, name, 'attempts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        assert.equal(logs.length, count, name);
        const folder = join(cwd, name, 'runs', 'fake-high-code-spec-r1');
        if (expected === 0) {
            assert.equal(logs[0].outcome, 'timeout');
            const record = JSON.parse(await readFile(join(folder, 'run.json'), 'utf8'));
            assert.equal(record.validity.valid, false);
            assert.equal(record.report, name === 'delivered' ? 'report.txt' : null);
            const score = JSON.parse(await readFile(join(folder, 'score.json'), 'utf8'));
            assert.equal(score.status, name === 'delivered' ? 'succeeded' : 'timeout');
            if (name === 'timed-out') assert.equal(score.scores.final, 0);
        } else {
            assert.equal(logs.at(-1).reason, name === 'leak' ? 'inspect-flags' : 'no-completion');
            await assert.rejects(access(folder), {code: 'ENOENT'});
        }
    }));
});

test('Reviewer capability stops oversized output without token data and exits 130 on interruption', {skip: process.platform === 'win32'}, async t => {
    // The byte limit and signal handling require actual child processes and isolated Git scenarios.
    const cwd = await createTemporaryDirectory(t, 'arw-capability-usage-fallback-');
    const config = join(cwd, 'model.json');
    const args = ['reviewer-capability', 'run', '--config', config, '--model', 'fake', '--efforts', 'high',
        '--n', '1', '--scenarios', 'code-spec', '--out'];
    await writeFile(config, JSON.stringify({command: [process.execPath, '-e', 'process.stdout.write(Buffer.alloc(16_000_001, 120));']}));
    const run = () => runArw([...args, 'large'], {cwd, stdout: () => {}, stderr: assert.fail});
    assert.equal(await run(), 75);
    assert.match(await readFile(join(cwd, 'large', 'STOPPED.json'), 'utf8'), /command output byte limit/u);
    const attempt = JSON.parse(await readFile(join(cwd, 'large', 'attempts.jsonl'), 'utf8'));
    assert.equal(attempt.usage.tokens, null);
    assert.equal(await run(), 75);
    assert.equal(await readFile(join(cwd, 'large', 'attempts.jsonl'), 'utf8').then(text => text.trim().split('\n').length), 1);
    await assert.rejects(access(join(cwd, 'large', 'runs')), {code: 'ENOENT'});

    await writeFile(config, JSON.stringify({command: [process.execPath, '-e', 'process.kill(process.ppid, "SIGTERM"); setInterval(() => {}, 20);']}));
    const request = fileURLToPath(new URL('../../arw.mjs', import.meta.url));
    const interrupted = await runExitedProcess(process.execPath, [request, ...args, 'interrupted'], {cwd, timeout: 10_000});
    assert.equal(interrupted.exitCode, 130);
    await assert.rejects(access(join(cwd, 'interrupted', 'runs')), {code: 'ENOENT'});
});

test('Reviewer capability check builds the selected scenario and probes only when asked', {skip: process.platform === 'win32'}, async t => {
    // Real Git setup and an independent fake CLI exercise the shipped process boundary.
    const cwd = await createTemporaryDirectory(t, 'arw-capability-check-');
    const called = join(cwd, 'called');
    await writeFile(join(cwd, 'probe.mjs'), 'import {readFileSync, writeFileSync} from "node:fs";\n'
        + 'writeFileSync(process.env.CALLED, JSON.stringify([process.argv.slice(2), readFileSync(process.env.RB_PROMPT_FILE, "utf8"), JSON.parse(readFileSync(process.argv[3], "utf8"))]));');
    const command = [process.execPath, join(cwd, 'probe.mjs'), '{model_id}', '{file.settings.json}', '{effort}', '{scenario}'];
    await writeFile(join(cwd, 'model.json'), JSON.stringify({command, env: {CALLED: called}, files: {'settings.json': {report: '{report_dir}'}}}));
    const args = ['reviewer-capability', 'check', '--config', 'model.json', '--model', 'fake', '--model-id', 'fake/id',
        '--scenarios', 'code-spec', '--efforts', 'medium', '--out', 'results'];
    assert.equal(await runArw(args, {cwd, stdout: () => {}, stderr: assert.fail}), 0);
    await assert.rejects(access(called), {code: 'ENOENT'});
    assert.equal(await runArw([...args, '--call'], {cwd, stdout: () => {}, stderr: assert.fail}), 0);
    const [argv, prompt, settings] = JSON.parse(await readFile(called, 'utf8'));
    assert.deepEqual([argv[0], ...argv.slice(2)], ['fake/id', 'medium', 'code-spec']);
    assert.match(prompt, /single word OK/u);
    assert.ok(settings.report.startsWith(tmpdir()));
    await assert.rejects(access(join(cwd, 'results')), {code: 'ENOENT'});
});

test('Reviewer capability rejects a work directory inside the ARW checkout', async t => {
    const cwd = await createTemporaryDirectory(t, 'arw-capability-work-');
    await writeFile(join(cwd, 'model.json'), JSON.stringify({command: ['x'], version_command: ['x']}));
    /** @type {string[]} */ const errors = [];
    const code = await runArw(['reviewer-capability', 'plan', '--config', 'model.json', '--model', 'fake', '--efforts', 'high',
        '--out', 'results', '--work', fileURLToPath(new URL('../../lib', import.meta.url))], {cwd, stdout: () => {}, stderr: line => errors.push(line)});
    assert.equal(code, 2);
    assert.match(errors.join('\n'), /outside the ARW checkout/u);
});

test('the fixture path check ignores the glob the instance own AGENTS.md cites, and still flags every other fixture path or host path', async () => {
    // Replays the code-standards voids of the 2026-11-25 Gemini run: a Reviewer printed the checkout AGENTS.md copy, whose line 107 names the fixture glob.
    const agents = await readFile(new URL('../../AGENTS.md', import.meta.url), 'utf8');
    const line = agents.split('\n').find(entry => entry.includes('tests/fixtures/reviewer-capability')) ?? '';
    assert.ok(line);
    const stream = JSON.stringify({event: 'step_update', step_update: {step_type: 'tool', tool_info: {output: `107: ${line}\r\n`}}});
    const root = '/host/arw';
    assert.equal(leaksOutsideInstance([stream, '', line], agents, root), false);
    assert.equal(leaksOutsideInstance([stream], '', root), true, 'an instance without that text still flags it');
    assert.equal(leaksOutsideInstance([stream + ' tests/fixtures/reviewer-capability/code-standards-reviewer/x/expected.json'], agents, root), true);
    assert.equal(leaksOutsideInstance([stream + ' tests/fixtures/reviewer-capability'], agents, root), true);
    assert.equal(leaksOutsideInstance([stream + ' `tests/fixtures/reviewer-capability/**/expected.json`'], agents, root), true, 'the glob as a prefix of a longer path');
    assert.equal(leaksOutsideInstance([stream + ' x/tests/fixtures/reviewer-capability/**'], agents, root), true);
    assert.equal(leaksOutsideInstance([stream + ' /host/arw/AGENTS.md'], agents, root), true);
});
