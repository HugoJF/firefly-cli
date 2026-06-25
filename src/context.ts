/**
 * The `Ctx` object handed to every command handler. It bundles config, the
 * token store, resolved output settings, and lazy access to the API client for
 * the active instance. Noun-command agents receive this from `getContext()` and
 * should not reach around it.
 */
import type { Command } from 'commander';
import { FireflyClient } from './api/client.ts';
import { AuthError, UsageError } from './api/errors.ts';
import { ConfigStore } from './config/store.ts';
import { type TokenStore, defaultTokenStore } from './config/tokenStore.ts';
import { GLOBAL_FLAG_KEYS } from './globals.ts';
import type { OutputOptions, RenderMode } from './output/render.ts';
import { confirmPrompt, isInteractive } from './util/prompt.ts';

/** Raw global flags as parsed by commander (see registerGlobalFlags). */
export interface GlobalFlags {
  instance?: string;
  json?: boolean | string;
  template?: string;
  yes?: boolean;
  color?: boolean; // false when --no-color
  pager?: boolean; // false when --no-pager
  quiet?: boolean;
  verbose?: boolean;
}

export interface ResolvedInstance {
  /** Profile name, or "(env)" for ephemeral FIREFLY_URL/FIREFLY_TOKEN creds. */
  name: string;
  url: string;
  token: string;
  authMethod: 'pat' | 'oauth';
}

export interface Ctx {
  config: ConfigStore;
  tokenStore: TokenStore;
  output: OutputOptions;
  flags: GlobalFlags;
  env: NodeJS.ProcessEnv;
  /** Resolve active instance creds (precedence per spec/02). Throws AuthError. */
  resolveInstance(): Promise<ResolvedInstance>;
  /** Build an API client for the active instance. */
  client(): Promise<FireflyClient>;
  /** Confirm an action. `--yes` short-circuits true; non-TTY without it errors. */
  confirm(message: string, opts?: { defaultYes?: boolean }): Promise<boolean>;
  /** Typed confirmation for destructive ops: user must type `expected`. */
  confirmTyped(message: string, expected: string): Promise<boolean>;
}

/** Build resolved OutputOptions from flags + config + env (precedence spec/03). */
export function buildOutputOptions(
  flags: GlobalFlags,
  config: ConfigStore,
  env: NodeJS.ProcessEnv,
): OutputOptions {
  const settings = config.settings;
  const isTTY = Boolean(process.stdout.isTTY);

  // Mode: --template > --json > settings.output > table.
  let mode: RenderMode = settings.output === 'json' ? 'json' : 'table';
  let jsonFields: string[] | undefined;
  if (flags.template !== undefined) {
    mode = 'template';
  } else if (flags.json !== undefined && flags.json !== false) {
    mode = 'json';
    if (typeof flags.json === 'string' && flags.json.length > 0) {
      jsonFields = flags.json
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
    }
  }

  // Colour: --no-color > NO_COLOR env > settings.color > auto(TTY).
  let color: boolean;
  if (flags.color === false) {
    color = false;
  } else if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    color = false;
  } else if (settings.color === 'always') {
    color = true;
  } else if (settings.color === 'never') {
    color = false;
  } else {
    color = isTTY;
  }

  // Pager: --no-pager > settings.pager.
  const pager = flags.pager === false ? 'never' : settings.pager;

  return {
    mode,
    jsonFields,
    template: flags.template,
    color,
    quiet: Boolean(flags.quiet),
    pager,
    isTTY,
  };
}

/**
 * Construct a Ctx. Loads config from disk (or accepts an injected store/token
 * store for tests). Instance/client resolution is lazy so meta commands that
 * don't touch the network (config, version) never require credentials.
 */
