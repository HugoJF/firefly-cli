/**
 * Config file (`config.yml`) read/write, dotted-key access, instance resolution
 * and settings precedence (spec/02 "Credential resolution", spec/03).
 *
 * Tokens NEVER live here (see tokenStore.ts). This file holds instances, the
 * default instance, global settings and user aliases.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import { UsageError } from '../api/errors.ts';
import { configFilePath } from './paths.ts';

export type AuthMethod = 'pat' | 'oauth';

export interface InstanceConfig {
  url: string;
  auth_method: AuthMethod;
  /** Reserved for OAuth (spec/02); unused in v1. */
  oauth?: {
    client_id?: string;
    scopes?: string[];
    token_expires_at?: string;
    refresh_token_ref?: string;
  };
}

export interface Settings {
  output: 'table' | 'json';
  pager: 'auto' | 'always' | 'never';
  color: 'auto' | 'always' | 'never';
  date_format: string;
}

export interface ConfigData {
  default_instance?: string;
  instances: Record<string, InstanceConfig>;
  settings: Settings;
  aliases: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  output: 'table',
  pager: 'auto',
  color: 'auto',
  date_format: 'YYYY-MM-DD',
};

const SETTING_ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  output: ['table', 'json'],
  pager: ['auto', 'always', 'never'],
  color: ['auto', 'always', 'never'],
};

function emptyConfig(): ConfigData {
  return {
    instances: {},
    settings: { ...DEFAULT_SETTINGS },
    aliases: {},
  };
}

export class ConfigStore {
  private data: ConfigData;
  readonly path: string;

  private constructor(data: ConfigData, path: string) {
    this.data = data;
    this.path = path;
  }

  /** Load config from disk (async; uses Bun.file). Missing file → defaults. */
  static async load(env: NodeJS.ProcessEnv = process.env): Promise<ConfigStore> {
    const path = configFilePath(env);
    const file = Bun.file(path);
    let data = emptyConfig();
    if (await file.exists()) {
      const raw = parse(await file.text()) ?? {};
      data = {
        default_instance: raw.default_instance,
        instances: raw.instances ?? {},
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        aliases: raw.aliases ?? {},
      };
    }
    return new ConfigStore(data, path);
  }

  /** In-memory store for tests. */
  static inMemory(data?: Partial<ConfigData>, path = '<memory>'): ConfigStore {
    return new ConfigStore({ ...emptyConfig(), ...data }, path);
  }

  async save(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    await Bun.write(this.path, stringify(this.data));
  }

  /** Raw data (effective file contents). */
  raw(): ConfigData {
    return this.data;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  // ---- Instance management (spec/03) -------------------------------------

  listInstances(): Array<{ name: string; config: InstanceConfig; isDefault: boolean }> {
    return Object.entries(this.data.instances).map(([name, config]) => ({
      name,
      config,
      isDefault: name === this.data.default_instance,
    }));
  }

  getInstance(name: string): InstanceConfig | undefined {
    return this.data.instances[name];
  }

  get defaultInstance(): string | undefined {
    return this.data.default_instance;
  }

  upsertInstance(name: string, config: InstanceConfig): void {
    this.data.instances[name] = config;
    if (!this.data.default_instance) {
      this.data.default_instance = name;
    }
  }

  removeInstance(name: string): void {
    if (!(name in this.data.instances)) {
      throw new UsageError(`No such instance: ${name}`);
    }
    delete this.data.instances[name];
    if (this.data.default_instance === name) {
      const remaining = Object.keys(this.data.instances);
      this.data.default_instance = remaining[0];
    }
  }

  setDefaultInstance(name: string): void {
    if (!(name in this.data.instances)) {
      throw new UsageError(`No such instance: ${name}`);
    }
    this.data.default_instance = name;
  }

  // ---- Aliases ------------------------------------------------------------

  listAliases(): Record<string, string> {
    return this.data.aliases;
  }

  setAlias(name: string, expansion: string): void {
    this.data.aliases[name] = expansion;
  }

  deleteAlias(name: string): void {
    delete this.data.aliases[name];
  }

  // ---- Dotted-key get/set (spec/03 `config get|set`) ----------------------

  /**
   * Read a dotted key e.g. `settings.output`, `default_instance`,
   * `instances.work.url`. Returns undefined for missing keys.
   */
  get(dottedKey: string): unknown {
    const parts = dottedKey.split('.');
    let node: any = this.data;
    for (const part of parts) {
      if (node == null || typeof node !== 'object') {
        return undefined;
      }
      node = node[part];
    }
    return node;
  }

  /**
   * Write a dotted key with light enum validation for known settings.
   * Does not save; caller persists via `save()`.
   */
  set(dottedKey: string, value: string): void {
    const parts = dottedKey.split('.');
    if (parts.length === 0 || parts[0] === '') {
      throw new UsageError('Empty config key.');
    }

    // Validate known settings enums.
    if (parts[0] === 'settings' && parts.length === 2) {
      const key = parts[1] as keyof Settings;
      const allowed = SETTING_ENUMS[key];
      if (allowed && !allowed.includes(value)) {
        throw new UsageError(
          `Invalid value for settings.${key}: ${value}`,
          `Allowed: ${allowed.join(', ')}`,
        );
      }
    }
    if (
      parts[0] === 'instances' &&
      parts[2] === 'auth_method' &&
      value !== 'pat' &&
      value !== 'oauth'
    ) {
      throw new UsageError(`Invalid auth_method: ${value}`, 'Allowed: pat, oauth');
    }

    let node: any = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (node[part] == null || typeof node[part] !== 'object') {
        node[part] = {};
      }
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
  }

  /** Effective config with any tokens redacted (there are none here, but future-proof). */
  redacted(): ConfigData {
    return this.data;
  }
}
