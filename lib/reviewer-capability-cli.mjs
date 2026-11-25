import {randomBytes} from 'node:crypto';
import {access, appendFile, lstat, mkdir, mkdtemp, readFile, rename, rm, truncate, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join, relative, resolve, sep} from 'node:path';
import {parseArgs} from 'node:util';

import {ARW_VERSION} from './arw-common/identity.mjs';
import {CAPABILITY_FIXTURES, CAPABILITY_ORIGIN, parseCapabilityOrigin, readCapabilityCheckoutOrigin} from './arw-common/reviewer-capability-resources.mjs';
import {createScopedFilesystem} from './common/filesystem.mjs';
import {digestJson} from './common/json.mjs';
import {setupScenario} from './reviewer-capability-setup.mjs';
import {fileDigest, packResults} from './reviewer-capability/bundle.mjs';
import {callCommand, invokeModel, loadModelConfig, readModelUsage} from './reviewer-capability/command.mjs';
import {scoreDeliveredReport} from './reviewer-capability/operations.mjs';

const ROOT = dirname(import.meta.dirname);
const SCENARIOS = {
    'commit-audit': 'requirements-reviewer',
    'code-spec': 'requirements-reviewer',
    'code-standards': 'code-standards-reviewer',
    'spec-readiness': 'spec-readiness-reviewer',
};
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._]*(?:-[A-Za-z0-9._]+)*$/u;
const LIMIT_SECONDS = 3600;
const ESTIMATED_SECONDS = 1800;
const ATTEMPTS_PER_CELL = 8;
const PROBE_TIMEOUT_MS = 300_000;
const VERSION_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 300_000;
const MODEL_OPTIONS = ['config', 'model', 'model-id', 'efforts', 'scenarios', 'n', 'work'];
const HELP = [
    'Usage:',
    '  arw reviewer-capability check|plan|run --config <json> --model <label> --efforts <list> --out <dir>',
    '    [--model-id <id>] [--scenarios <list>] [--n <count>] [--work <dir>]',
    '    check: [--call]',
    '    run: [--ack <reason>] [--limit-seconds <seconds>]',
    '  arw reviewer-capability pack --out <dir> [--bundle <tar.gz>]',
].join('\n');

/** @param {string[]} args @param {string} cwd */
const parseOptions = ([operation, ...args], cwd) => {
    if (!['check', 'plan', 'run', 'pack'].includes(operation)) throw new Error('Expected check, plan, run or pack.');
    const keys = operation === 'pack' ? ['out', 'bundle'] : ['out', ...MODEL_OPTIONS];
    if (operation === 'run') keys.push('ack', 'limit-seconds');
    /** @type {import('node:util').ParseArgsOptionsConfig} */
    const options = Object.fromEntries(keys.map(key => [key, {type: 'string'}]));
    if (operation === 'check') options.call = {type: 'boolean'};
    const {tokens, values: flags} = parseArgs({args, tokens: true, options});
    const names = tokens.flatMap(token => token.kind === 'option' ? [token.name] : []);
    if (new Set(names).size !== names.length) throw new Error('Options must not be repeated.');
    const value = (/** @type {string} */ name) => {
        const result = flags[name];
        if (typeof result !== 'string' || !result.trim()) throw new Error(`--${name} requires a non-empty value.`);
        return result;
    };
    const path = (/** @type {string} */ name) => resolve(cwd, value(name));
    const out = path('out');
    if (operation === 'pack') return {operation, out, bundle: flags.bundle === undefined ? undefined : path('bundle')};
    const model = value('model');
    const efforts = value('efforts').split(',');
    const scenarios = flags.scenarios === undefined ? Object.keys(SCENARIOS) : value('scenarios').split(',');
    if (!LABEL.test(model) || efforts.some(effort => !LABEL.test(effort)) || scenarios.some(name => !Object.hasOwn(SCENARIOS, name))) {
        throw new Error('Invalid model, effort or scenario name.');
    }
    if (new Set(efforts).size !== efforts.length || new Set(scenarios).size !== scenarios.length) throw new Error('List entries must not be repeated.');
    const integer = (/** @type {string} */ name, /** @type {number} */ fallback) => {
        if (flags[name] === undefined) return fallback;
        const input = value(name);
        const number = Number(input);
        if (!/^\d+$/u.test(input) || !Number.isSafeInteger(number) || number < 1) throw new Error(`--${name} requires a positive integer.`);
        return number;
    };
    const n = integer('n', 5);
    const limit = integer('limit-seconds', LIMIT_SECONDS);
    if (limit * 1000 > 2 ** 31 - 1) throw new Error('--limit-seconds exceeds the maximum process timeout.');
    const work = flags.work === undefined ? undefined : path('work');
    if (work !== undefined && (work === ROOT || work.startsWith(ROOT + sep))) throw new Error('--work must be outside the ARW checkout.');
    return {operation, out, config: path('config'), model, modelId: flags['model-id'] === undefined ? model : value('model-id'),
        efforts, scenarios, n, limit, work, call: flags.call === true,
        ack: flags.ack === undefined ? undefined : value('ack')};
};

