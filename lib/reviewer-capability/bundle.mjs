import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';

import {isCapabilityOrigin} from '../arw-common/reviewer-capability-resources.mjs';
import {createScopedFilesystem} from '../common/filesystem.mjs';
import {digestJson, isJsonObject, parseJsonText, sha256} from '../common/json.mjs';

const CELL = /^[A-Za-z0-9][A-Za-z0-9._]*(?:-[A-Za-z0-9._]+)*-r[1-9][0-9]*$/u;
const SCENARIO = /^(?:requirements-reviewer\/(?:commit-audit|code-spec)|code-standards-reviewer\/code-standards|spec-readiness-reviewer\/spec-readiness)$/u;
const REPORT = /^report\.(?:txt|md|jsonl)$/u;
const REQUIRED = ['agent.json', 'driver.json', 'run.json', 'score.json'];
const OPTIONAL = ['candidates.json', 'repair.json'];

/** @param {Buffer} bytes */
export const fileDigest = bytes => ({sha256: sha256(bytes), bytes: bytes.length});

/** @param {Buffer} bytes @param {string} path */
const readObject = (bytes, path) => {
    const parsed = parseJsonText(bytes);
    if (parsed.status !== 'succeeded' || !isJsonObject(parsed.value)) throw new Error(`Invalid result file: ${path}.`);
    return parsed.value;
};

/** @param {string} out @param {string | undefined} bundle */
export const packResults = async (out, bundle) => {
    const created = new Date().toISOString();
    const destination = bundle ?? resolve(out, 'bundle-' + created.replace(/[.:-]/gu, '').replace('T', '-').replace('Z', '') + '.tar.gz');
    const opened = await createScopedFilesystem({root: out});
    if (opened.status !== 'succeeded') throw new Error(`Cannot open results directory: ${out}.`);
    const scope = opened.scopedFilesystem;
    const runs = await scope.list({path: 'runs'});
    if (runs.status !== 'succeeded') throw new Error(`No readable runs directory under ${out}.`);

    const stage = await mkdtemp(join(dirname(destination), '.arw-bundle-'));
    try {
        /** @type {Array<{dir: string, files: Record<string, ReturnType<typeof fileDigest>>}>} */ const cells = [];
        const ids = new Set();
        const members = ['manifest.json'];
        let origin;
        for (const entry of runs.entries) {
            if (entry.kind !== 'directory') throw new Error(`Unexpected results entry: ${entry.path}.`);
            const folder = entry.path;
            const driverPath = folder + '/driver.json';
            const driverEntry = await scope.inspect({path: driverPath});
            if (driverEntry.status === 'succeeded' && driverEntry.entry.kind === 'missing') continue;
            const dir = basename(folder);
            const listing = await scope.list({path: folder});
            if (!CELL.test(dir) || listing.status !== 'succeeded') throw new Error(`Invalid instance directory: ${folder}.`);
            const names = listing.entries.map(file => basename(file.path));
            const reports = names.filter(name => REPORT.test(name));
            if (reports.length > 1 || REQUIRED.some(name => !names.includes(name))
                || names.some(name => !REQUIRED.includes(name) && !OPTIONAL.includes(name) && !REPORT.test(name))) {
                throw new Error(`Unexpected result files in ${folder}.`);
            }
            const inputs = await Promise.all(names.map(async name => {
                const path = folder + '/' + name;
                const read = await scope.read({path, rejectHardLinks: true});
                if (read.status !== 'succeeded') throw new Error(`Cannot read regular result file: ${path}.`);
                return [name, read.bytes];
            }));
            /** @type {Record<string, Buffer>} */ const bytes = Object.fromEntries(inputs);
            const driver = readObject(bytes['driver.json'], driverPath);
            const run = readObject(bytes['run.json'], folder + '/run.json');
            const files = Object.fromEntries(names.map(name => [name, fileDigest(bytes[name])]));
            const {'driver.json': driverHash, ...finishedHashes} = files;
            if (!isJsonObject(driver.files) || digestJson(driver.files) !== digestJson(finishedHashes)) {
                throw new Error(`Result files changed after completion: ${folder}.`);
            }
            if (typeof run.id !== 'string' || !/^i-[a-f0-9]{12}$/u.test(run.id) || ids.has(run.id) || driver.id !== dir
                || driver.instanceId !== run.id || driver.tool !== 1 || driver.inspection !== 'portable-scan'
                || !['valid', 'timeout'].includes(String(driver.outcome))
                || typeof run.scenario !== 'string' || !SCENARIO.test(run.scenario) || !dir.replace(/-r[0-9]+$/u, '').endsWith('-' + basename(run.scenario))
                || run.report !== (reports[0] ?? null) || run.repair !== (names.includes('repair.json') ? 'repair.json' : null)
                || !isCapabilityOrigin(run.arw) || !isJsonObject(run.runtime) || typeof run.runtime.arwVersion !== 'string'
                || !isJsonObject(run.settings) || typeof run.settings.modelProvider !== 'string'
                || driver.harness !== run.settings.modelProvider || typeof driver.harnessVersion !== 'string') {
                throw new Error(`Invalid instance record: ${folder}.`);
            }
            ids.add(run.id);
            const provenance = {arw: run.arw, arwVersion: run.runtime.arwVersion,
                harness: {provider: run.settings.modelProvider, version: driver.harnessVersion}};
            if (origin !== undefined && digestJson(origin) !== digestJson(provenance)) throw new Error(`Mixed result provenance: ${folder}.`);
            origin = provenance;
            const target = join(stage, folder);
            await mkdir(target, {recursive: true});
            await Promise.all(names.map(name => writeFile(join(target, name), bytes[name])));
            members.push(...names.map(name => folder + '/' + name));
            cells.push({dir, files});
        }
        if (origin === undefined) throw new Error(`No finished instances under ${out}.`);
        await writeFile(join(stage, 'manifest.json'), JSON.stringify({schema: 1, tool: 1, created, ...origin, cells}) + '\n');
        const archive = join(stage, 'result.tar.gz');
        const result = spawnSync('tar', ['-czf', archive, '-C', stage, '-T', '-'], {input: members.join('\n') + '\n', encoding: 'utf8'});
        if (result.error !== undefined) throw result.error;
        if (result.status !== 0) throw new Error(`tar failed (${result.status ?? result.signal}). ${result.stderr.trim()}`);
        await rename(archive, destination);
        return destination;
    } finally {
        await rm(stage, {recursive: true, force: true});
    }
};
