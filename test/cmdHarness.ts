/**
 * Harness for command-module tests (AUTOMATION + REFERENCE nouns).
 *
 * Registers a module's `register()` onto a fresh `new Command()`, stubs the
 * global `fetch` (so both the FireflyClient and the attachment binary helpers
 * are intercepted), points config at a scratch dir, and supplies ephemeral env
 * creds so `getContext()` resolves an instance without touching real config.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { applyGlobalOptionsRecursively } from '../src/globals.ts';
import { captureStdout, fetchStub } from './helpers.ts';

export interface RouteResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RunResult {
  out: string;
  log: Array<{ method: string; url: string; body?: string }>;
}

/** Run a command and capture stdout + the HTTP calls it made. */
export async function runCmd(
  register: (program: Command) => void,
  argv: string[],
  routes: Record<string, RouteResponse>,
): Promise<RunResult> {
  const log: Array<{ method: string; url: string; body?: string }> = [];
  const saved = {
    fetch: globalThis.fetch,
    token: process.env.FIREFLY_TOKEN,
    url: process.env.FIREFLY_URL,
    dir: process.env.FIREFLY_CONFIG_DIR,
    instance: process.env.FIREFLY_INSTANCE,
  };

  process.env.FIREFLY_TOKEN = 'test-token';
  process.env.FIREFLY_URL = 'https://ff.test';
  process.env.FIREFLY_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'firefly-cfg-'));
  process.env.FIREFLY_INSTANCE = '';
  globalThis.fetch = fetchStub(routes, log);

  const program = new Command();
  program.exitOverride();

  register(program);
  // Mirror cli.ts: global flags (--yes/--json/…) are applied across the tree.
  applyGlobalOptionsRecursively(program);

  let out = '';
  try {
    out = await captureStdout(async () => {
      await program.parseAsync(['node', 'firefly', ...argv]);
    });
  } finally {
    globalThis.fetch = saved.fetch;
    restore('FIREFLY_TOKEN', saved.token);
    restore('FIREFLY_URL', saved.url);
    restore('FIREFLY_CONFIG_DIR', saved.dir);
    restore('FIREFLY_INSTANCE', saved.instance);
  }
  return { out, log };
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

/** Find the first logged request whose URL contains `suffix`. */
export function findCall(
  log: RunResult['log'],
  method: string,
  suffix: string,
): { method: string; url: string; body?: string } | undefined {
  return log.find((c) => c.method === method && c.url.includes(suffix));
}
