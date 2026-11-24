import {existsSync} from 'node:fs';
import {readFile, readdir, realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {resolveAbsolutePathWithinScope} from '../common/filesystem.mjs';
import {isJsonObject, parseJsonText} from '../common/json.mjs';
import {blocked, failed} from './results.mjs';
import {readOptional} from './scenario.mjs';

const FIXTURES = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'reviewer-capability');
const CODEX_TOOLS = ['exec', 'wait', 'exec_command', 'write_stdin', 'apply_patch', 'update_plan'];
const CLAUDE_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'StructuredOutput'];
const AGY_PATH_FIELDS = new Map([
    ['view_file', 'AbsolutePath'], ['list_dir', 'DirectoryPath'], ['find_by_name', 'SearchDirectory'],
    ['grep_search', 'SearchPath'], ['write_to_file', 'TargetFile'], ['replace_file_content', 'TargetFile'],
    ['multi_replace_file_content', 'TargetFile'], ['read_file', 'Path'], ['write_file', 'Path'],
]);
const AGY_WRITE_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'write_file'];
const AGY_TOOLS = ['run_command', ...AGY_PATH_FIELDS.keys()];
const SYSTEM_DIRECTORY = /^\/(usr|bin|sbin|lib\w*|etc|dev|proc|sys)(\/|$)/u;
const MIN_FINGERPRINT = 40;
const EXCERPT = 200;

/** @typedef {{position: number, record: any}} RecordLine */
/** @typedef {{position: number, tools: string[], texts: string[], cwd?: string, lone?: boolean, paths?: string[], writes?: boolean}} Call */
/** @typedef {{position: number, text: string}} RecordText */

