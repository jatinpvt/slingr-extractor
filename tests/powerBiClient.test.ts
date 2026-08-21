import { afterEach, describe, expect, it, vi } from 'vitest';
import { PowerBiClient, powerBiConfigFromEnv, type PowerBiConfig } from '../src/api/powerBiClient.js';

const cfg: PowerBiConfig = { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('PowerBiClient', () => {
  it('loads canonical variables and temporarily accepts the existing aliases', () => {
    expect(powerBiConfigFromEnv({
      POWER_BI_TENANT_ID: 'tenant',
      POWER_BI_CLIENT_ID: 'client',
      POWER_BI_CLIENT_SECRET: 'secret',
    })).toEqual(cfg);
    expect(powerBiConfigFromEnv({
      tenantId: 'tenant',
      clientId: 'client',
      powerBi_ClientValue: 'secret',
    })).toEqual(cfg);
  });

  it('authenticates once and discovers workspace report pages without exposing the token', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'private-token' }))
      .mockResolvedValueOnce(json({ value: [{ id: 'workspace', name: 'Sales' }] }))
      .mockResolvedValueOnce(json({ value: [{ id: 'report', name: 'YTD', datasetId: 'dataset' }] }))
      .mockResolvedValueOnce(json({ value: [{ name: 'section', displayName: 'YTD Sales Table' }] }));
    const client = new PowerBiClient(cfg, fetcher);

    await expect(client.getWorkspaces()).resolves.toHaveLength(1);
    await expect(client.getReports('workspace')).resolves.toHaveLength(1);
    await expect(client.getPages('workspace', 'report')).resolves.toHaveLength(1);

    expect(fetcher).toHaveBeenCalledTimes(4);
    const tokenBody = fetcher.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get('scope')).toBe('https://analysis.windows.net/powerbi/api/.default');
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ authorization: 'Bearer private-token' });
  });

  it('does not expose authentication response details', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error_description: 'sensitive detail' }, 401));
    const client = new PowerBiClient(cfg, fetcher);

    const error = await client.getWorkspaces().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Power BI authentication failed (401).');
    expect((error as Error).message).not.toContain('sensitive detail');
  });
});
