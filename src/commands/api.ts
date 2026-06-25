/**
 * `firefly api` — raw escape hatch (spec/07), modelled on `gh api`.
 *
 * Reachability floor: any endpoint not modelled as a command is callable here.
 * Method is inferred (GET, or POST when `-f`/`-F`/`--input` present). Fields go
 * to the query string on GET and to a JSON body otherwise. gh-style nested keys
 * (`a[]`, `a[b]`, `a[][b]`) build nested JSON.
 *
 * jq (`--jq`) is deferred per spec/12 — use `--json`-style piping to external
 * jq, or `-t/--template`.
 */
import type { Command } from 'commander';
import type { Query } from '../api/client.ts';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { emitTemplatePublic } from '../output/render.ts';
import { readStdin } from '../util/prompt.ts';

export interface ParsedField {
  key: string;
  value: unknown;
}

/** Infer the HTTP method: explicit wins; else POST when a body is implied. */
export function inferMethod(explicit: string | undefined, hasFields: boolean): string {
  if (explicit) {
    return explicit.toUpperCase();
  }
  return hasFields ? 'POST' : 'GET';
}

/** Coerce a `-F` typed value: true/false/null/number; strings pass through. */
export function coerceFieldValue(raw: string): unknown {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null') {
    return null;
  }
  if (/^-?\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  if (/^-?\d*\.\d+$/.test(raw)) {
    return Number.parseFloat(raw);
  }
  return raw;
}

/** Split a `k=v` argument into key + raw value (value may contain `=`). */
export function splitKeyValue(arg: string): { key: string; value: string } {
  const idx = arg.indexOf('=');
  if (idx === -1) {
    throw new UsageError(`Invalid field (expected key=value): ${arg}`);
  }
  return { key: arg.slice(0, idx), value: arg.slice(idx + 1) };
}

/**
 * Resolve a `-F` value's special forms: `@file` reads a file, `-` reads stdin.
 * (raw `-f` fields are always literal strings.)
 */
async function resolveTypedRaw(value: string): Promise<string> {
  if (value === '-') {
    return (await readStdin()).trim();
  }
  if (value.startsWith('@')) {
    return (await Bun.file(value.slice(1)).text()).trim();
  }
  return value;
}

/**
 * Set a gh-style bracketed key into a nested object.
 *   a=b        -> { a: b }
 *   a[]=b      -> { a: [b] }
 *   a[b]=c     -> { a: { b: c } }
 *   a[][b]=c   -> { a: [ { b: c } ] }  (new element when last already has `b`)
 */
export function setNestedField(target: Record<string, any>, key: string, value: unknown): void {
  const match = key.match(/^([^[\]]+)((\[[^\]]*\])*)$/);
  if (!match) {
    target[key] = value;
    return;
  }
  const base = match[1];
  const segments = [...match[2].matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);

  if (segments.length === 0) {
    target[base] = value;
    return;
  }

  // Navigate with (parent, key): the slot `parent[key]` is the level we are at.
  let parent: any = target;
  let slot: string | number = base;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    if (seg === '') {
      // The slot must be an array; push or select its last element.
      if (!Array.isArray(parent[slot])) {
        parent[slot] = [];
      }
      const arr = parent[slot] as any[];
      if (isLast) {
        arr.push(value);
        return;
      }
      // A child level follows. Reuse the last element unless it already holds
      // the upcoming key (then start a new element) — matches gh's grouping.
      const next = segments[i + 1];
      let last = arr[arr.length - 1];
      const needNew =
        last === undefined ||
        typeof last !== 'object' ||
        (next === '' ? !Array.isArray(last) : next in last);
      if (needNew) {
        last = next === '' ? [] : {};
        arr.push(last);
      }
      parent = arr;
      slot = arr.length - 1;
    } else {
      // The slot must be an object.
      if (
        parent[slot] === undefined ||
        typeof parent[slot] !== 'object' ||
        Array.isArray(parent[slot])
      ) {
        parent[slot] = {};
      }
      const obj = parent[slot];
      if (isLast) {
        obj[seg] = value;
        return;
      }
      parent = obj;
      slot = seg;
    }
  }
}

