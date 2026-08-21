export type PowerBiConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type PowerBiWorkspace = { id: string; name: string };
export type PowerBiReport = { id: string; name: string; datasetId?: string };
export type PowerBiPage = { name: string; displayName: string; order?: number };

type PowerBiCollection<T> = { value?: T[] };

const POWER_BI_API = 'https://api.powerbi.com/v1.0/myorg';

export function powerBiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PowerBiConfig {
  const tenantId = env.POWER_BI_TENANT_ID?.trim() || env.tenantId?.trim() || '';
  const clientId = env.POWER_BI_CLIENT_ID?.trim() || env.clientId?.trim() || '';
  const clientSecret = env.POWER_BI_CLIENT_SECRET || env.powerBi_ClientValue || '';
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('POWER_BI_TENANT_ID, POWER_BI_CLIENT_ID, and POWER_BI_CLIENT_SECRET are required.');
  }
  return { tenantId, clientId, clientSecret };
}

export class PowerBiClient {
  private accessToken = '';

  constructor(
    private readonly cfg: PowerBiConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getWorkspaces(): Promise<PowerBiWorkspace[]> {
    return this.getCollection<PowerBiWorkspace>('/groups?$top=5000');
  }

  async getReports(workspaceId: string): Promise<PowerBiReport[]> {
    return this.getCollection<PowerBiReport>(`/groups/${encodeURIComponent(workspaceId)}/reports`);
  }

  async getPages(workspaceId: string, reportId: string): Promise<PowerBiPage[]> {
    return this.getCollection<PowerBiPage>(
      `/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}/pages`,
    );
  }

  private async getCollection<T>(path: string): Promise<T[]> {
    const response = await this.request<PowerBiCollection<T>>(path);
    return response.value ?? [];
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.accessToken) await this.login();
    const response = await this.fetcher(`${POWER_BI_API}${path}`, {
      headers: { authorization: `Bearer ${this.accessToken}`, accept: 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Power BI request failed (${response.status}).`);
    }
    return response.json() as Promise<T>;
  }

  private async login(): Promise<void> {
    const response = await this.fetcher(
      `https://login.microsoftonline.com/${encodeURIComponent(this.cfg.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://analysis.windows.net/powerbi/api/.default',
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Power BI authentication failed (${response.status}).`);
    }
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new Error('Power BI authentication returned no access token.');
    this.accessToken = body.access_token;
  }
}
