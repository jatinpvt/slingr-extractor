import type { OutlookEvent } from '../api/outlookCalendar.js';
import { normalizePoNumber } from '../lib/poNumber.js';

export type SupportedProvince = 'ontario';

function eventText(event: OutlookEvent): string {
  return [
    event.subject,
    event.bodyPreview,
    event.location?.displayName,
    ...(event.categories ?? []),
  ].filter(Boolean).join('\n');
}

function provincePattern(province: SupportedProvince): RegExp {
  if (province === 'ontario') return /\b(?:Ontario|OCS)\b/i;
  return /$a/;
}

export function extractPoNumbers(
  events: OutlookEvent[],
  province: SupportedProvince,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:P\.?O\.?|purchase\s+order)\s*(?:number|no\.?)?\s*[#:\-]?\s*([0-9]{4,30}(?:\s*\/\s*[0-9]{4,30})?)/gi,
    /\b(?:Ontario|OCS)\b[^0-9]{0,24}([0-9]{5,30}(?:\s*\/\s*[0-9]{4,30})?)/gi,
  ];

  for (const event of events) {
    if (event.isCancelled) continue;
    const text = eventText(event);
    if (!provincePattern(province).test(text)) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const poNumber = normalizePoNumber(match[1]);
        if (poNumber && !seen.has(poNumber)) {
          seen.add(poNumber);
          found.push(poNumber);
        }
      }
    }
  }
  return found;
}

export function validateCalendarRange(startDateTime: string, endDateTime: string): void {
  const start = Date.parse(startDateTime);
  const end = Date.parse(endDateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Enter a valid Outlook date range.');
  }
}
