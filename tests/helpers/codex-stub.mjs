import {chmod, writeFile} from 'node:fs/promises';
import {delimiter, join} from 'node:path';

import {createTemporaryDirectory, registerCleanup} from './cleanup.mjs';

/** Puts an empty `codex` executable first on PATH for one test, for code that looks the Codex directory up, and returns that directory.
 * @param {import('./cleanup.mjs').CleanupContext} t */
export const stubCodexOnPath = async t => {
    const directory = await createTemporaryDirectory(t, 'arw-codex-stub-');
    await writeFile(join(directory, 'codex'), '');
    await chmod(join(directory, 'codex'), 0o755);
    const saved = process.env.PATH;
    process.env.PATH = `${directory}${delimiter}${saved}`;
    registerCleanup(t, () => { process.env.PATH = saved; });
    return directory;
};