/** @typedef {Extract<ReturnType<typeof parseOptions>, {model: string}>} ModelOptions */
/** @typedef {{cell: string, effort: string, scenario: string}} Task */
/** @typedef {{cell: string, outcome: string, reason: string}} Attempt */

/** @param {string} path */
const exists = path => access(path).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
});

/**
 * Whether command output or the report names the checkout's own path or a fixture path. The code-standards instance holds the checkout's AGENTS.md, whose test-data exception cites
 * the fixture glob, so a Reviewer that reads that file shows the glob; the standalone tokens (not followed or preceded by more path text) that the instance's own AGENTS.md contains are not a leak, every other fixture path still is.
 * @param {string[]} values @param {string} agentsText @param {string} root
 */
export const leaksOutsideInstance = (values, agentsText, root) => {
    const own = new Set(agentsText.match(/[^\s`"'()]*tests\/fixtures\/reviewer-capability[^\s`"'()]*/gu) ?? []);
    return values.some(value => value.includes(root + '/') || [...own].reduce((rest, token) => rest.replace(new RegExp(`(?<![^\\s\`"'()])${token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![^\\s\`"'()])`, 'gu'), ''), value).includes(CAPABILITY_FIXTURES));
};

/** @param {string} out @returns {Promise<{attempts: Attempt[], incompleteAt: number | null}>} */
const readAttempts = async out => {
    const data = await optionalRead(join(out, 'attempts.jsonl')) ?? Buffer.alloc(0);
    // Only the final line can be incomplete when a write is interrupted.
    const end = data.lastIndexOf(10) + 1;
    const attempts = data.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    return {attempts, incompleteAt: end < data.length ? end : null};
};

/** @param {Attempt[]} attempts @param {string} cell */
const countAttempts = (attempts, cell) => attempts.filter(row => row.cell === cell && row.outcome !== 'failed').length;

/** @param {ModelOptions} options @param {Attempt[]} attempts */
const pendingTasks = async ({out, model, efforts, scenarios, n}, attempts) => {
    const matrix = efforts.flatMap(effort => scenarios.map(scenario => ({effort, scenario})));
    /** @type {Task[]} */ const tasks = [];
    for (let round = 1; round <= n; round++) {
        for (const task of round % 2 === 1 ? matrix : matrix.toReversed()) {
            const cell = `${model}-${task.effort}-${task.scenario}-r${round}`;
            tasks.push({...task, cell});
        }
    }
    const finished = await Promise.all(tasks.map(({cell}) => exists(join(out, 'runs', cell, 'driver.json'))));
    return tasks.filter(({cell}, index) => !finished[index] && countAttempts(attempts, cell) < ATTEMPTS_PER_CELL);
};

/** @param {string} scenario */
const scenarioPath = scenario => join(ROOT, CAPABILITY_FIXTURES, SCENARIOS[/** @type {keyof typeof SCENARIOS} */ (scenario)], scenario);

/** @param {ModelOptions} options @param {Awaited<ReturnType<typeof loadModelConfig>>} config @param {string} work
 * @param {(line: string) => void} stdout */
const check = async (options, config, work, stdout) => {
    for (const scenario of options.scenarios) {
        const result = await setupScenario({scenario: scenarioPath(scenario), target: join(work, scenario, 'instance')});
        if (!('input' in result)) throw new Error(`setup ${scenario}: ${result.diagnostics.join(' ')}`);
        stdout(`setup ${scenario}: succeeded`);
    }
    if (!options.call) return 0;
    const cwd = join(work, 'probe');
    await mkdir(cwd);
    const call = await invokeModel(config, {...options, cwd, report: join(cwd, 'report.txt'), side: join(work, 'side'),
        prompt: 'Reply with the single word OK. Do not use any tool.\n', effort: options.efforts[0],
        scenario: options.scenarios[0], timeoutMs: PROBE_TIMEOUT_MS});
    if (call.interrupted) return 130;
    if (call.failure !== undefined) throw call.failure;
    if (call.timedOut || call.code !== 0) throw new Error(`Model probe failed: ${call.timedOut ? 'timeout' : call.code}. ${call.stderr.slice(-500)}`);
    stdout(`Model probe succeeded. ${call.stdout.trim().slice(-600)}`);
    return 0;
};

const isoNow = () => new Date().toISOString();
const jsonLine = (/** @type {unknown} */ value) => JSON.stringify(value) + '\n';

/** @param {string} path */
const optionalRead = path => readFile(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
});

/** @param {string} cwd @param {string} boundPath @param {boolean} timedOut */
const findReport = async (cwd, boundPath, timedOut) => {
    const opened = await createScopedFilesystem({root: cwd});
    if (opened.status !== 'succeeded') return null;
    const filesystem = opened.scopedFilesystem;
    const bound = await filesystem.read({path: relative(cwd, boundPath), rejectHardLinks: true});
    if (bound.status === 'succeeded' && bound.bytes.length > 0) return {path: boundPath, bytes: bound.bytes};
    if (!timedOut) return null;
    const listing = await filesystem.list({path: '.tmp', recursive: true});
    if (listing.status !== 'succeeded') return null;
    const alternatives = await Promise.all(listing.entries.filter(entry => entry.kind === 'file'
        && /^(?:report|draft)[A-Za-z0-9._-]*\.(?:txt|md|jsonl)$/u.test(basename(entry.path))).map(async entry => ({
        ...entry, modified: (await lstat(join(cwd, entry.path))).mtimeMs,
    })));
    for (const {path} of alternatives.sort((a, b) => b.modified - a.modified)) {
        const found = await filesystem.read({path, rejectHardLinks: true});
        if (found.status === 'succeeded' && found.bytes.length > 0) return {path, bytes: found.bytes};
    }
    return null;
};

/**
 * @param {ModelOptions} options @param {Task} task @param {string} work
 * @param {Awaited<ReturnType<typeof loadModelConfig>>} config
 * @param {{arw: import('./arw-common/reviewer-capability-resources.mjs').CapabilityOrigin, harnessVersion: string}} provenance
 */
const runAttempt = async (options, task, work, config, {arw, harnessVersion}) => {
    const id = 'i-' + randomBytes(6).toString('hex');
    const attempt = await mkdtemp(join(work, 'attempt-'));
    const cwd = join(attempt, id);
    const scenario = scenarioPath(task.scenario);
    const dest = join(options.out, 'runs', task.cell);
    try {
        const setup = await setupScenario({scenario, target: cwd});
        if (!('input' in setup)) return {outcome: 'failed', reason: `setup: ${setup.diagnostics.join(' ')}`};
        const {instructions, handoff, reportPath} = setup.input;
        const startedAt = isoNow();
        const call = await invokeModel(config, {...options, ...task, cwd, report: reportPath, side: join(attempt, 'side'),
            prompt: `${instructions}\n\n---\n\n${handoff}\nWrite the complete report to ${reportPath}.\n`, timeoutMs: options.limit * 1000});
        const completedAt = isoNow();
        const tokens = readModelUsage(call.stdout);
        const usage = {seconds: call.seconds, tokens: tokens.output, outputLimitExceeded: call.outputLimitExceeded};
        if (call.interrupted) return {outcome: 'interrupted', reason: '', usage};
        const diagnostic = {stdout: call.stdout.slice(-6000), stderr: call.stderr.slice(-2000)};
        if (call.failure !== undefined) return {outcome: 'failed', reason: call.failure.message, usage, diagnostic};

        const found = await findReport(cwd, reportPath, call.timedOut);
        const text = found?.bytes.toString('utf8') ?? '';
        const leaked = leaksOutsideInstance([call.stdout, call.stderr, text], await optionalRead(join(cwd, 'AGENTS.md')).then(bytes => bytes?.toString('utf8') ?? ''), ROOT);
        if (leaked || (found === null && !call.timedOut)) {
            return {outcome: 'void', reason: leaked ? 'inspect-flags' : 'no-completion', usage,
                diagnostic: {...diagnostic, report: text.slice(-6000), exitCode: call.code}};
        }

        const {timedOut} = call;
        const agent = join(attempt, 'agent.json');
        await writeFile(agent, jsonLine({status: 'succeeded', result: {runId: id, notifications: [],
            completion: found === null ? null : {reportPath: 'report'}, portable: true, exitCode: call.code}}));
        let report = null;
        let repairPath = null;
        let scored = {status: 'timeout', scores: {final: 0}, note: 'nothing delivered'};
        if (found !== null) {
            const source = join(attempt, 'report' + extname(found.path));
            await writeFile(source, found.bytes);
            const delivered = await scoreDeliveredReport({scenario, original: source, normalized: join(attempt, 'normalized' + extname(source)),
                agent, instance: id});
            if (delivered.result.status === 'succeeded') {
                scored = delivered.result;
                report = delivered.report;
                repairPath = delivered.repairPath;
            } else if (!timedOut) {
                return {outcome: 'failed', reason: `score: ${delivered.result.diagnostics.join(' ')}`, usage,
                    diagnostic: {...diagnostic, report: text.slice(-6000), exitCode: call.code}};
            }
        }

        const reason = timedOut ? `timeout: no result within ${options.limit} s (command stopped)` : '';
        const outcome = timedOut ? 'timeout' : 'valid';
        const name = report === null ? null : 'report' + extname(report);
        const run = {id, scenario: `${SCENARIOS[/** @type {keyof typeof SCENARIOS} */ (task.scenario)]}/${task.scenario}`, arw,
            runtime: {arwVersion: ARW_VERSION, matchesCheckout: !arw.treeDirty, portable: true}, startedAt, completedAt,
            settings: {model: options.modelId, modelProvider: config.provider, reasoningEffort: task.effort, serviceTier: 'default'},
            time: {durationSeconds: call.seconds, durationEstimated: true, wallClockSeconds: call.seconds, timeLimitSeconds: options.limit},
            tokens, validity: {valid: !timedOut, status: timedOut ? 'void' : 'valid', notes: reason},
            report: name, repair: repairPath === null ? null : 'repair.json'};

        /** @type {Record<string, Buffer>} */
        const files = {'run.json': Buffer.from(jsonLine(run)), 'score.json': Buffer.from(jsonLine(scored)), 'agent.json': await readFile(agent)};
        if ('candidates' in scored) files['candidates.json'] = Buffer.from(jsonLine(scored.candidates));
        if (report !== null && name !== null) files[name] = await readFile(report);
        if (repairPath !== null) files['repair.json'] = await readFile(repairPath);
        const hashes = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, fileDigest(data)]));
        const stage = await mkdtemp(join(options.out, '.arw-cell-'));
        try {
            await Promise.all(Object.entries(files).map(([name, data]) => writeFile(join(stage, name), data)));
            await writeFile(join(stage, 'driver.json'), jsonLine({id: task.cell, instanceId: id, exitCode: call.code, harness: config.provider,
                harnessVersion, outcome, reason, tool: 1, inspection: 'portable-scan', saved: isoNow(), files: hashes}));
            await mkdir(dirname(dest), {recursive: true});
            await rm(dest, {recursive: true, force: true});
            await rename(stage, dest);
        } finally {
            await rm(stage, {recursive: true, force: true});
        }
        return {outcome, reason, usage};
    } finally {
        await rm(attempt, {recursive: true, force: true});
    }
};

