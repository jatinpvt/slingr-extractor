import 'dotenv/config';

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  baseUrl: (process.env.SLINGR_BASE_URL || 'https://weedme.slingrs.io/prod/runtime/api').replace(/\/$/, ''),
  email: process.env.SLINGR_EMAIL?.trim() || '',
  password: process.env.SLINGR_PASSWORD || '',
  customerCode: process.env.SELL_SHEET_CUSTOMER_CODE || 'OCS',
  customerId: process.env.SELL_SHEET_CUSTOMER_ID || '660415260e5a6f6353998642',
  pageSize: int('SLINGR_PAGE_SIZE', 500),
  timeoutMs: int('SLINGR_TIMEOUT_MS', 45_000),
  retryCount: int('SLINGR_RETRY_COUNT', 3),
  requireSkidChecked: bool('REQUIRE_SKID_CHECKED', false),
  ft2CasesAvailable: int('SELL_SHEET_FT2_CASES_AVAILABLE', 500),
};

export type AppConfig = typeof config;