/** Parse `-H k:v` headers. */
function parseHeader(arg: string): { key: string; value: string } {
  const idx = arg.indexOf(':');
  if (idx === -1) {
    throw new UsageError(`Invalid header (expected key:value): ${arg}`);
  }
  return { key: arg.slice(0, idx).trim(), value: arg.slice(idx + 1).trim() };
}

function collect(value: string, prev: string[]): string[] {
  prev.push(value);
  return prev;
}

export function register(program: Command): void {
  program
    .command('api')
    .description('Make a raw authenticated request to the Firefly III API (escape hatch)')
    .argument('<endpoint>', 'Path, e.g. transactions, /v1/accounts/123, v2/...')
    .option('-X, --method <method>', 'HTTP method (default: GET, or POST when fields are present)')
    .option(
      '-f, --raw-field <key=value>',
      'String field (query on GET, body otherwise)',
      collect,
      [],
    )
    .option('-F, --field <key=value>', 'Typed field; @file / - (stdin) supported', collect, [])
    .option('--input <file>', 'Raw request body from a file (- for stdin)')
    .option('-H, --header <key:value>', 'Add a request header', collect, [])
    .option('-t, --template <tmpl>', 'Render the response with a Go-template-style template')
    .option('--paginate', 'Follow meta.pagination and concatenate results')
    .option('-i, --include', 'Include HTTP status and headers in the output')
    .option('-v, --verbose', 'Dump request/response info to stderr (token redacted)')
    .action(async (endpoint: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      const rawFields: string[] = opts.rawField ?? [];
      const typedFields: string[] = opts.field ?? [];
      const hasFields = rawFields.length > 0 || typedFields.length > 0 || opts.input !== undefined;
      const method = inferMethod(opts.method, hasFields);

      // Build typed/raw field pairs.
      const pairs: ParsedField[] = [];
      for (const f of rawFields) {
        const { key, value } = splitKeyValue(f);
        pairs.push({ key, value });
      }
      for (const f of typedFields) {
        const { key, value } = splitKeyValue(f);
        const resolved = await resolveTypedRaw(value);
        // @file / - are passed through literally (already read); else coerce.
        const coerced =
          value === '-' || value.startsWith('@') ? resolved : coerceFieldValue(resolved);
        pairs.push({ key, value: coerced });
      }

      const headers: Record<string, string> = {};
      for (const h of (opts.header as string[] | undefined) ?? []) {
        const { key, value } = parseHeader(h);
        headers[key] = value;
      }

      const isGet = method === 'GET';
      let query: Query | undefined;
      let body: unknown;
      let rawBody: string | undefined;

      if (opts.input !== undefined) {
        rawBody = opts.input === '-' ? await readStdin() : await Bun.file(opts.input).text();
      } else if (isGet) {
        query = {};
        for (const p of pairs) {
          query[p.key] = p.value as any;
        }
      } else if (pairs.length > 0) {
        const obj: Record<string, any> = {};
        for (const p of pairs) {
          setNestedField(obj, p.key, p.value);
        }
        body = obj;
      }

      // Pagination (GET only).
      if (opts.paginate && isGet) {
        const result = await client.getPaged(endpoint, { query, all: true });
        return output({ data: result.data }, undefined, undefined, opts, ctx);
      }

      const res = await client.request(endpoint, { method, query, body, rawBody, headers });
      return output(res.data, res.status, res.headers, opts, ctx);
    });
}

function output(
  data: unknown,
  status: number | undefined,
  headers: Headers | undefined,
  opts: { include?: boolean; template?: string },
  ctx: Awaited<ReturnType<typeof getContext>>,
): void {
  if (opts.include && status !== undefined) {
    process.stdout.write(`HTTP ${status}\n`);
    if (headers) {
      for (const [k, v] of headers.entries()) {
        process.stdout.write(`${k}: ${v}\n`);
      }
    }
    process.stdout.write('\n');
  }
  if (opts.template) {
    emitTemplatePublic(data, opts.template);
    return;
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