/**
 * @param {ModelOptions} options @param {Awaited<ReturnType<typeof loadModelConfig>>} config @param {Task[]} tasks
 * @param {Awaited<ReturnType<typeof readAttempts>>} attemptLog @param {string} work @param {string} cwd @param {(line: string) => void} stdout
 */
const run = async (options, config, tasks, {attempts, incompleteAt}, work, cwd, stdout) => {
    const {out, model, modelId, efforts, scenarios, n, limit, ack} = options;
    let arw = await readCapabilityCheckoutOrigin(ROOT);
    if (arw === null) {
        const origin = await optionalRead(join(ROOT, CAPABILITY_ORIGIN));
        if (origin === null) throw new Error('Reviewer capability origin is unavailable. Install ARW from a release or Git checkout.');
        arw = parseCapabilityOrigin(origin);
    }
    const state = join(out, 'run-state.json');
    const binding = digestJson({arw, arwVersion: ARW_VERSION, config, model, modelId, efforts, scenarios, n, limit});
    const previous = await optionalRead(state);
    if (previous !== null && previous.toString('utf8') !== binding + '\n') throw new Error('ARW origin, model configuration or matrix differs from this output directory.');
    if (previous === null && (attempts.length || await exists(join(out, 'runs')))) throw new Error('Existing results have no run configuration binding.');

    const marker = join(out, 'STOPPED.json');
    const stopped = await optionalRead(marker);
    if (stopped !== null) {
        if (ack === undefined) {
            stdout('A usage stop is active. Review STOPPED.json and resume with --ack <reason>.');
            return 75;
        }
        await appendFile(join(out, 'acks.log'), jsonLine({at: isoNow(), ack, previous: JSON.parse(stopped.toString('utf8'))}));
        await unlink(marker);
    }
    const stop = join(out, 'STOP');
    if (await exists(stop)) {
        stdout('STOP file found. Remove it to resume.');
        return 0;
    }
    if (tasks.length === 0) return 0;
    let harnessVersion = '';
    if (config.versionCommand !== undefined) {
        const version = await callCommand(config.versionCommand, {cwd, timeoutMs: VERSION_TIMEOUT_MS});
        if (version.interrupted) return 130;
        if (version.failure !== undefined) throw version.failure;
        if (version.timedOut || version.code !== 0) throw new Error(`Model version command failed: ${version.timedOut ? 'timeout' : version.code}.`);
        harnessVersion = version.stdout.split(/\r?\n/u, 1)[0].trim();
    }
    await mkdir(out, {recursive: true});
    const versionFile = join(out, 'harness-version.json');
    const oldVersion = await optionalRead(versionFile);
    if (oldVersion !== null && oldVersion.toString('utf8') !== jsonLine(harnessVersion)) throw new Error('CLI version differs from this output directory.');
    if (previous === null) await writeFile(state, binding + '\n');
    if (oldVersion === null) await writeFile(versionFile, jsonLine(harnessVersion));
    const log = join(out, 'attempts.jsonl');
    if (incompleteAt !== null) await truncate(log, incompleteAt);

    const expected = tasks.length;
    let calls = 0;
    let seconds = 0;
    for (const task of tasks) {
        if (await exists(stop)) {
            stdout('STOP file found. Remove it to resume.');
            return 0;
        }
        const result = await runAttempt(options, task, work, config, {arw, harnessVersion});
        const {outcome, reason, usage, diagnostic} = result;
        if (outcome === 'interrupted') return 130;
        if (usage !== undefined) {
            calls++;
            seconds += usage.seconds;
        }
        const row = {cell: task.cell, outcome, reason, at: isoNow(), usage, diagnostic};
        await appendFile(log, jsonLine(row));
        attempts.push(row);
        stdout(`${task.cell}: ${outcome}${reason ? ` (${reason})` : ''}`);
        let guard = '';
        if (usage?.outputLimitExceeded) guard = 'one call exceeded the command output byte limit';
        else if (usage?.tokens != null && usage.tokens > MAX_OUTPUT_TOKENS) guard = `one call produced ${usage.tokens} output tokens`;
        else if (calls > expected * 2) guard = `${calls} model calls`;
        else if (seconds > expected * ESTIMATED_SECONDS * 2) guard = `${seconds.toFixed(1)} seconds of model time`;
        if (guard) {
            await writeFile(marker, jsonLine({reason: guard, calls, seconds, expected, at: isoNow()}));
            stdout(`Usage stop: ${guard}.`);
            return 75;
        }
        if (outcome === 'void' || outcome === 'failed') {
            const threshold = outcome === 'failed' || reason === 'no-completion' ? 3 : 2;
            if (attempts.length >= threshold && attempts.slice(-threshold)
                .every(row => row.outcome === outcome && (outcome === 'failed' || row.reason === reason))) return 3;
            if (outcome === 'void' && countAttempts(attempts, task.cell) < ATTEMPTS_PER_CELL) tasks.push(task);
        }
    }
    return 0;
};

