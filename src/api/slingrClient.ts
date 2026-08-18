import type { AppConfig } from '../config.js';
import type { PagedResponse } from '../types.js';

export class SlingrClient {
  private token: string | null = null;

  constructor(private readonly cfg: AppConfig) {}

  async login(): Promise<void> {
    if (!this.cfg.email || !this.cfg.password) {
      throw new Error('Slingr email and password are required.');
    }
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

  async getAll<T>(entity: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T[]> {
    const byId = new Map<string, T>();
    const withoutId: T[] = [];
    const seenOffsets = new Set<string>();
    let offset: string | undefined;
    let page = 0;
    let total: number | undefined;

    while (true) {
      if (offset) {
        if (seenOffsets.has(offset)) throw new Error(`Repeated pagination offset for ${entity}: ${offset}`);
        seenOffsets.add(offset);
      }
      const response = await this.get<PagedResponse<T>>(`/data/${encodeURIComponent(entity)}`, {
        ...query,
        _size: this.cfg.pageSize,
        ...(offset ? { _offset: offset } : {}),
      });
      const items = response.items ?? [];
      total = response.total ?? total;
      for (const item of items) {
        const id = item && typeof item === 'object' && 'id' in item ? String(item.id || '') : '';
        if (id) byId.set(id, item);
        else withoutId.push(item);
      }
      page += 1;
      const uniqueCount = byId.size + withoutId.length;

      if (total != null && uniqueCount >= total) break;
      if (items.length === 0 || !response.offset) {
        if (total != null && uniqueCount < total) {
          throw new Error(`Incomplete pagination for ${entity}: expected ${total} unique records, received ${uniqueCount}`);
        }
        break;
      }
      if (response.offset === offset || seenOffsets.has(response.offset)) {
        throw new Error(`Repeated pagination offset for ${entity}: ${response.offset}`);
      }

      offset = response.offset;
      if (page > 10_000) throw new Error(`Pagination safety stop reached for ${entity}`);
    }

    return [...byId.values(), ...withoutId];
  }

  private async requestRaw(urlOrPath: string, init: RequestInit, includeToken: boolean): Promise<Response> {
    const url = urlOrPath.startsWith('http') ? urlOrPath : `${this.cfg.baseUrl}${urlOrPath}`;
    const retries = Math.max(0, this.cfg.retryCount);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const headers = new Headers(init.headers);
      if (includeToken) {
        if (!this.token) throw new Error('Slingr client is not authenticated. Call login() first.');
        headers.set('token', this.token);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const response = await fetch(url, { ...init, headers, signal: controller.signal });
        if (response.ok) return response;

        const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status);
        if (retryable && attempt < retries) {
          const retryAfter = retryAfterMs(response.headers.get('retry-after'));
          await response.body?.cancel().catch(() => undefined);
          await sleep(retryAfter ?? 500 * (2 ** attempt));
          continue;
        }

        const body = await response.text().catch(() => '');
        throw new Error(`Slingr ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 1000)}`);
      } catch (error) {
        if (attempt < retries && error instanceof TypeError) {
          await sleep(500 * (2 ** attempt));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error(`Slingr request failed for ${url}`);
  }
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
