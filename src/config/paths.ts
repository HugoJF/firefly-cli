/**
 * Platform config directory resolution (spec/03 "Locations").
 *
 * Order:
 *   1. `FIREFLY_CONFIG_DIR` override (tests, sandboxes).
 *   2. Linux: `${XDG_CONFIG_HOME:-~/.config}/firefly`
 *   3. macOS: `~/Library/Application Support/firefly` (unless XDG_CONFIG_HOME set).
 *   4. Windows: `%AppData%\firefly`.
 */
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.FIREFLY_CONFIG_DIR;
  if (override && override.length > 0) {
    return override;
  }

  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return join(xdg, 'firefly');
  }

  const os = platform();
  if (os === 'win32') {
    const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'firefly');
  }
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'firefly');
  }
  // Linux / other unix
  return join(homedir(), '.config', 'firefly');
}

export function configFilePath(env?: NodeJS.ProcessEnv): string {
  return join(configDir(env), 'config.yml');
}

export function tokensFilePath(env?: NodeJS.ProcessEnv): string {
  return join(configDir(env), 'tokens.json');
}
