#!/usr/bin/env node
// 把安装载荷打成发布压缩包: node scripts/pack-release.mjs <输出.tar.gz>
// 内容包括安装入口及依赖, 清单登记的载荷和生成的 Reviewer 能力套件出处.

import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, posix, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {loadInstallationPayload, SUPPORTED_PLATFORMS} from '../lib/installation/installation-payload.mjs';
import {CAPABILITY_ORIGIN} from '../lib/arw-common/reviewer-capability-resources.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const [output] = process.argv.slice(2);
if (output === undefined) {
    process.stderr.write('Usage: node scripts/pack-release.mjs <output.tar.gz>\n');
    process.exit(2);
}

// 三个平台的载荷验证路径并集 (清单, 配置种子, 启动器, 运行时文件和完整 Workflow Distribution).
const files = new Set(['install.mjs', 'package.json']);
let origin;
for (const platform of SUPPORTED_PLATFORMS) {
    const payload = await loadInstallationPayload({platform, sourceDirectory: ROOT});
    if (payload.status !== 'succeeded') throw new Error(payload.diagnostics.map(entry => entry.message).join(' '));
    for (const path of payload.verificationPaths) files.add(path);
    origin ??= payload.payload.find(entry => entry.path === CAPABILITY_ORIGIN);
}
const pending = ['install.mjs'];
for (const file of pending) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const [, specifier] of [...source.matchAll(/\b(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/gu), ...source.matchAll(/\bimport\s+['"](\.[^'"]+)['"]/gu)]) {
        const imported = posix.join(posix.dirname(file), specifier);
        files.add(imported);
        if (!pending.includes(imported)) pending.push(imported);
    }
}

const temp = await mkdtemp(join(tmpdir(), 'arw-release-'));
try {
    if (origin === undefined) throw new Error('Reviewer capability origin is required for a release.');
    const path = join(temp, CAPABILITY_ORIGIN);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, origin.bytes);
    files.delete(CAPABILITY_ORIGIN);
    const result = spawnSync('tar', ['-czf', resolve(output), '-C', ROOT, '-T', '-', '-C', temp, CAPABILITY_ORIGIN],
        {input: [...files].sort().join('\n') + '\n', stdio: ['pipe', 'inherit', 'inherit']});
    if (result.error !== undefined) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    await rm(temp, {recursive: true, force: true});
}
