import {stat} from 'node:fs/promises';
import {delimiter, join} from 'node:path';

/** Whether an executable file of this name is on PATH (`.exe` on Windows, where npm `.cmd` wrappers do not count).
 * @param {string} name @param {NodeJS.ProcessEnv} [environment] @param {string} [platform] */
export const executableOnPath = async (name, environment = process.env, platform = process.platform) => {
    const file = platform === 'win32' ? `${name}.exe` : name;
    for (const directory of (environment.PATH ?? '').split(delimiter)) {
        if (directory && await stat(join(directory, file)).then(entry => entry.isFile(), () => false)) return true;
    }
    return false;
};
