import {sep} from 'node:path';

import {CAPABILITY_FIXTURES, CAPABILITY_INSTRUCTIONS, CAPABILITY_ORIGIN, parseCapabilityOrigin, readCapabilityCheckoutOrigin} from '../arw-common/reviewer-capability-resources.mjs';
import {diagnosticMessages} from '../common/diagnostics.mjs';
import {assertExactKeys, serializeCanonicalJson} from '../common/canonical-contract.mjs';
import {
    createScopedFilesystem,
    joinRelativePath,
    resolveRelativePathWithinScope,
} from '../common/filesystem.mjs';
import {compareText, parseJsonText} from '../common/json.mjs';
import {buildWorkflowDistribution} from '../workflow-distribution/workflow-distribution.mjs';

const RELEASE_MANIFEST_FILE = 'release-manifest.json';
const RESERVED_INSTALLATION_TARGETS = new Set(['config.json', 'manifest.json']);
const RUNTIME_RESOURCES = new Set(['AGENTS.md', 'LICENSE.txt', 'arw.mjs', 'uninstall.mjs', ...CAPABILITY_INSTRUCTIONS]);
const CAPABILITY_DIRECTORIES = new Set([CAPABILITY_FIXTURES, 'docs/agents/roles']);
const ROOT_LAUNCHERS = new Set(['arw', 'arw.cmd']);
/** @typedef {'darwin' | 'linux' | 'win32'} InstallationPlatform */
/**
 * @typedef {object} ReleaseManifest
 * @property {string} configSeed
 * @property {string} distributionRoot
 * @property {Record<InstallationPlatform, string[]>} launchers
 * @property {string[]} runtimeFiles
 */
/** @type {readonly InstallationPlatform[]} */
export const SUPPORTED_PLATFORMS = ['darwin', 'linux', 'win32'];

class PayloadBlockedError extends Error {}

/** @param {string} code @param {string} message @param {string} [path] */
const diagnostic = (code, message, path = undefined) => ({
    code,
    message,
    ...(path === undefined ? {} : {path}),
});

/** @param {string} code @param {string} message @param {string} [path] */
const blocked = (code, message, path = undefined) => ({
    diagnostics: [diagnostic(code, message, path)],
    status: /** @type {'blocked'} */ ('blocked'),
});

/** @param {string} stage @param {unknown} error @param {string} [path] */
const failed = (stage, error, path = undefined) => ({
    diagnostics: [diagnostic('installation-payload-io-failed', error instanceof Error ? error.message : String(error), path)],
    stage,
    status: /** @type {'failed'} */ ('failed'),
});

