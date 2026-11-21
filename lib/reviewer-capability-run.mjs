// Connects scenario setup and scoring to the installed background-agent machine entry.
import {spawn} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';

import {INSTALLATION_MANIFEST_FILE, parseInstallationManifest} from './arw-common/installation-manifest.mjs';
import {INSTALLATION_DIRECTORY_NAME} from './arw-common/product-identity.mjs';
import {CAPABILITY_ORIGIN, readCapabilityCheckoutOrigin} from './arw-common/reviewer-capability-resources.mjs';
import {setupScenario} from './reviewer-capability-setup.mjs';
import {inspect} from './reviewer-capability/inspection.mjs';
import {scoreDeliveredReport} from './reviewer-capability/operations.mjs';
import {blocked, failed} from './reviewer-capability/results.mjs';

const ROOT = dirname(import.meta.dirname);
const LIMIT_MS = 3600000;
const INTERRUPT_RESERVE_MS = 10000;

/** @param {{scenario: string, target: string, settings: Record<string, unknown>}} input
 * @returns {Promise<any>}
 */
export const runInstance = async ({scenario, target, settings}) => {
    const installation = join(homedir(), INSTALLATION_DIRECTORY_NAME);
    let manifest;
    let arw;
    let runtime;
    try {
        let bytes;
        try { bytes = await readFile(join(installation, INSTALLATION_MANIFEST_FILE)); } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return blocked('ARW is not installed.');
            throw error;
        }
        manifest = parseInstallationManifest({bytes, expectedPathKind: undefined, installationDirectory: installation});
        arw = await readCapabilityCheckoutOrigin(ROOT, false);
        if (arw === null) return blocked('Reviewer capability run requires the ARW Git checkout.');
        const matches = await Promise.all(manifest.managedFiles.filter(path => path !== CAPABILITY_ORIGIN).map(async path => {
            const [installed, checkout] = await Promise.all([readFile(join(installation, path)), readFile(join(ROOT, path))]);
            return installed.equals(checkout);
        }));
        runtime = {arwVersion: manifest.arwVersion, matchesCheckout: matches.every(Boolean)};
    } catch (error) { return failed('provenance-read', error); }
    if (!runtime.matchesCheckout) process.stderr.write('Installed ARW files differ from the checkout; runtime.matchesCheckout is false.\n');
    const setup = /** @type {any} */ (await setupScenario({scenario, target}));
    if (setup.status !== 'succeeded') return setup;
    const directory = resolve(target);
    const id = basename(directory);
    const agentPath = join(directory, 'agent.json');
    const save = (/** @type {string} */ name, /** @type {unknown} */ value) => writeFile(join(directory, name), `${JSON.stringify(value)}\n`);
    const child = spawn(process.execPath, [join(installation, 'arw.mjs'), 'background-agent'], {stdio: ['pipe', 'pipe', 'pipe']});
    const lines = createInterface({input: child.stdout});
    const replies = lines[Symbol.asyncIterator]();
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    /** @type {Error | undefined} */
    let processError;
    child.on('error', error => { processError = error; });
    child.stdin.on('error', error => { processError = error; });
    const exited = new Promise(resolveExit => child.once('close', resolveExit));
    let sequence = 0;
    let runId = '';
    /** @param {string} operation @param {Record<string, unknown>} input */
    const request = async (operation, input, allowRejection = false) => {
        const requestId = String(++sequence);
        child.stdin.write(`${JSON.stringify({id: requestId, operation, input})}\n`);
        const next = await replies.next();
        if (next.done) throw processError ?? new Error(`Machine entry exited early: ${stderr}`);
        const response = JSON.parse(next.value);
        if (response.id !== requestId) throw new Error('Unexpected machine response id.');
        if (!response.ok) {
            if (allowRejection) return {interruptError: response.error.code};
            throw new Error(`${response.error.code}: ${response.error.message}`);
        }
        return response.result;
    };
    let listing;
    let reason = '';
    try {
        const spawned = await request('spawn_agent', {...setup.input, settings});
        runId = spawned.runId;
        const deadline = Date.now() + LIMIT_MS;
        let observed = await request('list_agents', {runId});
        let turnId;
        const continued = new Set();
        for (;;) {
            turnId = observed.turnId ?? turnId;
            if (observed.completion != null) break;
            if (observed.state === 'exited') { reason = 'no-completion'; break; }
            const remaining = deadline - Date.now();
            if (remaining < INTERRUPT_RESERVE_MS) {
                reason = 'timeout';
                if (turnId) {
                    const interrupted = await request('interrupt_agent', {runId, turnId}, true);
                    if (interrupted.interruptError) reason += `: ${interrupted.interruptError}`;
                }
                break;
            }
            for (const notice of observed.notifications ?? []) {
                if (notice.type === 'message' && notice.source === 'provider-program'
                    && typeof notice.text === 'string' && notice.text.startsWith('The Reviewer runtime paused this same task after ')
                    && !continued.has(notice.messageId)) {
                    await request('send_message', {runId, message: '继续'});
                    continued.add(notice.messageId);
                }
            }
            observed = await request('wait_agent', {runId, cursor: observed.cursor, timeout_ms: Math.min(remaining, LIMIT_MS)});
        }
        listing = await request('list_agents', {runId});
        try { await save('agent.json', {status: 'succeeded', result: listing}); } catch (error) { return failed('instance-write', error); }
    } catch (error) {
        return failed('agent-control', new Error(`runId=${runId || 'unknown'}: ${error instanceof Error ? error.message : error}`));
    } finally {
        child.stdin.end();
        await exited;
        lines.close();
    }
    let report = null;
    let repairPath = null;
    if (reason === '') {
        const inspected = /** @type {any} */ (await inspect({instance: directory}));
        if (inspected.status === 'failed') return inspected;
        if (inspected.status === 'blocked') reason = 'inspect-blocked';
        else if (inspected.flags.length > 0) reason = `inspect-flags: ${inspected.flags.length} (${inspected.flags[0].kind})`;
    }
    if (reason === '') {
        const original = listing.completion.reportPath;
        const delivered = await scoreDeliveredReport({scenario, original, normalized: join(directory, `report.repaired${extname(original)}`),
            agent: agentPath, instance: id});
        const scored = delivered.result;
        if (scored.status !== 'succeeded') return scored;
        report = delivered.report;
        repairPath = delivered.repairPath;
        try {
            await save('score.json', scored);
            await save('candidates.json', scored.candidates);
        } catch (error) { return failed('instance-write', error); }
    }
    const measurement = listing.measurement;
    const usage = measurement?.usage;
    const iso = (/** @type {number | null | undefined} */ value) => value == null ? null : new Date(value).toISOString();
    const seconds = (/** @type {number | null | undefined} */ value) => value == null ? null : value / 1000;
    const record = {id, scenario: `${basename(dirname(resolve(scenario)))}/${basename(resolve(scenario))}`, arw, runtime, settings,
        startedAt: iso(measurement?.startedAt), completedAt: iso(measurement?.finishedAt),
        time: {durationSeconds: seconds(measurement?.workDuration?.durationMs), durationEstimated: measurement?.workDuration?.estimated ?? null,
            wallClockSeconds: seconds(measurement?.wallClockMs), timeLimitSeconds: LIMIT_MS / 1000},
        tokens: {uncachedInput: usage?.inputTokens == null || usage?.cachedInputTokens == null ? null : usage.inputTokens - usage.cachedInputTokens,
            cachedInput: usage?.cachedInputTokens ?? null, output: usage?.outputTokens ?? null},
        validity: {valid: reason === '', status: reason === '' ? 'valid' : 'void', notes: reason}, report, repair: repairPath};
    try { await save('run.json', record); } catch (error) { return failed('instance-write', error); }
    return {status: 'succeeded', record};
};
