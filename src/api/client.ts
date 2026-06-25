/**
 * Single `fetch`-based Firefly III HTTP client (spec/01 "API client").
 *
 *  - Bearer auth header from the resolved instance token.
 *  - Base URL normalisation: a user URL like `https://ff.example` becomes the
 *    API root `https://ff.example/api`; paths are version-prefixed (`v1/...`).
 *  - `getPaged()` honours `--limit`/`--page`, or auto-follows every page with
 *    `--all`, over Firefly's `meta.pagination`.
 *  - Idempotent GETs retry on 5xx/network with backoff; writes never retry.
 *  - `--verbose` logs method, URL, status, timing to stderr — token REDACTED.
 */
import { FireflyApiError } from './errors.ts';

export interface ClientOptions {
  /** User-facing instance base URL (without /api is fine). */
  baseUrl: string;
  token: string;
  verbose?: boolean;
  /** Override fetch (tests inject a stub). */
  fetchImpl?: typeof fetch;
  /** Max idempotent-GET retries on 5xx/network (default 2). */
  maxRetries?: number;
  /** Base backoff in ms (default 250); 0 disables sleeping (tests). */
  backoffMs?: number;
}

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue | QueryValue[]>;

export interface RequestOptions {
  method?: string;
  query?: Query;
  body?: unknown;
  /** Pre-serialised raw body; bypasses JSON.stringify (used by `api --input`). */
  rawBody?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface FireflyResponse<T = any> {
  status: number;
  headers: Headers;
  data: T;
}

const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Normalise a user URL into the API root, guaranteeing a trailing `/api`. */
export function apiRoot(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '');
  if (!/\/api$/.test(url)) {
    url = `${url}/api`;
  }
  return url;
}

/** Ensure a path is version-prefixed (`v1/` default) and slash-free at the front. */
export function versionedPath(path: string): string {
  let p = path.trim().replace(/^\/+/, '');
  if (!/^v\d+\//.test(p)) {
    p = `v1/${p}`;
  }
  return p;
}

/** Build a full request URL from base + path + query. */
export function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const url = new URL(`${apiRoot(baseUrl)}/${versionedPath(path)}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v !== undefined && v !== null) {
            url.searchParams.append(key, String(v));
          }
        }
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

export class FireflyClient {
  private readonly opts: Required<Pick<ClientOptions, 'baseUrl' | 'token'>> &
    Omit<ClientOptions, 'baseUrl' | 'token'>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.opts = {
      maxRetries: 2,
      backoffMs: 250,
      verbose: false,
      ...options,
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get baseUrl(): string {
    return this.opts.baseUrl;
  }

  private headers(extra?: Record<string, string>, hasBody = false): Headers {
    const h = new Headers({
      Authorization: `Bearer ${this.opts.token}`,
      Accept: 'application/json',
    });
    if (hasBody) {
      h.set('Content-Type', 'application/json');
    }
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        h.set(k, v);
      }
    }
    return h;
  }

  private log(line: string): void {
    if (this.opts.verbose) {
      process.stderr.write(`${line}\n`);
    }
  }

  /** Core request with retry on idempotent failures. */
  async request<T = any>(path: string, options: RequestOptions = {}): Promise<FireflyResponse<T>> {
    const method = (options.method ?? 'GET').toUpperCase();
    const url = buildUrl(this.opts.baseUrl, path, options.query);
    const hasBody = options.rawBody !== undefined || options.body !== undefined;
    const headers = this.headers(options.headers, hasBody);
    const bodyText =
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined;

    const retriable = IDEMPOTENT.has(method);
    const maxAttempts = retriable ? (this.opts.maxRetries ?? 2) + 1 : 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = performance.now();
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyText,
          signal: options.signal,
        });
        const ms = Math.round(performance.now() - started);
        this.log(`${method} ${url} -> ${res.status} (${ms}ms)`);

        if (res.status >= 500 && retriable && attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        const data = await parseBody(res);
        if (!res.ok) {
          throw FireflyApiError.fromResponse(res.status, method, url, data);
        }
        return { status: res.status, headers: res.headers, data: data as T };
      } catch (err) {
        if (err instanceof FireflyApiError) {
          throw err;
        }
        // Network/abort error.
        lastError = err;
        this.log(`${method} ${url} -> network error: ${(err as Error).message}`);
        if (retriable && attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  get<T = any>(path: string, query?: Query, options?: RequestOptions): Promise<FireflyResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET', query });
  }

  post<T = any>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<FireflyResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T = any>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<FireflyResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T = any>(path: string, options?: RequestOptions): Promise<FireflyResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Fetch a list endpoint honouring pagination (spec/01).
   *  - `all: true`  → follow every page via meta.pagination, concatenating `.data`.
   *  - otherwise    → a single page with `page`/`limit` passed through.
   * Returns the merged `data` array plus the last raw envelope (for meta).
   */
  async getPaged<T = any>(
    path: string,
    opts: { query?: Query; limit?: number; page?: number; all?: boolean } = {},
  ): Promise<{ data: T[]; raw: any }> {
    const baseQuery: Query = { ...opts.query };
    if (opts.limit !== undefined) {
      baseQuery.limit = opts.limit;
    }

    if (!opts.all) {
      const page = opts.page ?? 1;
      const res = await this.get(path, { ...baseQuery, page });
      return { data: extractData<T>(res.data), raw: res.data };
    }

    // Follow all pages.
    const collected: T[] = [];
    let page = 1;
    let lastRaw: any;
    // Safety cap to avoid runaway loops on a misbehaving server.
    for (let guard = 0; guard < 10_000; guard++) {
      const res = await this.get(path, { ...baseQuery, page });
      lastRaw = res.data;
      collected.push(...extractData<T>(res.data));
      const pagination = res.data?.meta?.pagination;
      const totalPages: number | undefined = pagination?.total_pages;
      const currentPage: number | undefined = pagination?.current_page ?? page;
      if (!totalPages || (currentPage ?? page) >= totalPages) {
        break;
      }
      page = (currentPage ?? page) + 1;
    }
    return { data: collected, raw: lastRaw };
  }

  private async backoff(attempt: number): Promise<void> {
    const base = this.opts.backoffMs ?? 250;
    if (base <= 0) {
      return;
    }
    const jitter = Math.random() * base;
    const delay = base * 2 ** (attempt - 1) + jitter;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function extractData<T>(body: any): T[] {
  if (body && Array.isArray(body.data)) {
    return body.data as T[];
  }
  if (Array.isArray(body)) {
    return body as T[];
  }
  return [];
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) {
    return undefined;
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  // Try JSON anyway (Firefly sometimes omits content-type on errors).
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