/** @param {unknown} value @param {string} label @param {string} scope */
const sourcePath = (value, label, scope) => {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} must be a non-empty path.`);
    }
    let logicalPath;
    let resolved;
    try {
        logicalPath = joinRelativePath(value);
        resolved = resolveRelativePathWithinScope({path: logicalPath, scope});
    } catch {
        throw new Error(`${label} must be a source-relative path.`);
    }
    if (resolved.status !== 'succeeded' || resolved.relativePath.length === 0) {
        throw new Error(`${label} must remain inside the Installation source.`);
    }
    return resolved.relativePath.split(sep).join('/');
};

/** @param {unknown} values @param {string} label @param {string} scope */
function sortedUniquePaths(values, label, scope) {
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`${label} must be a non-empty path list.`);
    }
    const normalized = values.map((value, index) => sourcePath(value, `${label}[${index}]`, scope));
    const sorted = [...new Set(normalized)].sort(compareText);
    if (sorted.length !== normalized.length || normalized.some((value, index) => value !== sorted[index])) {
        throw new Error(`${label} must be sorted and unique.`);
    }
    return normalized;
}

/** @param {unknown} manifest @param {string} sourceDirectory @returns {ReleaseManifest} */
function validateReleaseManifest(manifest, sourceDirectory) {
    assertExactKeys(manifest, [
        'configSeed',
        'distributionRoot',
        'launchers',
        'runtimeFiles',
    ], 'Release manifest');
    const configSeed = sourcePath(manifest.configSeed, 'configSeed', sourceDirectory);
    const distributionRoot = sourcePath(manifest.distributionRoot, 'distributionRoot', sourceDirectory);
    const runtimeFiles = sortedUniquePaths(manifest.runtimeFiles, 'runtimeFiles', sourceDirectory);
    for (const path of runtimeFiles) {
        if (!RUNTIME_RESOURCES.has(path) && !CAPABILITY_DIRECTORIES.has(path) && !path.startsWith('lib/')) {
            throw new Error(`runtimeFiles contains a source-only path: ${path}.`);
        }
    }
    assertExactKeys(manifest.launchers, SUPPORTED_PLATFORMS, 'launchers');
    const launcherPaths = [];
    /** @type {Record<InstallationPlatform, string[]>} */
    const launchers = /** @type {Record<InstallationPlatform, string[]>} */ ({});
    for (const platform of SUPPORTED_PLATFORMS) {
        launchers[platform] = sortedUniquePaths(manifest.launchers[platform], `launchers.${platform}`, sourceDirectory);
        for (const path of launchers[platform]) {
            if (!ROOT_LAUNCHERS.has(path)) {
                throw new Error(`launchers.${platform} contains a source-only path: ${path}.`);
            }
            launcherPaths.push(path);
        }
    }
    const ordinaryPaths = [
        ...runtimeFiles,
        ...launcherPaths,
    ];
    if (ordinaryPaths.includes(configSeed)) {
        throw new Error('configSeed cannot also be an ordinary Installation payload path.');
    }
    return {configSeed, distributionRoot, launchers, runtimeFiles};
}

/** @param {import('../common/filesystem.mjs').ScopedFilesystem} filesystem @param {string} path */
const readSourceBytes = async (filesystem, path) => {
    const result = await filesystem.read({path});
    if (result.status === 'blocked') {
        throw new PayloadBlockedError(`Installation source is not an allowed regular file: ${path}.`);
    }
    if (result.status === 'failed') throw new Error(diagnosticMessages(result.diagnostics));
    return result.bytes;
};

/** @param {import('../common/filesystem.mjs').ScopedFilesystem} filesystem @param {string} path @returns {Promise<unknown>} */
const readCanonicalJson = async (filesystem, path) => {
    const bytes = await readSourceBytes(filesystem, path);
    const parsed = parseJsonText(bytes);
    if (parsed.status !== 'succeeded') {
        throw new Error(`${path} is not valid JSON.`);
    }
    if (!bytes.equals(Buffer.from(serializeCanonicalJson(parsed.value)))) {
        throw new Error(`${path} is not canonical JSON.`);
    }
    return parsed.value;
};

/** @param {import('../common/filesystem.mjs').ScopedFilesystem} filesystem @param {string} path */
const readPayloadEntry = async (filesystem, path) => ({
    bytes: Buffer.from(await readSourceBytes(filesystem, path)),
    path,
});

/** @param {InstallationPlatform} platform @param {string} sourceDirectory */
const loadValidatedPayload = async (platform, sourceDirectory) => {
    const openedSource = await createScopedFilesystem({root: sourceDirectory});
    if (openedSource.status === 'blocked') {
        return blocked('installation-source-unsafe', diagnosticMessages(openedSource.diagnostics));
    }
    if (openedSource.status === 'failed') {
        return failed('source-verification', diagnosticMessages(openedSource.diagnostics));
    }
    const sourceFilesystem = openedSource.scopedFilesystem;
    let manifest;
    try {
        manifest = await readCanonicalJson(sourceFilesystem, RELEASE_MANIFEST_FILE);
    } catch (error) {
        if (error instanceof PayloadBlockedError) return blocked('installation-source-unsafe', error.message, RELEASE_MANIFEST_FILE);
        if (error instanceof Error && /not valid JSON|not canonical JSON/u.test(error.message)) {
            return blocked('release-manifest-invalid', error.message, RELEASE_MANIFEST_FILE);
        }
        return failed('release-manifest-read', error, RELEASE_MANIFEST_FILE);
    }
    try {
        manifest = validateReleaseManifest(manifest, sourceDirectory);
    } catch (error) {
        return blocked('release-manifest-invalid', error instanceof Error ? error.message : String(error), RELEASE_MANIFEST_FILE);
    }
    const distributionRoot = await sourceFilesystem.inspect({path: manifest.distributionRoot});
    if (distributionRoot.status === 'blocked') {
        return blocked(
            'installation-source-unsafe',
            diagnosticMessages(distributionRoot.diagnostics),
            manifest.distributionRoot,
        );
    }
    if (distributionRoot.status === 'failed') {
        return failed(
            'source-verification',
            diagnosticMessages(distributionRoot.diagnostics),
            manifest.distributionRoot,
        );
    }
    if (distributionRoot.entry.kind !== 'directory') {
        return blocked(
            'installation-source-unsafe',
            `Installation source Distribution is not a real directory: ${manifest.distributionRoot}.`,
            manifest.distributionRoot,
        );
    }
    const distributionDirectory = resolveRelativePathWithinScope({
        path: manifest.distributionRoot,
        scope: sourceDirectory,
    });
    if (distributionDirectory.status !== 'succeeded') {
        return blocked('installation-source-unsafe', 'Workflow Distribution escapes the Installation source.', manifest.distributionRoot);
    }
    const distribution = await buildWorkflowDistribution({distributionDirectory: distributionDirectory.absolutePath});
    if (distribution.status !== 'succeeded') {
        return distribution.status === 'failed'
            ? {
                diagnostics: distribution.diagnostics,
                stage: 'workflow-distribution',
                status: /** @type {'failed'} */ ('failed'),
            }
            : {diagnostics: distribution.diagnostics, status: /** @type {'blocked'} */ ('blocked')};
    }

    const ordinarySourcePaths = [...manifest.launchers[platform]];
    let generatedOrigin;
    try {
        for (const path of manifest.runtimeFiles) {
            if (!CAPABILITY_DIRECTORIES.has(path)) {
                ordinarySourcePaths.push(path);
                continue;
            }
            const listing = await sourceFilesystem.list({path, recursive: true});
            if (listing.status !== 'succeeded') throw new PayloadBlockedError(diagnosticMessages(listing.diagnostics));
            for (const entry of listing.entries) {
                if (entry.kind === 'directory') continue;
                if (entry.kind !== 'file') throw new PayloadBlockedError(`Invalid capability resource: ${entry.path}.`);
                ordinarySourcePaths.push(entry.path.split(sep).join('/'));
            }
        }
        if (manifest.runtimeFiles.includes(CAPABILITY_FIXTURES)) {
            const checkout = await readCapabilityCheckoutOrigin(sourceDirectory);
            if (checkout !== null) {
                generatedOrigin = {path: CAPABILITY_ORIGIN, bytes: Buffer.from(JSON.stringify(checkout) + '\n')};
            } else {
                const origin = await sourceFilesystem.inspect({path: CAPABILITY_ORIGIN});
                if (origin.status !== 'succeeded') throw new PayloadBlockedError(diagnosticMessages(origin.diagnostics));
                if (origin.entry.kind !== 'missing' && !ordinarySourcePaths.includes(CAPABILITY_ORIGIN)) ordinarySourcePaths.push(CAPABILITY_ORIGIN);
            }
        }
    } catch (error) {
        if (error instanceof PayloadBlockedError) return blocked('installation-source-unsafe', error.message);
        return failed('payload-read', error);
    }
    const distributionPayload = distribution.payload.map(entry => ({
        bytes: Buffer.from(entry.bytes),
        path: joinRelativePath(manifest.distributionRoot, entry.path),
    }));
    const targetPaths = [
        ...ordinarySourcePaths,
        ...distributionPayload.map(entry => entry.path),
        ...(generatedOrigin === undefined ? [] : [generatedOrigin.path]),
    ].sort(compareText);
    const normalizedTargets = targetPaths.map(path => path.toLowerCase());
    const duplicateIndex = normalizedTargets.findIndex((target, index) => normalizedTargets.indexOf(target) !== index);
    if (duplicateIndex !== -1) {
        return blocked('installation-target-conflict', 'Release manifest produces duplicate Installation targets.', targetPaths[duplicateIndex]);
    }
    const reserved = targetPaths.find(path => RESERVED_INSTALLATION_TARGETS.has(path.toLowerCase()));
    if (reserved !== undefined) {
        return blocked('installation-target-reserved', `Installation payload conflicts with reserved target: ${reserved}.`, reserved);
    }

    let ordinaryPayload;
    try {
        ordinaryPayload = await Promise.all(ordinarySourcePaths.map(path => readPayloadEntry(sourceFilesystem, path)));
        const origin = ordinaryPayload.find(entry => entry.path === CAPABILITY_ORIGIN);
        if (origin !== undefined) parseCapabilityOrigin(origin.bytes);
    } catch (error) {
        if (error instanceof PayloadBlockedError) return blocked('installation-source-unsafe', error.message);
        return failed('payload-read', error);
    }
    const completePayload = [...ordinaryPayload, ...distributionPayload, ...(generatedOrigin === undefined ? [] : [generatedOrigin])]
        .sort((left, right) => compareText(left.path, right.path));

    const verificationPaths = [...new Set([
        manifest.configSeed,
        RELEASE_MANIFEST_FILE,
        ...ordinarySourcePaths,
        ...distributionPayload.map(entry => entry.path),
    ])].sort(compareText);
    let configSeedBytes;
    try {
        configSeedBytes = Buffer.from(await readSourceBytes(sourceFilesystem, manifest.configSeed));
    } catch (error) {
        if (error instanceof PayloadBlockedError) return blocked('installation-source-unsafe', error.message, manifest.configSeed);
        return failed('config-seed-read', error, manifest.configSeed);
    }
    return {
        configSeedBytes,
        diagnostics: [],
        payload: completePayload,
        status: 'succeeded',
        verificationPaths,
    };
};

/**
 * 验证安装载荷清单和完整 Workflow Distribution, 并返回所选平台的完整有序载荷.
 * @param {{platform: string, sourceDirectory: string}} input
 */
export const loadInstallationPayload = input => {
    const {platform, sourceDirectory} = input;
    if (!SUPPORTED_PLATFORMS.some(supported => supported === platform)) {
        return Promise.resolve(blocked('installation-platform-unsupported', `Unsupported installation platform: ${platform}.`));
    }
    return loadValidatedPayload(/** @type {InstallationPlatform} */ (platform), sourceDirectory);
};
