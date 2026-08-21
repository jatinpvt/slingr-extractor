const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function applySecurityHeaders(response: { setHeader(name: string, value: string): unknown }): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
}

export function isSecureCredentialRequest(request: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: object;
}): boolean {
  if ((request.socket as { encrypted?: boolean } | undefined)?.encrypted === true) return true;
  const hostHeader = request.headers?.host;
  const rawHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '';
  const host = (rawHost.startsWith('[') ? rawHost.slice(1, rawHost.indexOf(']')) : rawHost.split(':')[0]).toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return true;
  const forwarded = request.headers?.['x-forwarded-proto'];
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim().toLowerCase();
  return protocol === 'https';
}

export function isTrustedCredentialOrigin(request: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: object;
}): boolean {
  const fetchSiteHeader = request.headers?.['sec-fetch-site'];
  const fetchSite = (Array.isArray(fetchSiteHeader) ? fetchSiteHeader[0] : fetchSiteHeader || '').toLowerCase();
  if (fetchSite === 'cross-site') return false;

  const originHeader = request.headers?.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin) return true;

  const hostHeader = request.headers?.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return false;

  try {
    const parsed = new URL(origin);
    const forwarded = request.headers?.['x-forwarded-proto'];
    const protocol = (request.socket as { encrypted?: boolean } | undefined)?.encrypted === true
      ? 'https'
      : (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'http').split(',')[0].trim().toLowerCase();
    return parsed.host.toLowerCase() === host.toLowerCase() && parsed.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/authentication failed|sign-in failed|Slingr 401|Slingr 403/i.test(message)) {
    return 'Slingr sign-in failed. Check your email and password.';
  }
  if (/aborted|timed? out/i.test(message)) return 'Slingr took too long to respond. Try again.';
  const failedBatch = message.match(/^No Slingr records could be generated\. Failed POs: ([0-9 /,]+)$/i);
  if (failedBatch) return `No Slingr records were found for PO(s): ${failedBatch[1].trim()}.`;
  const poNotFound = message.match(/^(?:PO [0-9 /]+: )?No scm\.workOrders record found for PO ([0-9 /]+)(?: using like lookup)?$/i);
  if (poNotFound) return `No Slingr work order was found for PO ${poNotFound[1].trim()}.`;
  const multiplePo = message.match(/^(?:PO )?([0-9 /]+)(?:: )?Multiple work orders returned for PO [0-9 /]+/i)
    || message.match(/^Multiple work orders returned for PO ([0-9 /]+)/i);
  if (multiplePo) return `Multiple Slingr work orders matched PO ${multiplePo[1].trim()}.`;
  if (/^(?:Enter a valid PO number|No valid PO numbers were provided)\.?$/i.test(message)) return message;
  if (/^Invalid delivery date: \d{4}-\d{2}-\d{2}$/i.test(message)) return message;
  if (/^No (?:Ontario\/OCS|Alberta\/AGLC) (?:purchase orders matched|work orders were found for the selected delivery dates?)\.?$/i.test(message)) return message;
  return 'The sell sheet could not be generated. Check the selected inputs and try again.';
}
