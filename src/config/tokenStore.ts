/**
 * Token storage (spec/02 + spec/12).
 *
 * v1 is FILE-ONLY: a `0600` JSON file at `<config-dir>/tokens.json`, keyed by
 * instance name. The `TokenStore` interface is intentionally minimal so a
 * keychain or OAuth-aware implementation can slot in later WITHOUT touching the
 * client or commands. Never log token values (the client redacts them).
 */
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { configDir, tokensFilePath } from './paths.ts';

export interface TokenStore {
  /** Read a token for an instance, or undefined if none stored. */
  get(instance: string): Promise<string | undefined>;
  /** Persist a token for an instance (0600). */
  set(instance: string, token: string): Promise<void>;
  /** Remove a token for an instance. No-op if absent. */
  delete(instance: string): Promise<void>;
  /** List instance names that have a stored token. */
  list(): Promise<string[]>;
}

type TokenFile = Record<string, string>;

export class FileTokenStore implements TokenStore {
  private readonly path: string;

  constructor(env: NodeJS.ProcessEnv = process.env, path?: string) {
    this.path = path ?? tokensFilePath(env);
  }

  private async read(): Promise<TokenFile> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) {
      return {};
    }
    try {
      const data = await file.json();
      return data && typeof data === 'object' ? (data as TokenFile) : {};
    } catch {
      return {};
    }
  }

  private async write(data: TokenFile): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    await Bun.write(this.path, `${JSON.stringify(data, null, 2)}\n`);
    // Lock down permissions (no-op semantics on Windows, harmless).
    try {
      chmodSync(this.path, 0o600);
    } catch {
      // best-effort; some filesystems reject chmod
    }
  }

  async get(instance: string): Promise<string | undefined> {
    const data = await this.read();
    return data[instance];
  }

  async set(instance: string, token: string): Promise<void> {
    const data = await this.read();
    data[instance] = token;
    await this.write(data);
  }

  async delete(instance: string): Promise<void> {
    const data = await this.read();
    if (instance in data) {
      delete data[instance];
      await this.write(data);
    }
  }

  async list(): Promise<string[]> {
    return Object.keys(await this.read());
  }
}

/** Default file-backed token store for the resolved config dir. */
export function defaultTokenStore(env: NodeJS.ProcessEnv = process.env): TokenStore {
  // Ensure the config dir is computable; FileTokenStore lazily creates it on write.
  configDir(env);
  return new FileTokenStore(env);
}
