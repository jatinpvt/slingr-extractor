import type { OutlookConfig } from '../config.js';

export type OutlookEvent = {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  categories?: string[];
  location?: { displayName?: string | null } | null;
  start?: { dateTime?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; timeZone?: string | null } | null;
  isCancelled?: boolean;
};

type GraphPage<T> = {
  value?: T[];
  '@odata.nextLink'?: string;
};

function requireOutlookConfig(cfg: OutlookConfig): void {
  const missing = [
    ['MICROSOFT_TENANT_ID', cfg.tenantId],
    ['MICROSOFT_CLIENT_ID', cfg.clientId],
    ['MICROSOFT_CLIENT_SECRET', cfg.clientSecret],
    ['OUTLOOK_CALENDAR_USER', cfg.calendarUser],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Outlook integration is not configured: ${missing.join(', ')}`);
}

async function getAccessToken(cfg: OutlookConfig): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  if (!response.ok) throw new Error(`Microsoft sign-in failed (${response.status}).`);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Microsoft sign-in returned no access token.');
  return body.access_token;
}

export async function getOutlookCalendarEvents(
  cfg: OutlookConfig,
  startDateTime: string,
  endDateTime: string,
): Promise<OutlookEvent[]> {
  requireOutlookConfig(cfg);
  const token = await getAccessToken(cfg);
  const user = encodeURIComponent(cfg.calendarUser);
  const calendar = cfg.calendarId ? `/calendars/${encodeURIComponent(cfg.calendarId)}` : '';
  const url = new URL(`https://graph.microsoft.com/v1.0/users/${user}${calendar}/calendarView`);
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime', endDateTime);
  url.searchParams.set('$select', 'id,subject,bodyPreview,categories,location,start,end,isCancelled');
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '250');

  const events: OutlookEvent[] = [];
  let next: string | undefined = url.toString();
  let pages = 0;
  while (next) {
    const response = await fetch(next, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Outlook calendar request failed (${response.status}).`);
    const body = await response.json() as GraphPage<OutlookEvent>;
    events.push(...(body.value ?? []));
    next = body['@odata.nextLink'];
    pages += 1;
    if (pages > 100) throw new Error('Outlook calendar pagination safety limit reached.');
  }
  return events;
}
