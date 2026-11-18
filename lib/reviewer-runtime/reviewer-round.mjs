import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, posix} from 'node:path';

import {sha256} from '../common/json.mjs';
import {reviewerRecoveryPath} from './reviewer-session-record.mjs';

/** Tracked Agent instructions copied into every review round. @param {string} path */
export const isRuleFile = path => /(?:^|\/)AGENTS\.md$/u.test(path) || /^(?:docs\/agents|\.agents\/skills|\.claude\/skills)\//u.test(path);

/**
 * The text a Reviewer is given for `role`: the role file and `docs/agents/reviewer.md`, with the backticked `./` and `../` paths of each rewritten
 * to repository-relative ones, since inlined text is resolved from the Reviewer's working directory, not from the file it came from.
 * @param {string} role @param {(path: string) => string} text
 */
export const reviewerInstructions = (role, text) => [`docs/agents/roles/${role}.md`, 'docs/agents/reviewer.md']
    .map(path => text(path).replace(/`(\.{1,2}\/[^`\s]+)`/gu, (_whole, relative) => `\`${posix.join(posix.dirname(path), relative)}\``)).join('\n\n');

/** @typedef {{reportPath: string, roundDirectory: string}} PreviousRound */
/** @typedef {{role: string, issueIds: string[], reportPath: string, handoff: (previous: PreviousRound | null) => Promise<string> | string}} RoundReviewer */

/**
 * 写出一轮审核: `rules/` 规则副本与 `SHA256SUMS`, 每个 Reviewer 的空报告和一行 `<role>.jsonl` 机器请求.
 * `stateDirectory` 是轮目录的上级; 其中同一身份已有可用线程时生成 `followup_task`, 并把前轮报告交给 `handoff` 描述相邻版本变化.
 * @param {{repositoryRoot: string, roundDirectory: string, ruleFiles: Map<string, Buffer>, reviewers: RoundReviewer[]}} input
 */
export const prepareReviewerRound = async ({repositoryRoot, roundDirectory, ruleFiles, reviewers}) => {
    const rulesDirectory = join(roundDirectory, 'rules');
    for (const [path, bytes] of ruleFiles) {
        await mkdir(dirname(join(rulesDirectory, path)), {recursive: true});
        await writeFile(join(rulesDirectory, path), bytes);
    }
    await writeFile(join(rulesDirectory, 'SHA256SUMS'), [...ruleFiles].map(([path, bytes]) => `${sha256(bytes)}  ${path}\n`).join(''));
    const text = (/** @type {string} */ path) => {
        const bytes = ruleFiles.get(path);
        if (!bytes) throw new Error(`Review round requires the tracked Agent instruction ${path}.`);
        return bytes.toString('utf8');
    };
    const stateDirectory = dirname(roundDirectory);
    for (const {role, issueIds, reportPath, handoff} of reviewers) {
        const identity = {kind: /** @type {const} */ ('ordinary'), issueIds};
        /** @type {{runId: string, threadId: string | null, failure: unknown, reportPath: string} | null} */
        let record = null;
        try {
            record = JSON.parse(await readFile(reviewerRecoveryPath({stateDirectory, role, identity}), 'utf8'));
        } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        const usable = record !== null && record.threadId !== null && !record.failure ? record : null;
        const previous = usable ? {reportPath: usable.reportPath, roundDirectory: dirname(dirname(usable.reportPath))} : null;
        await mkdir(dirname(reportPath), {recursive: true});
        await writeFile(reportPath, '', {flag: 'wx'});
        const input = {
            ...(usable ? {runId: usable.runId} : {}),
            role,
            identity,
            instructions: reviewerInstructions(role, text),
            handoff: `${await handoff(previous)}\n\n执行规则副本: ${rulesDirectory} (保持仓库相对路径; 来源路径与 SHA-256 见 SHA256SUMS). 读取适用 Agent 指令时读这里的副本.\n报告: ${reportPath}`,
            cwd: repositoryRoot,
            writePaths: [dirname(reportPath)],
            reportPath,
            stateDirectory,
            ...(record !== null && !usable ? {newThread: true} : {}),
        };
        await writeFile(join(roundDirectory, `${role}.jsonl`), `${JSON.stringify({id: role, operation: usable ? 'followup_task' : 'spawn_agent', input})}\n`);
    }
};
