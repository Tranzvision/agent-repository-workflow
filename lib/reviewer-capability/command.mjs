import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

import {isJsonObject, parseJsonText} from '../common/json.mjs';

const PLACEHOLDER = /\{([a-z_]+(?:\.[A-Za-z0-9_.-]+)?)\}/gu;
const VARIABLES = ['prompt', 'prompt_file', 'cwd', 'report_path', 'report_dir', 'model', 'model_id', 'effort', 'scenario'];

/** @param {unknown} value @returns {value is string[]} */
const isCommand = value => Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0
    && value.every(part => typeof part === 'string' && !part.includes('\0'));

/** @param {string} path */
export const loadModelConfig = async path => {
    const parsed = parseJsonText(await readFile(path));
    if (parsed.status !== 'succeeded' || !isJsonObject(parsed.value)) throw new Error('Model configuration must be a JSON object.');
    const {command, provider = 'cli', version_command: versionCommand, files = {}, env = {}} = parsed.value;
    if (!isCommand(command) || (versionCommand !== undefined && !isCommand(versionCommand))) {
        throw new Error('command and optional version_command must be non-empty argument arrays.');
    }
    if (typeof provider !== 'string' || !provider.trim()) throw new Error('provider must be a non-empty string.');
    if (!isJsonObject(files) || Object.keys(files).some(name => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name))) {
        throw new Error('files must map plain file names to templates.');
    }
    if (!isJsonObject(env) || Object.entries(env).some(([name, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)
        || typeof value !== 'string' || value.includes('\0'))) throw new Error('env must map environment names to strings.');
    const known = new Set([...VARIABLES, ...Object.keys(files).map(name => `file.${name}`)]);
    render([command, files, env], template => {
        for (const [, name] of template.matchAll(PLACEHOLDER)) {
            if (!known.has(name)) throw new Error(`Unknown placeholder {${name}} in the model configuration.`);
        }
        return template;
    });
    return {command, provider, ...(versionCommand === undefined ? {} : {versionCommand}), files, env: /** @type {Record<string, string>} */ (env)};
};

const KILL_GRACE_MS = 1_000;
const MAX_OUTPUT_BYTES = 16_000_000;

/**
 * @param {string[]} command
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, prompt?: string, timeoutMs: number}} options
 */
export const callCommand = (command, {cwd, env = process.env, prompt, timeoutMs}) => {
    const child = spawn(command[0], command.slice(1), {cwd, env, detached: true});
    const started = performance.now();
    let timedOut = false;
    let interrupted = false;
    /** @type {NodeJS.Timeout | undefined} */ let escalation;
    /** @type {Error | undefined} */ let failure;
    /** @param {NodeJS.Signals} signal */
    const kill = signal => {
        if (child.pid === undefined) return;
        try { process.kill(-child.pid, signal); } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') failure = /** @type {Error} */ (error);
        }
    };
    const stop = () => {
        if (escalation !== undefined) return;
        kill('SIGTERM');
        escalation = setTimeout(() => {
            kill('SIGKILL');
            child.stdout.destroy();
            child.stderr.destroy();
        }, KILL_GRACE_MS);
    };
    const interrupt = () => {
        interrupted = true;
        stop();
    };
    let size = 0;
    /** @param {import('node:stream').Readable} stream */
    const capture = stream => {
        /** @type {Buffer[]} */ const chunks = [];
        stream.on('data', (/** @type {Buffer} */ chunk) => {
            size += chunk.length;
            if (size <= MAX_OUTPUT_BYTES) chunks.push(chunk);
            else if (failure === undefined) {
                failure = new Error('Model command output exceeded 16 MB.');
                stop();
            }
        });
        return chunks;
    };
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    const timer = setTimeout(() => {
        timedOut = true;
        stop();
    }, timeoutMs);
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    child.on('error', error => { failure = error; });
    // A background grandchild can keep the pipes open after the model exits; settle shortly after `exit`.
    /** @type {NodeJS.Timeout | undefined} */ let drain;
    child.once('exit', () => {
        clearTimeout(timer);
        drain = setTimeout(() => {
            kill('SIGKILL');
            child.stdout.destroy();
            child.stderr.destroy();
        }, KILL_GRACE_MS);
    });
    child.stdin.on('error', error => {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EPIPE') failure = error;
    });
    child.stdin.end(prompt);
    return new Promise(/** @param {(value: {code: number | null, stdout: string, stderr: string, seconds: number, timedOut: boolean, interrupted: boolean, outputLimitExceeded: boolean, failure?: Error}) => void} resolve */ resolve => {
        child.once('close', code => {
            if (escalation !== undefined) kill('SIGKILL');
            clearTimeout(escalation);
            clearTimeout(drain);
            clearTimeout(timer);
            process.off('SIGINT', interrupt);
            process.off('SIGTERM', interrupt);
            resolve({code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
                seconds: (performance.now() - started) / 1000, timedOut, interrupted, outputLimitExceeded: size > MAX_OUTPUT_BYTES, failure});
        });
    });
};

/** @param {unknown} template @param {(text: string) => string} replace @returns {unknown} */
const render = (template, replace) => {
    if (typeof template === 'string') return replace(template);
    if (Array.isArray(template)) return template.map(value => render(value, replace));
    if (isJsonObject(template)) return Object.fromEntries(Object.entries(template).map(([name, value]) => [name, render(value, replace)]));
    return template;
};

/**
 * @param {Awaited<ReturnType<typeof loadModelConfig>>} config
 * @param {{cwd: string, report: string, side: string, prompt: string, model: string, modelId: string, effort: string, scenario: string, timeoutMs: number}} input
 */
export const invokeModel = async (config, {cwd, report, side, prompt, model, modelId, effort, scenario, timeoutMs}) => {
    const promptPath = join(side, 'prompt.md');
    /** @type {Record<string, string>} */
    const variables = {
        cwd, effort, model, model_id: modelId, prompt, prompt_file: promptPath, scenario, report_path: report, report_dir: dirname(report),
        ...Object.fromEntries(Object.keys(config.files).map(name => ['file.' + name, join(side, 'files', name)])),
    };
    const replace = (/** @type {string} */ text) => text.replace(PLACEHOLDER, (_, name) => variables[name]);
    await mkdir(join(side, 'files'), {recursive: true});
    await writeFile(promptPath, prompt);
    await Promise.all(Object.entries(config.files).map(([name, template]) => {
        const value = render(template, replace);
        return writeFile(variables['file.' + name], typeof value === 'string' ? value : JSON.stringify(value) + '\n');
    }));
    const env = {...process.env, ...Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, replace(value)])),
        RB_REPORT_PATH: report, RB_CWD: cwd, RB_PROMPT_FILE: promptPath, RB_MODEL: model, RB_EFFORT: effort, RB_SCENARIO: scenario};
    const onStdin = !config.command.some(part => part.includes('{prompt}') || part.includes('{prompt_file}'));
    return callCommand(config.command.map(replace), {cwd, env, prompt: onStdin ? prompt : undefined, timeoutMs});
};

/** @param {string} stdout */
export const readModelUsage = stdout => {
    const parsed = parseJsonText(stdout);
    const usage = parsed.status === 'succeeded' && isJsonObject(parsed.value) && isJsonObject(parsed.value.usage) ? parsed.value.usage : {};
    const number = (/** @type {string} */ key) => {
        const value = usage[key];
        return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
    };
    const input = number('input_tokens');
    const cachedInput = number('cache_read_tokens');
    return {uncachedInput: input === null || cachedInput === null ? null : Math.max(0, input - cachedInput),
        cachedInput, output: number('output_tokens')};
};
