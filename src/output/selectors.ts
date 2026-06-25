import { UsageError } from '../api/errors.ts';
/**
 * Interactive reference selectors (spec/09). Backed by Firefly's
 * `/v1/autocomplete/*` endpoints. Every selector has a flag twin: in non-TTY
 * mode `pickReference` throws a UsageError naming the exact flag, so commands
 * stay fully scriptable and never hang.
 *
 * Foundation note: this is a numbered picker (fetch + choose), not a live fuzzy
 * UI. The API surface (`pickReference`) is stable; the interaction can be made
 * fuzzier later without changing callers.
 */
import type { Ctx } from '../context.ts';
import { isInteractive, readLine } from '../util/prompt.ts';

/** Autocomplete endpoints exposed as reference kinds (spec/09). */
export type ReferenceKind =
  | 'accounts'
  | 'bills'
  | 'budgets'
  | 'categories'
  | 'currencies'
  | 'object-groups'
  | 'piggy-banks'
  | 'recurring'
  | 'rule-groups'
  | 'rules'
  | 'subscriptions'
  | 'tags'
  | 'transaction-types'
  | 'transactions';

export interface ReferenceItem {
  id: string;
  name: string;
  /** Original autocomplete payload for callers that need more fields. */
  raw: Record<string, unknown>;
}

export interface PickOptions {
  /** Flag name to cite in non-TTY errors, e.g. `--source`. Required. */
  flag: string;
  /** Initial query passed to the autocomplete endpoint. */
  query?: string;
  /** Prompt label; defaults to the kind. */
  label?: string;
}

/**
 * Query an autocomplete endpoint. Returns normalised {id, name, raw} items.
 * Autocomplete payloads vary slightly per kind; we normalise `name`/`title`.
 */
export async function fetchAutocomplete(
  kind: ReferenceKind,
  ctx: Ctx,
  query?: string,
): Promise<ReferenceItem[]> {
  const client = await ctx.client();
  const res = await client.get(`/autocomplete/${kind}`, query ? { query } : undefined);
  const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  return (list as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id ?? item.code ?? item.name ?? ''),
    name: String(item.name ?? item.title ?? item.description ?? item.code ?? item.id ?? ''),
    raw: item,
  }));
}

/**
 * Resolve a reference either from interactive selection or fail with a flag
 * hint. Callers pass whatever the user already supplied via flags BEFORE
 * calling this (only call when the value is missing).
 */
export async function pickReference(
  kind: ReferenceKind,
  ctx: Ctx,
  opts: PickOptions,
): Promise<ReferenceItem> {
  if (!isInteractive() || ctx.flags.yes) {
    throw new UsageError(
      `Missing required ${opts.label ?? kind}.`,
      `Provide ${opts.flag} (interactive selection needs a TTY).`,
    );
  }

  const items = await fetchAutocomplete(kind, ctx, opts.query);
  if (items.length === 0) {
    throw new UsageError(
      `No ${opts.label ?? kind} found${opts.query ? ` for "${opts.query}"` : ''}.`,
      `Provide ${opts.flag} explicitly.`,
    );
  }

  process.stderr.write(`Select ${opts.label ?? kind}:\n`);
  items.forEach((item, i) => {
    process.stderr.write(`  ${i + 1}) ${item.name}${item.id ? ` (${item.id})` : ''}\n`);
  });

  const answer = (await readLine(`Enter number [1-${items.length}]: `)).trim();
  const index = Number.parseInt(answer, 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= items.length) {
    throw new UsageError('Invalid selection.', `Provide ${opts.flag} explicitly.`);
  }
  return items[index];
}
