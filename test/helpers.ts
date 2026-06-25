/** Shared test helpers: stdout capture + an in-memory token store. */
import type { TokenStore } from '../src/config/tokenStore.ts';

/** Capture everything written to process.stdout during `fn`. */
export async function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  let buffer = '';
  process.stdout.write = ((chunk: any) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return buffer;
}

export class MemoryTokenStore implements TokenStore {
  private data = new Map<string, string>();
  async get(instance: string) {
    return this.data.get(instance);
  }
  async set(instance: string, token: string) {
    this.data.set(instance, token);
  }
  async delete(instance: string) {
    this.data.delete(instance);
  }
  async list() {
    return [...this.data.keys()];
  }
}

/** A fetch stub keyed by `METHOD path-suffix`. */
export function fetchStub(
  routes: Record<string, { status?: number; body?: unknown; headers?: Record<string, string> }>,
  log?: Array<{ method: string; url: string; body?: string }>,
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    log?.push({ method, url: u, body: init?.body as string | undefined });
    // Match by "METHOD <substring>".
    for (const [key, res] of Object.entries(routes)) {
      const [m, ...rest] = key.split(' ');
      const suffix = rest.join(' ');
      if (m === method && u.includes(suffix)) {
        const status = res.status ?? 200;
        const body = res.body === undefined ? '' : JSON.stringify(res.body);
        return new Response(body, {
          status,
          headers: { 'content-type': 'application/json', ...(res.headers ?? {}) },
        });
      }
    }
    return new Response(JSON.stringify({ message: 'no stub' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}
