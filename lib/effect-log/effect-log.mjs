import {access, appendFile, mkdir} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

import {CONFIG_FILE_NAME, CONFIG_SEED_FILE_NAME, loadConfig} from '../arw-common/config.mjs';
import {createNodeGitRunner} from '../common/git-process.mjs';

/** @typedef {(message: string) => void} Warn */
/** @typedef {{cwd?: string, programDirectory: string, warn?: Warn}} RecordOptions */
/** @typedef {Record<string, unknown> | (() => Promise<Record<string, unknown>>)} Fields */

// The two files `loadConfig` reads: a machine with neither (no installation, or no `config.json`) has the log off, not misconfigured.
const CONFIG_FILES = [CONFIG_FILE_NAME, CONFIG_SEED_FILE_NAME];

/** @type {Map<string, Promise<string | null>>} */
const directories = new Map();
/** @type {Set<string>} */
const warned = new Set();

/**
 * The repository directory name: the main worktree for a linked worktree, otherwise the worktree root,
 * and the `cwd` basename outside Git.
 * @param {string} cwd
 */
async function repositoryName(cwd) {
    const result = await createNodeGitRunner(cwd).run({
        argv: ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], cwd,
    });
    const lines = result.stdout.toString('utf8').split('\n');
    if (result.failure !== null || result.code !== 0 || lines.length < 3 || !lines[0]) return basename(cwd);
    const [toplevel, gitDirectory, commonDirectory] = lines;
    if (gitDirectory !== commonDirectory && basename(commonDirectory) === '.git') return basename(dirname(commonDirectory));
    return basename(toplevel);
}

/** @param {string} programDirectory @returns {Promise<string | null>} */
async function configuredDirectory(programDirectory) {
    try {
        return (await loadConfig(programDirectory)).effectLog?.directory ?? null;
    } catch {
        const present = await Promise.all(CONFIG_FILES.map(name => access(join(programDirectory, name)).then(() => true, () => false)));
        if (!present.includes(true)) return null;
        throw Object.assign(new Error('Effect log configuration is invalid.'), {code: 'invalid-config'});
    }
}

/**
 * Append one record to the opt-in Effect Log. Never rejects: a failure prints one warning per process and
 * leaves the caller's output and exit code unchanged. The log is never read back by the Engine.
 * @param {string} kind
 * @param {Fields} fields a function runs only when the log is enabled, so a disabled log does no extra work
 * @param {RecordOptions} options
 */
export async function record(kind, fields, {cwd, programDirectory, warn = message => process.stderr.write(`${message}\n`)}) {
    try {
        let configured = directories.get(programDirectory);
        if (configured === undefined) {
            configured = configuredDirectory(programDirectory);
            directories.set(programDirectory, configured);
        }
        const directory = await configured;
        if (directory === null) return;
        const seconds = Math.floor(Date.now() / 1000);
        const line = JSON.stringify({
            v: 1, ts: seconds, kind, ...cwd === undefined ? {} : {repository: await repositoryName(cwd)}, ...typeof fields === 'function' ? await fields() : fields,
        });
        const month = new Date(seconds * 1000).toISOString().slice(0, 7);
        await mkdir(directory, {recursive: true});
        await appendFile(join(directory, `effects-${month}.jsonl`), `${line}\n`, 'utf8');
    } catch (error) {
        if (warned.has(programDirectory)) return;
        warned.add(programDirectory);
        const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
        warn(`warning: effect log not written: ${code}`);
    }
}

/**
 * A `record` writer bound to one installation directory, for callers that pass it down as a plain function.
 * @param {string} programDirectory
 */
export const recorderFor = programDirectory => (/** @type {string} */ kind, /** @type {Record<string, unknown>} */ fields, /** @type {string} */ cwd) =>
    record(kind, fields, {cwd, programDirectory});

/** Drop the configuration read for `programDirectory`, so the next record reads it again (the installer rewrites it mid-run). @param {string} programDirectory */
export const forgetConfiguration = programDirectory => {
    directories.delete(programDirectory);
};
