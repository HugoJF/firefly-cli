import { describe, expect, test } from 'bun:test';
import { FireflyClient, apiRoot, buildUrl, versionedPath } from '../src/api/client.ts';
import { FireflyApiError } from '../src/api/errors.ts';
import { fetchStub } from './helpers.ts';

describe('URL normalisation (spec/07)', () => {
  test('apiRoot appends /api once', () => {
    expect(apiRoot('https://ff.example')).toBe('https://ff.example/api');
    expect(apiRoot('https://ff.example/')).toBe('https://ff.example/api');
    expect(apiRoot('https://ff.example/api')).toBe('https://ff.example/api');
  });
  test('versionedPath prepends v1 unless versioned', () => {
    expect(versionedPath('transactions')).toBe('v1/transactions');
    expect(versionedPath('/accounts/1')).toBe('v1/accounts/1');
    expect(versionedPath('v2/chart')).toBe('v2/chart');
  });
  test('buildUrl assembles base + path + query', () => {
    const u = buildUrl('https://ff.example', 'accounts', { type: 'asset', page: 2 });
    expect(u).toBe('https://ff.example/api/v1/accounts?type=asset&page=2');
  });
});

describe('FireflyClient requests', () => {
  test('sends bearer auth + parses JSON', async () => {
    const log: Array<{ method: string; url: string }> = [];
    const client = new FireflyClient({
      baseUrl: 'https://ff.example',
      token: 'secret',
      fetchImpl: fetchStub({ 'GET /v1/about': { body: { data: { version: '6.6.2' } } } }, log),
    });
    const res = await client.get('/about');
    expect(res.data.data.version).toBe('6.6.2');
    expect(log[0].url).toContain('/api/v1/about');
  });

  test('maps error responses to FireflyApiError', async () => {
    const client = new FireflyClient({
      baseUrl: 'https://ff.example',
      token: 'secret',
      fetchImpl: fetchStub({ 'GET /v1/nope': { status: 404, body: { message: 'Not found' } } }),
    });
    await expect(client.get('/nope')).rejects.toBeInstanceOf(FireflyApiError);
    await expect(client.get('/nope')).rejects.toMatchObject({ exitCode: 3 });
  });

  test('retries idempotent GET on 5xx then succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls < 2) {
        return new Response('{"message":"server"}', {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{"data":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = new FireflyClient({
      baseUrl: 'https://ff.example',
      token: 't',
      fetchImpl,
      backoffMs: 0,
    });
    const res = await client.get('/things');
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test('does NOT retry writes', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{"message":"server"}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new FireflyClient({
      baseUrl: 'https://ff.example',
      token: 't',
      fetchImpl,
      backoffMs: 0,
    });
    await expect(client.post('/things', { a: 1 })).rejects.toBeInstanceOf(FireflyApiError);
    expect(calls).toBe(1);
  });

  test('getPaged with all:true follows pages', async () => {
    const fetchImpl = (async (url: string) => {
      const page = new URL(url).searchParams.get('page');
      const body =
        page === '1'
          ? {
              data: [{ id: 1 }, { id: 2 }],
              meta: { pagination: { current_page: 1, total_pages: 2 } },
            }
          : { data: [{ id: 3 }], meta: { pagination: { current_page: 2, total_pages: 2 } } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = new FireflyClient({ baseUrl: 'https://ff.example', token: 't', fetchImpl });
    const { data } = await client.getPaged('/accounts', { all: true });
    expect(data.map((d: any) => d.id)).toEqual([1, 2, 3]);
  });
});
