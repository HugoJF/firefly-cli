/**
 * Shared harness for command-module tests: register a module onto a fresh
 * `Command`, apply the global flags, stub `fetch`, point credentials at an
 * ephemeral env instance, run, and capture stdout.
 */
import { Command } from 'commander';
import { applyGlobalOptionsRecursively } from '../src/globals.ts';
import { fetchStub } from './helpers.ts';

export interface RunResult {
  stdout: string;
  requests: Array<{ method: string; url: string; body?: string }>;
}

export async function runCommand(
  register: (program: Command) => void,
  argv: string[],
  routes: Record<
    string,
    { status?: number; body?: unknown; headers?: Record<string, string> }
  > = {},
  env: NodeJS.ProcessEnv = {},
): Promise<RunResult> {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  register(program);
  applyGlobalOptionsRecursively(program);

  const requests: RunResult['requests'] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub(routes, requests);

  const savedEnv: Record<string, string | undefined> = {};
  const applyEnv = { FIREFLY_URL: 'https://test.example', FIREFLY_TOKEN: 'tok', ...env };
  for (const [k, v] of Object.entries(applyEnv)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }

  const originalWrite = process.stdout.write.bind(process.stdout);
  let stdout = '';
  process.stdout.write = ((chunk: any) => {
    stdout += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  try {
    await program.parseAsync(argv, { from: 'user' });
  } finally {
    process.stdout.write = originalWrite;
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
  return { stdout, requests };
}