export async function createContext(
  flags: GlobalFlags,
  deps: { config?: ConfigStore; tokenStore?: TokenStore; env?: NodeJS.ProcessEnv } = {},
): Promise<Ctx> {
  const env = deps.env ?? process.env;
  const config = deps.config ?? (await ConfigStore.load(env));
  const tokenStore = deps.tokenStore ?? defaultTokenStore(env);
  const verbose =
    Boolean(flags.verbose) || (env.FIREFLY_DEBUG !== undefined && env.FIREFLY_DEBUG !== '');
  const output = buildOutputOptions(flags, config, env);

  let cachedInstance: ResolvedInstance | undefined;
  let cachedClient: FireflyClient | undefined;

  async function resolveInstance(): Promise<ResolvedInstance> {
    if (cachedInstance) {
      return cachedInstance;
    }
    // 1. Ephemeral env creds (CI): FIREFLY_TOKEN + FIREFLY_URL.
    if (env.FIREFLY_TOKEN && env.FIREFLY_URL) {
      cachedInstance = {
        name: '(env)',
        url: env.FIREFLY_URL,
        token: env.FIREFLY_TOKEN,
        authMethod: 'pat',
      };
      return cachedInstance;
    }

    // 2. --instance flag, 3. FIREFLY_INSTANCE env, 4. default instance.
    const name = flags.instance || env.FIREFLY_INSTANCE || config.defaultInstance;
    if (!name) {
      throw new AuthError('No instance configured.');
    }
    const profile = config.getInstance(name);
    if (!profile) {
      throw new AuthError(`No such instance: ${name}`);
    }
    const token = await tokenStore.get(name);
    if (!token) {
      throw new AuthError(`No stored token for instance "${name}".`);
    }
    cachedInstance = {
      name,
      url: profile.url,
      token,
      authMethod: profile.auth_method ?? 'pat',
    };
    return cachedInstance;
  }

  async function client(): Promise<FireflyClient> {
    if (cachedClient) {
      return cachedClient;
    }
    const inst = await resolveInstance();
    cachedClient = new FireflyClient({ baseUrl: inst.url, token: inst.token, verbose });
    return cachedClient;
  }

  async function confirm(message: string, opts: { defaultYes?: boolean } = {}): Promise<boolean> {
    if (flags.yes) {
      return true;
    }
    if (!isInteractive()) {
      throw new UsageError(
        'Confirmation required in non-interactive mode.',
        'Pass --yes to proceed.',
      );
    }
    return confirmPrompt(message, opts.defaultYes ?? false);
  }

  async function confirmTyped(message: string, expected: string): Promise<boolean> {
    if (flags.yes) {
      return true;
    }
    if (!isInteractive()) {
      throw new UsageError(
        'Destructive action requires confirmation in non-interactive mode.',
        `Pass --yes to proceed (scope: ${expected}).`,
      );
    }
    const { readLine } = await import('./util/prompt.ts');
    const answer = (await readLine(`${message}\nType "${expected}" to confirm: `)).trim();
    return answer === expected;
  }

  return { config, tokenStore, output, flags, env, resolveInstance, client, confirm, confirmTyped };
}

/**
 * Collect global flags off the command tree. Walks leaf → root taking the
 * first command that EXPLICITLY set each flag (source !== 'default'), so a flag
 * works both before and after the subcommand and the closest one wins.
 */
export function collectGlobalFlags(command: Command): GlobalFlags {
  const result: Record<string, unknown> = {};
  let cmd: Command | null = command;
  while (cmd) {
    const opts = cmd.opts();
    for (const key of GLOBAL_FLAG_KEYS) {
      if (result[key] !== undefined) {
        continue;
      }
      const source = cmd.getOptionValueSource(key);
      if (source !== undefined && source !== 'default') {
        result[key] = opts[key];
      }
    }
    cmd = cmd.parent;
  }
  // Defaults for negatable flags (commander default true means "on").
  if (result.color === undefined) {
    result.color = true;
  }
  if (result.pager === undefined) {
    result.pager = true;
  }
  return result as GlobalFlags;
}

/**
 * Helper used inside command actions to obtain a Ctx from commander.
 */
export async function getContext(command: Command): Promise<Ctx> {
  return createContext(collectGlobalFlags(command));
}