const normalize = (/** @type {string} */ text) => text.toLowerCase().replace(/\s+/gu, ' ');
/** `path` up to its first glob character; a `[` with no closing `]` is no glob (a regex `/[&<>"]/` split by the shell word splitter). */
const withoutWildcard = (/** @type {string} */ path) => path.replace(/(?:[*?]|\[(?=.*\])).*$/u, '');
/** @type {(value: any) => string[]} */
const strings = value => (typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
/** Whether `path` lies inside `scope` (both absolute), by the common range judgement. */
const within = (/** @type {string} */ scope, /** @type {string} */ path) => resolveAbsolutePathWithinScope({path, scope}).status === 'succeeded';
/** `text` without the bodies of `cat > file <<TAG` heredocs that write a file (the Reviewer's own writing, like Claude's Write content); a heredoc some other command or a pipe consumes, or an unquoted one with command substitution, stays. */
const withoutWrittenBodies = (/** @type {string} */ text) => text.replace(/^((?:\S*sh\s+-\w+\s+(['"]?))?(?:cd\s+\S+\s*&&\s*)?cat(?=[^\n]*>)(?:\s+>>?\s*(?![&]|\/dev\/|\/proc\/)\S+)?\s*<<-?\s*(['"]?)(\w+)\3(?:\s*>>?\s*(?![&]|\/dev\/|\/proc\/)\S+)?[ \t]*)\n([\s\S]*?)\n[ \t]*\4['"]?[ \t]*$/gmu, (whole, header, wrapper, quote, _tag, body) => ((quote === '' || wrapper === '"') && /\$\(|`/u.test(body) ? whole : header));

/** The body of a `/regex/` literal of awk or grep: one segment between slashes with a regex-only character (`.` not followed by a word character, or one of `[]()+|^$\\?`), which no real path has. */
const REGEX_BODY = String.raw`\/[^/\s]*(?:\.(?!\w)|[\[\]()+|^$\\?])[^/\s]*\/`;
const REGEX_LITERAL = new RegExp(`^${REGEX_BODY}$`, 'u');
const MATCH_OPERATOR = new RegExp(String.raw`(?<=\$\w+\s*|\)\s*)!?~(?=[\s/"'])|!?~(?=\s+${REGEX_BODY}(?:[\s"'}]|$))`, 'gu');
/** `text` without awk match operators (`$0 ~ /x/`, `($0)~/x/`, `name ~ /a b/`, `$1 !~ "x"`): any lone `~` in a command segment (up to `;`, `|`, `&` outside quotes) that calls awk, and in any command one after `$variable` or `)` or before a regex literal; a `~` in `ls ~` or `ls ~ /etc` is still the home directory. */
const withoutMatchOperators = (/** @type {string} */ text) => text.replace(/(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|[^;|&\n'"])+/gu, segment => (/\bawk\b/u.test(segment) && !/\$\(|`/u.test(segment) ? segment.replace(/(?<=[\s)])!?~(?=\s)/gu, ' ') : segment)).replace(MATCH_OPERATOR, ' ');
/** `text` without the quoted pattern of a grep-family command (`grep`, `egrep`, `fgrep`, `rg`, `git grep`, after boolean flags or `-e`; an option that takes a file or value, like `-f`, `--file`, `--ignore-file`, `-g`, keeps its argument checked): a search pattern such as `"from '../"` or `"../../.*-service"` is not a path. A pattern with command substitution stays; the files after it are still checked. */
const withoutSearchPatterns = (/** @type {string} */ text) => text.replace(/(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|[^;|&\n'"])+/gu, segment => segment.replace(/^(\s*(?:(?:\S*\/)?(?:ba|z|da)?sh\s+-\w+\s+['"]?)?(?:git\s+)?(?:\S*\/)?(?:[ef]?grep|rg)(?:\s+(?:-e\s+|-[nEFiIrRHhlLcvwxsaPzoqU]+(?=\s)|--(?:cached|no-index|untracked|extended-regexp|fixed-strings|perl-regexp|ignore-case|line-number|recursive|count|word-regexp|files-with-matches)(?=\s)))*\s+)('[^']*'|"(?:\\[\s\S]|[^"\\])*")/u, (whole, head, pattern) => (/\$\(|`/u.test(pattern) ? whole : `${head} `)));
/** Whether `text` has a bare `/` operand after a command word, like `ls /`, `ls . /`, `ls "/"`, `bash -lc 'ls /'` or `"$(ls /)"`; quotes group a word, so a quoted pattern, a division or a prose separator is not the root directory.
 * @returns {boolean} */
const hasRootArgument = (/** @type {string} */ text) => [...text.matchAll(/(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|\\[\s\S]|[^\s;|&()'"\\])+|[;|&\n()]/gu)].reduce((/** @type {string[][]} */ segments, [token]) => {
    if (/^[;|&\n()]$/u.test(token)) segments.push([]);
    else segments.at(-1)?.push(token.replace(/'([^']*)'|"((?:\\[\s\S]|[^"\\])*)"|\\([\s\S])/gu, (_, single, double, escaped) => single ?? double ?? escaped));
    return segments;
}, [[]]).some(tokens => tokens.some((token, index) => index > 0 && (token === '/' || ((token.includes('$(') || (index === 2 && /^-l?c$/u.test(tokens[1]) && /(?:^|\/)\w*sh$/u.test(tokens[0]))) && hasRootArgument(token)))));

/**
 * Calls, tool outputs and unfinished calls of a native record. Each `position` is the line number in the record file.
 * Returns `blocked` when a completed run's record is incomplete or the record has an unexpected shape.
 * @param {string} fileText @param {string} threadId @param {string[]} roots @param {boolean} interrupted
 */
const readRecord = (fileText, threadId, roots, interrupted) => {
    /** @type {RecordLine[]} */
    const records = [];
    for (const [index, line] of fileText.split('\n').entries()) {
        if (line.trim() === '') continue;
        const parsed = parseJsonText(line);
        if (parsed.status !== 'succeeded' || !isJsonObject(parsed.value)) return blocked(`Record line ${index + 1} is not a JSON object.`);
        records.push({position: index + 1, record: parsed.value});
    }
    if (records[0]?.record.event !== undefined) return readAgyRecord(records, threadId, roots, interrupted);
    const [instance] = roots;
    /** @type {Call[]} */
    const calls = [];
    /** @type {RecordText[]} */
    const outputs = [];
    /** @type {Map<unknown, {position: number, text: string}>} */
    const open = new Map();
    const text = (/** @type {any} */ content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part?.text ?? '').join('\n') : '');
    const codex = records[0]?.record.type === 'session_meta';
    if (codex ? records[0].record.payload?.id !== threadId : !records.some(({record}) => record.sessionId === threadId) || records.some(({record}) => record.sessionId !== undefined && record.sessionId !== threadId)) return blocked('The record does not belong to the thread of agent.json.');
    let complete = !codex;
    let commands = 0;
    const execCalls = new Set();
    for (const {position, record} of records) {
        const payload = record.payload ?? {};
        if (codex) {
            if (record.type === 'event_msg' && payload.type === 'task_complete') complete = true;
            if (record.type === 'event_msg' && payload.item?.type === 'CommandExecution') {
                commands += 1;
                const {command, cwd} = payload.item;
                if (typeof cwd !== 'string' || !Array.isArray(command) || command.some((/** @type {any} */ part) => typeof part !== 'string')) return blocked(`Record line ${position} has a command execution entry of an unexpected shape.`);
                const directory = cwd.startsWith('file://') ? fileURLToPath(cwd) : cwd;
                calls.push({position, tools: [], texts: [command.join(' '), directory], cwd: directory, lone: directory === '/'});
            }
            if (record.type !== 'response_item') continue;
            if (['custom_tool_call', 'function_call'].includes(payload.type)) {
                open.set(payload.call_id, {position, text: String(payload.input ?? payload.arguments ?? '').slice(0, EXCERPT)});
                const nested = [...String(payload.input ?? '').matchAll(/\btools\.(\w+)/gu)].map(match => match[1]);
                if (payload.name === 'exec_command' || nested.includes('exec_command')) execCalls.add(payload.call_id);
                calls.push({position, tools: [payload.name, ...nested], texts: []});
            } else if (['custom_tool_call_output', 'function_call_output'].includes(payload.type)) {
                open.delete(payload.call_id);
                outputs.push({position, text: text(payload.output)});
            }
        } else if (record.isSidechain === true) {
            return blocked('The transcript has a sub-agent branch.');
        } else if (record.type === 'assistant' || record.type === 'user') {
            for (const block of /** @type {any[]} */ (Array.isArray(record.message?.content) ? record.message.content : [])) {
                if (!isJsonObject(block)) return blocked(`Record line ${position} has a content block of an unexpected shape.`);
                if (block.type === 'tool_use') {
                    const fields = Object.entries(block.input ?? {}).filter(([key]) => !['content', 'new_string', 'old_string'].includes(key));
                    const texts = strings(fields.map(([, value]) => value));
                    open.set(block.id, {position, text: texts.join(' ').slice(0, EXCERPT)});
                    calls.push({position, tools: [/** @type {string} */ (block.name)], texts, cwd: instance, lone: strings(fields.filter(([key]) => block.name !== 'Grep' || key !== 'pattern').map(([, value]) => value)).includes('/')});
                } else if (block.type === 'tool_result') {
                    open.delete(block.tool_use_id);
                    outputs.push({position, text: text(block.content)});
                }
            }
        }
    }
    if (!interrupted && open.size > 0) return blocked(`${open.size} tool call(s) have no output in the record.`);
    if (!interrupted && !complete) return blocked('The Codex record has no task_complete entry.');
    if (commands === 0 && [...execCalls].some(id => !open.has(id))) return blocked('The Codex record calls exec_command but holds no command execution entry.');
    return {calls, platform: codex ? 'codex' : 'claude', outputs, unfinished: [...open.values()]};
};

/** @param {RecordLine[]} records @param {string} threadId @param {string[]} roots @param {boolean} interrupted */
const readAgyRecord = ([{record: init}, ...records], threadId, roots, interrupted) => {
    const cwd = init.init?.cwd;
    if (init.event !== 'init' || !threadId || init.conversation_id !== threadId) return blocked('The agy init event does not match the thread of agent.json.');
    if (typeof cwd !== 'string' || !isAbsolute(cwd) || !roots.includes(resolve(cwd))) return blocked('The agy init working directory does not match the instance.');
    /** @type {Map<number, {position: number, name: string, call?: Call, done: boolean}>} */
    const steps = new Map();
    /** @type {RecordText[]} */
    const outputs = [];
    let complete = false;
    for (const [index, {position, record}] of records.entries()) {
        if (record.event === 'result') {
            const result = record.result;
            if (index !== records.length - 1 || result?.conversation_id !== threadId || typeof result.status !== 'string' || (!interrupted && result.status !== 'SUCCESS')) return blocked(`Record line ${position} has an invalid agy result.`);
            complete = true;
            continue;
        }
        const step = record.step_update;
        if (record.event !== 'step_update' || step?.conversation_id !== threadId || !Number.isSafeInteger(step.step_index) || step.step_index < 0 || !['ACTIVE', 'DONE', 'ERROR'].includes(step.state)) return blocked(`Record line ${position} has an invalid agy step update.`);
        if (step.subagent_info != null) return blocked(`Record line ${position} has an agy subagent step.`);
        const previous = steps.get(step.step_index);
        if (step.step_type !== 'tool') {
            if (previous || step.state === 'ERROR' || step.tool_info != null || step.tool_name != null || !['user_input', 'agent_response', 'checkpoint', 'system_message'].includes(step.step_type)) return blocked(`Record line ${position} has an invalid agy step type.`);
            continue;
        }
        const info = step.tool_info;
        const name = step.tool_name;
        if (typeof name !== 'string' || !name || previous?.done || (previous && previous.name !== name) || (info !== undefined && (!isJsonObject(info) || info.name !== name))) return blocked(`Record line ${position} has an invalid agy tool update.`);
        const start = previous?.position ?? position;
        const done = step.state !== 'ACTIVE';
        const parameters = info?.parameters;
        let call = previous?.call;
        if (parameters !== undefined) {
            if (!isJsonObject(parameters)) return blocked(`Record line ${position} has invalid agy tool parameters.`);
            const field = AGY_PATH_FIELDS.get(name);
            if (name === 'run_command') {
                const {CommandLine: command, Cwd: directory} = parameters;
                if (typeof command !== 'string' || !command.trim() || (directory !== undefined && (typeof directory !== 'string' || !directory.trim()))) return blocked(`Record line ${position} has an invalid agy command or working directory.`);
                const commandCwd = resolve(cwd, directory ?? '.');
                call = {position: start, tools: [name], texts: [command], cwd: commandCwd, paths: [commandCwd]};
            } else if (field !== undefined) {
                const path = parameters[field];
                if (typeof path !== 'string' || !path.trim()) return blocked(`Record line ${position} has no agy ${field} path.`);
                call = {position: start, tools: [name], texts: [], cwd, paths: [path], writes: AGY_WRITE_TOOLS.includes(name)};
            } else {
                call = {position: start, tools: [name], texts: strings(parameters), cwd};
            }
        }
        if (done) {
            if (parameters === undefined || (!Object.hasOwn(info, 'output') && typeof info.error?.message !== 'string' && !AGY_WRITE_TOOLS.includes(name)) || (step.state === 'ERROR' && typeof info.error?.message !== 'string')) return blocked(`Record line ${position} has an incomplete agy tool result.`);
            outputs.push({position, text: strings([info.output, info.error?.message]).join('\n')});
        }
        steps.set(step.step_index, {position: start, name, call, done});
    }
    if (!interrupted && !complete) return blocked('The agy record has no final result event.');
    /** @type {Call[]} */
    const calls = [];
    /** @type {RecordText[]} */
    const unfinished = [];
    for (const {position, call, done} of steps.values()) {
        if (!call || (!interrupted && !done)) return blocked(`Record line ${position} has an incomplete agy tool call.`);
        calls.push(call);
        if (!done) unfinished.push({position, text: [...call.texts, ...(call.paths ?? [])].join(' ').slice(0, EXCERPT)});
    }
    return {calls, platform: 'agy', outputs, unfinished};
};

/** Normalized answer-key texts of the scenarios in `fixtures` (raw and JSON-escaped), minus those the instance itself contains. */
const fingerprints = async (/** @type {string} */ fixtures, /** @type {string} */ instance, /** @type {string} */ excludedRecord = '') => {
    const found = new Set();
    const directories = async (/** @type {string} */ parent) => (await readdir(parent, {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => join(parent, entry.name));
    for (const role of await directories(fixtures)) {
        for (const scenario of await directories(role)) {
            const [brief = '', ...keys] = await Promise.all(['brief.md', 'expected.json', 'anchors.json'].map(name => readOptional(join(scenario, name))));
            const texts = brief.split('\n').map(line => line.trim()).filter(line => line.length >= MIN_FINGERPRINT);
            for (const json of keys) if (json !== undefined) texts.push(...strings(JSON.parse(json)).filter(value => value.length >= MIN_FINGERPRINT && /\s/u.test(value)));
            for (const value of texts) for (const form of [value, JSON.stringify(value).slice(1, -1)]) found.add(normalize(form));
        }
    }
    /** @type {string[]} */
    const own = [];
    const walk = async (/** @type {string} */ directory) => {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory() && !['.git', '.tmp'].includes(entry.name)) await walk(path);
            else if (entry.isFile() && entry.name !== 'agent.json' && path !== excludedRecord) own.push(normalize(await readFile(path, 'utf8')));
        }
    };
    await walk(instance);
    const haystack = own.join(' ');
    return [...found].filter(value => !haystack.includes(value));
};

/**
 * Inspects the Reviewer of a stopped capability instance; `interrupted` when agent.json has a null `completion`. `{status: "blocked", diagnostics}` when the record cannot prove what was read,
 * otherwise `{status: "succeeded", threadId, sessionPath, calls, flags, interrupted, unfinished}`; each flag is `{position, kind: path | tool | answer-key, text, match}`, each unfinished call `{position, text}`.
 * @param {{instance: string, fixtures?: string}} input
 */
export const inspect = async ({instance, fixtures = FIXTURES}) => {
    const root = resolve(instance);
    try {
        const listing = await readOptional(join(root, 'agent.json'));
        if (listing === undefined) return blocked(`agent.json is missing in ${root}.`);
        const parsed = parseJsonText(listing);
        if (parsed.status !== 'succeeded') return blocked(`agent.json: ${parsed.diagnostics[0].message}`);
        const result = parsed.value?.result;
        const members = result?.snapshot?.members;
        if (!isJsonObject(result) || typeof result.threadId !== 'string' || !Array.isArray(members)) return blocked('agent.json has no result with threadId and snapshot.members.');
        if (members.length !== 1 || !isJsonObject(members[0]) || typeof members[0].sessionPath !== 'string' || !isAbsolute(members[0].sessionPath)) return blocked('agent.json must list exactly one member with a sessionPath (a second member means a sub-agent took part).');
        const text = await readOptional(members[0].sessionPath);
        if (text === undefined) return blocked(`The native record is missing: ${members[0].sessionPath}.`);
        const interrupted = result.completion === null;
        const realRoot = await realpath(root);
        const roots = [...new Set([root, realRoot])];
        const record = readRecord(text, result.threadId, roots, interrupted);
        if ('diagnostics' in record) return record;
        const home = homedir();
        const allowed = record.platform === 'codex' ? CODEX_TOOLS : record.platform === 'claude' ? CLAUDE_TOOLS : AGY_TOOLS;
        const {sessionPath} = members[0];
        // The Reviewer's own native record is allowed reading: the file, and for Claude its per-instance transcript directory.
        const own = (/** @type {string} */ path) => path === sessionPath || (record.platform === 'claude' && within(dirname(sessionPath), path));
        /** @type {Array<{position: number, kind: string, text: string, match: string}>} */
        const flags = [];
        for (const {position, tools, texts, cwd, lone, paths = [], writes} of record.calls) {
            const excerpt = (texts.length + paths.length > 0 ? [...texts, ...paths].join(' ') : tools.join(' ')).slice(0, EXCERPT);
            for (const tool of tools.filter(name => !allowed.includes(name))) flags.push({position, kind: 'tool', text: excerpt, match: tool});
            /** @type {Set<string>} */
            const seen = new Set();
            const bodies = texts.map(withoutWrittenBodies);
            const words = bodies.map(withoutSearchPatterns).map(withoutMatchOperators).flatMap(item => item.split(/[\s"'`;|&(){}<>=,]+/u)).filter(word => word !== '/' && !REGEX_LITERAL.test(word) && (word.includes('/') || word === '..' || word.startsWith('~') || word.startsWith('$HOME')));
            if (lone || bodies.some(hasRootArgument)) words.push('/');
            const absolute = (/** @type {string} */ word) => resolve(cwd ?? root, word.replace(/^(~|\$HOME)(?=\/|$)/u, home));
            const structuredPaths = paths.map(word => {
                const prefix = withoutWildcard(word);
                return prefix !== word && !existsSync(absolute(word)) ? prefix : word;
            });
            for (const word of [...words.map(withoutWildcard), ...structuredPaths]) {
                if (word === '') continue;
                const path = absolute(word);
                if (seen.has(path)) continue;
                seen.add(path);
                const inside = roots.some(base => within(base, path));
                if (!inside && !own(path) && !SYSTEM_DIRECTORY.test(path) && (existsSync(path) || writes || roots.some(base => within(path, base)))) flags.push({position, kind: 'path', text: excerpt, match: path});
            }
        }
        /** @type {string[]} */
        let keys;
        const savedRecord = record.platform === 'agy' ? await realpath(sessionPath) : undefined;
        try { keys = await fingerprints(fixtures, savedRecord ? realRoot : root, savedRecord); } catch (error) { return failed('fixture-read', error); }
        for (const {position, text: output} of record.outputs) {
            const seen = normalize(output);
            const hit = keys.find(key => seen.includes(key));
            if (hit !== undefined) flags.push({position, kind: 'answer-key', text: output.slice(0, EXCERPT), match: hit.slice(0, EXCERPT)});
        }
        flags.sort((left, right) => left.position - right.position);
        return {calls: record.calls.length, diagnostics: [], flags, interrupted, sessionPath, status: 'succeeded', threadId: result.threadId, unfinished: record.unfinished};
    } catch (error) {
        return failed('report-read', error);
    }
};
