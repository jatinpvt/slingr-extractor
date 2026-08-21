import { describe, expect, it, vi } from 'vitest';
import {
  applySecurityHeaders,
  isSecureCredentialRequest,
  isTrustedCredentialOrigin,
  safeErrorMessage,
} from '../src/lib/httpSecurity.js';

describe('HTTP credential security', () => {
  it('sets no-store and browser hardening headers', () => {
    const setHeader = vi.fn();
    applySecurityHeaders({ setHeader });

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("form-action 'self'"));
  });

  it('allows HTTPS and loopback development but rejects public HTTP', () => {
    expect(isSecureCredentialRequest({ headers: { host: 'sell-sheets.example', 'x-forwarded-proto': 'https' } })).toBe(true);
    expect(isSecureCredentialRequest({ headers: { host: '127.0.0.1:3000' } })).toBe(true);
    expect(isSecureCredentialRequest({ headers: { host: '[::1]:3000' } })).toBe(true);
    expect(isSecureCredentialRequest({ headers: { host: 'sell-sheets.example', 'x-forwarded-proto': 'http' } })).toBe(false);
  });

  it('allows same-origin submissions and rejects cross-site submissions', () => {
    expect(isTrustedCredentialOrigin({
      headers: { host: 'sell-sheets.example', origin: 'https://sell-sheets.example', 'x-forwarded-proto': 'https' },
    })).toBe(true);
    expect(isTrustedCredentialOrigin({
      headers: { host: 'sell-sheets.example', origin: 'https://attacker.example', 'x-forwarded-proto': 'https' },
    })).toBe(false);
    expect(isTrustedCredentialOrigin({
      headers: { host: 'sell-sheets.example', 'sec-fetch-site': 'cross-site' },
    })).toBe(false);
  });

  it('replaces raw authentication errors with a safe message', () => {
    expect(safeErrorMessage(new Error('Slingr authentication failed (401).')))
      .toBe('Slingr sign-in failed. Check your email and password.');
    expect(safeErrorMessage(new Error('unexpected internal response: secret')))
      .not.toContain('secret');
    expect(safeErrorMessage(new Error('Slingr 400 Bad Request: No scm.workOrders record found; secret')))
      .not.toContain('secret');
  });

  it('preserves only PO numbers when every source lookup fails', () => {
    expect(safeErrorMessage(new Error('No Slingr records could be generated. Failed POs: 123, 456')))
      .toBe('No Slingr records were found for PO(s): 123, 456.');
  });
});
