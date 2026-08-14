import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

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
  email: required('SLINGR_EMAIL'),
  password: required('SLINGR_PASSWORD'),
  customerCode: process.env.SELL_SHEET_CUSTOMER_CODE || 'OCS',
  customerId: process.env.SELL_SHEET_CUSTOMER_ID || '660415260e5a6f6353998642',
  pageSize: int('SLINGR_PAGE_SIZE', 500),
  timeoutMs: int('SLINGR_TIMEOUT_MS', 45_000),
  requireSkidChecked: bool('REQUIRE_SKID_CHECKED', false),
};

export type AppConfig = typeof config;