/** @param {string[]} args @param {{cwd: string, stdout: (line: string) => void, stderr: (line: string) => void}} context */
export const runReviewerCapability = async (args, {cwd, stdout, stderr}) => {
    if (args.length === 1 && ['-h', '--help'].includes(args[0])) {
        stdout(HELP);
        return 0;
    }
    let options;
    try { options = parseOptions(args, cwd); } catch (error) {
        stderr(`${error instanceof Error ? error.message : error}\n${HELP}`);
        return 2;
    }
    try {
        if (options.config === undefined) {
            stdout(await packResults(options.out, options.bundle));
            return 0;
        }
        const config = await loadModelConfig(options.config);
        const log = options.operation === 'check' ? {attempts: [], incompleteAt: null} : await readAttempts(options.out);
        const tasks = options.operation === 'check' ? [] : await pendingTasks(options, log.attempts);
        if (options.operation !== 'check') {
            stdout(`Expected ${tasks.length} model calls and approximately ${tasks.length * ESTIMATED_SECONDS} seconds of model time.`);
        }
        if (options.operation !== 'plan') {
            if (process.platform === 'win32') throw new Error('Reviewer capability needs POSIX process groups. Run ARW in WSL.');
            if (options.work !== undefined) await mkdir(options.work, {recursive: true});
            const work = await mkdtemp(join(options.work ?? tmpdir(), 'arw-capability-'));
            try { return options.operation === 'check' ? await check(options, config, work, stdout)
                : await run(options, config, tasks, log, work, cwd, stdout); }
            finally { await rm(work, {recursive: true, force: true}); }
        }
        for (const {cell} of tasks) stdout(cell);
        return 0;
    } catch (error) {
        stderr(error instanceof Error ? error.message : String(error));
        return 1;
    }
};
