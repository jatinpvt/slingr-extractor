import type { AppConfig } from '../config.js';
import type { PagedResponse } from '../types.js';

export class SlingrClient {
  private token: string | null = null;

  constructor(private readonly cfg: AppConfig) {}

  async login(): Promise<void> {
    const response = await this.requestRaw('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    }, false);
    const data = await response.json() as { token?: string };
    if (!data.token) throw new Error('Slingr login succeeded but no token was returned.');
    this.token = data.token;
  }

  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await this.requestRaw(url.toString(), { method: 'GET', headers: { accept: 'application/json' } }, true);
    return response.json() as Promise<T>;
  }

  async getRecord<T>(entity: string, id: string): Promise<T> {
    return this.get<T>(`/data/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`);
  }

  async getAll<T>(entity: string): Promise<T[]> {
    const all: T[] = [];
    let offset: string | undefined;
    let page = 0;

    while (true) {
      const response = await this.get<PagedResponse<T>>(`/data/${encodeURIComponent(entity)}`, {
        _size: this.cfg.pageSize,
        ...(offset ? { _offset: offset } : {}),
      });
      const items = response.items ?? [];
      all.push(...items);
      page += 1;

      if (items.length === 0) break;
      if (response.total != null && all.length >= response.total) break;
      if (!response.offset || response.offset === offset) break;

      offset = response.offset;
      if (page > 10_000) throw new Error(`Pagination safety stop reached for ${entity}`);
    }

    return all;
  }

  private async requestRaw(urlOrPath: string, init: RequestInit, includeToken: boolean): Promise<Response> {
    const url = urlOrPath.startsWith('http') ? urlOrPath : `${this.cfg.baseUrl}${urlOrPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (includeToken) {
        if (!this.token) throw new Error('Slingr client is not authenticated. Call login() first.');
        headers.set('token', this.token);
      }
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Slingr ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 1000)}`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
