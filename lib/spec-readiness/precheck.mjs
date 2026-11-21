import {findUnfencedLineIndexes} from '../arw-common/issue-documents.mjs';
import {createScopedFilesystem} from '../common/filesystem.mjs';
import {countLines} from '../common/text-policy.mjs';

const LINE_REFERENCE = /((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z]+):(\d+)(?:-(\d+))?/gu;
const PATH_SPAN = /`((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z]+)`/gu;

/**
 * Spec Readiness `prepare` 的机械预检: 只返回供 Main Agent 启动 Reviewer 前自查的警告, 不阻断.
 * @param {{repositoryRoot: string, subject: {content: string, filePath: string}, texts: {filePath: string, content: string}[]}} input
 * @returns {Promise<string[]>}
 */
export const precheckSpecReadiness = async ({repositoryRoot, subject, texts}) => {
    const created = await createScopedFilesystem({root: repositoryRoot});
    if (created.status !== 'succeeded') throw new Error('The Repository filesystem could not be opened.');
    const {scopedFilesystem} = created;
    const mayExist = async (/** @type {string} */ path) => {
        // 仓库不支持符号链接, 经链接的路径无法判定, 按存在处理, 与行数检查跳过非成功结果一致; 以普通文件为父级的路径一定不存在.
        const inspected = await scopedFilesystem.inspect({path});
        if (inspected.status === 'succeeded') return inspected.entry.kind !== 'missing';
        return inspected.diagnostics[0].code !== 'filesystem-parent-invalid';
    };
    /** @type {string[]} */
    const warnings = [];
    for (const {filePath, content} of [subject, ...texts]) {
        const lines = content.split('\n');
        const prose = findUnfencedLineIndexes(lines, () => true).map(index => lines[index]);
        for (const textLine of prose) {
            for (const [reference, path, first, last] of textLine.matchAll(LINE_REFERENCE)) {
                const read = await scopedFilesystem.readText({allowLossyDecoding: true, path});
                if (read.status === 'succeeded' && Math.max(Number(first), Number(last ?? first)) > countLines(read.text)) {
                    warnings.push(`warning: ${filePath}: ${reference} 超出该文件的行数.`);
                }
            }
        }
        for (const textLine of prose.filter(line => !/新建|新增|创建/u.test(line))) {
            for (const [, path] of textLine.matchAll(PATH_SPAN)) {
                if (!await mayExist(path) && await mayExist(path.split('/')[0])) warnings.push(`warning: ${filePath}: ${path} 不存在.`);
            }
        }
    }
    const contentLines = subject.content.split('\n');
    const [criteriaStart] = findUnfencedLineIndexes(contentLines, line => line === '## Acceptance criteria');
    const criteriaEnd = criteriaStart === undefined ? -1 : findUnfencedLineIndexes(contentLines, line => line.startsWith('## '), criteriaStart + 1)[0] ?? contentLines.length;
    const criteria = criteriaStart === undefined ? '' : contentLines.slice(criteriaStart + 1, criteriaEnd).join('\n');
    for (const item of criteria.split(/^(?=- \[[ xX]\])/mu).filter(part => part.startsWith('- ['))) {
        if (/Commit Audit|提交号|提交本身|提交后|已提交|推送|(审核|审查|Spec Readiness|Code Standards|Reviewer)\s*(结果为|已|全部)?\s*(通过|无问题)/u.test(item)) warnings.push(`warning: ${subject.filePath}: 验收项以提交后的事实或其他审核的结果为条件, 应移入预期验证: ${item.split('\n')[0].slice(0, 40)}`);
        if (!/观察|`/u.test(item)) warnings.push(`warning: ${subject.filePath}: 验收项没有观察方式: ${item.split('\n')[0].slice(0, 40)}`);
    }
    return warnings;
};
