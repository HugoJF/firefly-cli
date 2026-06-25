/**
 * `firefly auth` — login, logout, status, token, switch (spec/02).
 *
 * Credentials are verified against `GET /about` before being saved. Tokens are
 * written through the tokenStore (file-only 0600 in v1), never to config.yml.
 */
import type { Command } from 'commander';
import { FireflyClient } from '../api/client.ts';
import { AuthError, CliError, UsageError } from '../api/errors.ts';
import type { Ctx } from '../context.ts';
import { getContext } from '../context.ts';
import { ansi, colorize, printMessage, printMutation, renderList } from '../output/render.ts';
import { isInteractive, readLine, readStdin } from '../util/prompt.ts';

/** Derive a profile name from a URL host (e.g. ff.work.example → ff-work). */
function deriveName(url: string): string {
  try {
    const host = new URL(url).hostname;
    const label = host.split('.')[0] || host;
    return label.replace(/[^a-zA-Z0-9_-]/g, '-');
  } catch {
    return 'default';
  }
}

/**
 * Shared login flow used by `auth login` and `instance add`. Resolves URL +
 * token (interactive or via flags/stdin), verifies, and persists.
 */
export async function loginFlow(
  ctx: Ctx,
  opts: { url?: string; withToken?: boolean; instance?: string },
): Promise<{ name: string; url: string }> {
  let url = opts.url;
  let token: string | undefined;

  if (opts.withToken) {
    token = (await readStdin()).trim();
    if (!token) {
      throw new UsageError('--with-token was given but no token was piped on stdin.');
    }
    if (!url) {
      if (isInteractive()) {
        url = (await readLine('Firefly III base URL: ')).trim();
      } else {
        throw new UsageError('Missing instance URL.', 'Pass --url with --with-token.');
      }
    }
  } else if (isInteractive()) {
    url = (url ?? (await readLine('Firefly III base URL: '))).trim();
    token = (await readLine('Personal Access Token: ', { mask: true })).trim();
  } else {
    throw new UsageError(
      'Non-interactive login needs a token.',
      'Pipe it with --with-token and pass --url, e.g. `firefly auth login --url <url> --with-token < token.txt`.',
    );
  }

  if (!url) {
    throw new UsageError('Missing instance URL.', 'Pass --url.');
  }
  if (!token) {
    throw new UsageError('Missing token.');
  }

  let name = opts.instance;
  if (!name) {
    const suggested = deriveName(url);
    if (isInteractive()) {
      const entered = (await readLine(`Instance name [${suggested}]: `)).trim();
      name = entered || suggested;
    } else {
      name = suggested;
    }
  }

  // Verify before saving (spec/02).
  const client = new FireflyClient({ baseUrl: url, token, verbose: ctx.flags.verbose });
  try {
    await client.get('/about');
  } catch (err) {
    if (err instanceof CliError) {
      throw new AuthError(`Could not verify credentials: ${err.message}`);
    }
    throw new AuthError(`Could not reach ${url}: ${(err as Error).message}`);
  }

  ctx.config.upsertInstance(name, { url, auth_method: 'pat' });
  await ctx.config.save();
  await ctx.tokenStore.set(name, token);

  return { name, url };
}

export function register(program: Command): void {
  const auth = program
    .command('auth')
    .description('Authenticate firefly with a Firefly III instance');

  auth
    .command('login')
    .description('Add or replace credentials for an instance (verifies via GET /about)')
    .option('--url <url>', 'Instance base URL')
    .option('--instance <name>', 'Profile name to create/replace')
    .option('--with-token', 'Read the Personal Access Token from stdin')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const { name, url } = await loginFlow(ctx, opts);
      printMutation(ctx.output, { verb: 'Logged in to', description: `${name} (${url})` });
    });

  auth
    .command('logout')
    .description('Remove stored credentials for an instance')
    .option('--instance <name>', 'Instance to log out of (default: active instance)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const name = opts.instance || ctx.flags.instance || ctx.config.defaultInstance;
      if (!name) {
        throw new UsageError('No instance specified and no default set.', 'Pass --instance.');
      }
      if (!ctx.config.getInstance(name)) {
        throw new UsageError(`No such instance: ${name}`);
      }
      await ctx.tokenStore.delete(name);
      printMutation(ctx.output, { verb: 'Logged out of', description: name });
    });

  auth
    .command('status')
    .description('Show instances, auth method, token validity and the default marker')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const instances = ctx.config.listInstances();
      const rows = await Promise.all(
        instances.map(async ({ name, config, isDefault }) => {
          const token = await ctx.tokenStore.get(name);
          let validity = token ? 'unknown' : 'no token';
          if (token) {
            try {
              const client = new FireflyClient({ baseUrl: config.url, token });
              await client.get('/about/user');
              validity = 'valid';
            } catch {
              validity = 'invalid';
            }
          }
          return { name, url: config.url, auth: config.auth_method, validity, isDefault };
        }),
      );
      renderList(
        rows,
        [
          { header: 'name', get: (r) => (r.isDefault ? `${r.name} *` : r.name) },
          { header: 'url', get: (r) => r.url },
          { header: 'auth', get: (r) => r.auth },
          { header: 'token', get: (r) => r.validity },
        ],
        ctx.output,
      );
    });

  auth
    .command('token')
    .description('Print the active instance token to stdout (for scripts)')
    .option('--instance <name>', 'Instance whose token to print')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const name = opts.instance || ctx.flags.instance || ctx.config.defaultInstance;
      if (!name) {
        throw new AuthError('No instance specified and no default set.');
      }
      const token = await ctx.tokenStore.get(name);
      if (!token) {
        throw new AuthError(`No stored token for instance "${name}".`);
      }
      process.stdout.write(`${token}\n`);
    });

  auth
    .command('switch')
    .description('Change the default instance (alias of `instance default`)')
    .argument('<name>', 'Instance to make default')
    .action(async (name: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      ctx.config.setDefaultInstance(name);
      await ctx.config.save();
      printMessage(
        `Default instance is now ${colorize(name, ansi.cyan, ctx.output.color && ctx.output.isTTY)}.`,
        ctx.output,
      );
    });
}
