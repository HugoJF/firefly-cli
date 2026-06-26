/**
 * Bounded-concurrency map. Runs `fn` over `items` with at most `limit` in flight
 * at once, preserving result order. Used for client-side batched mutations (e.g.
 * bulk `tx edit`) so a few hundred sequential HTTP calls don't crawl — turning a
 * 2-minute serial run into a few seconds — without hammering the server.
 *
 * Each result captures success/failure independently; the caller decides how to
 * summarise (`N updated, M failed`). `fn` is never aborted on a sibling failure.
 */
export interface SettledResult<T, R> {
  item: T;
  index: number;
  ok: boolean;
  value?: R;
  error?: unknown;
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (result: SettledResult<T, R>) => void,
): Promise<Array<SettledResult<T, R>>> {
  const results: Array<SettledResult<T, R>> = new Array(items.length);
  const width = Math.max(1, Math.min(limit, items.length || 1));
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      let settled: SettledResult<T, R>;
      try {
        settled = { item, index, ok: true, value: await fn(item, index) };
      } catch (error) {
        settled = { item, index, ok: false, error };
      }
      results[index] = settled;
      onSettled?.(settled);
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
