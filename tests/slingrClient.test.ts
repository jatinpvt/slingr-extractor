import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { SlingrClient } from '../src/api/slingrClient.js';

const cfg = {
  baseUrl: 'https://example.test/api',
  email: 'x',
  password: 'x',
  customerCode: 'OCS',
  customerId: 'ocs-id',
  pageSize: 2,
  timeoutMs: 1_000,
  retryCount: 2,
  requireSkidChecked: false,
} satisfies AppConfig;

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SlingrClient', () => {
  it('rejects missing credentials before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new SlingrClient({ ...cfg, email: '', password: '' }).login())
      .rejects.toThrow('Slingr email and password are required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to send credentials to a non-HTTPS Slingr host', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new SlingrClient({ ...cfg, baseUrl: 'http://example.test/api' }).login())
      .rejects.toThrow('must use HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose the Slingr authentication response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ internal: 'sensitive detail' }, 401)));

    const error = await new SlingrClient(cfg).login().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Slingr authentication failed (401).');
    expect((error as Error).message).not.toContain('sensitive detail');
  });

  it('deduplicates paginated records by ID and continues until total unique records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: 'secret' }))
      .mockResolvedValueOnce(json({ total: 2, offset: 'next', items: [{ id: 'a' }] }))
      .mockResolvedValueOnce(json({ total: 2, items: [{ id: 'a' }, { id: 'b' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SlingrClient(cfg);
    await client.login();

    await expect(client.getAll<{ id: string }>('things', { targetDeliveryDate: '2026-08-11' }))
      .resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(new URL(String(call[0])).searchParams.get('targetDeliveryDate')).toBe('2026-08-11');
    }
  });

  it('throws when pagination ends before the advertised unique total', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ token: 'secret' }))
      .mockResolvedValueOnce(json({ total: 2, items: [{ id: 'a' }] })));
    const client = new SlingrClient(cfg);
    await client.login();

    await expect(client.getAll('things')).rejects.toThrow('expected 2 unique records, received 1');
  });

  it('detects repeated offsets', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ token: 'secret' }))
      .mockResolvedValueOnce(json({ total: 2, offset: 'same', items: [{ id: 'a' }] }))
      .mockResolvedValueOnce(json({ total: 2, offset: 'same', items: [{ id: 'a' }] })));
    const client = new SlingrClient(cfg);
    await client.login();

    await expect(client.getAll('things')).rejects.toThrow('Repeated pagination offset');
  });

  it('retries temporary responses and respects Retry-After', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: 'secret' }))
      .mockResolvedValueOnce(json({ message: 'temporary' }, 503, { 'retry-after': '0' }))
      .mockResolvedValueOnce(json({ message: 'busy' }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(json({ total: 1, items: [{ id: 'a' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SlingrClient(cfg);
    await client.login();

    await expect(client.getAll('things')).resolves.toEqual([{ id: 'a' }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
