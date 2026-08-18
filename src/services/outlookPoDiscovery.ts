import type { OutlookEvent } from '../api/outlookCalendar.js';
import { normalizePoNumber } from '../lib/poNumber.js';
import type { PurchaseOrderSelection, RequestedProduct, SellSheetProvince } from '../types.js';

export type SupportedProvince = SellSheetProvince;

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|infin);/gi, (_, entity: string) => ({
      nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", infin: '∞',
    })[entity.toLowerCase()] ?? _);
}

function bodyText(event: OutlookEvent): string {
  const body = event.body?.content ?? '';
  if (!body) return '';
  if (event.body?.contentType?.toLowerCase() !== 'html') return body;
  return decodeHtml(body
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function eventText(event: OutlookEvent): string {
  return [
    event.subject,
    event.bodyPreview,
    bodyText(event),
    event.location?.displayName,
    ...(event.categories ?? []),
  ].filter(Boolean).join('\n');
}

function provincePattern(province: SupportedProvince): RegExp {
  return province === 'ontario' ? /\b(?:Ontario|OCS)\b/i : /\b(?:Alberta|AGLC)\b/i;
}

function ontarioSelections(events: OutlookEvent[]): PurchaseOrderSelection[] {
  const found: PurchaseOrderSelection[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:P\.?O\.?|purchase\s+order)\s*(?:number|no\.?)?\s*[#:\-]?\s*([0-9]{4,30}(?:\s*\/\s*[0-9]{4,30})?)/gi,
    /\b(?:Ontario|OCS)\b[^0-9]{0,24}([0-9]{5,30}(?:\s*\/\s*[0-9]{4,30})?)/gi,
  ];
  for (const event of events) {
    if (event.isCancelled) continue;
    const text = eventText(event);
    if (!provincePattern('ontario').test(text)) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const poNumber = normalizePoNumber(match[1]);
        if (poNumber && !seen.has(poNumber)) {
          seen.add(poNumber);
          found.push({ poNumber });
        }
      }
    }
  }
  return found;
}

const AGLC_HEADER = /\b(?:AGLC|Alberta)\s*[-–—:]?\s*(?:P\.?O\.?|purchase\s+order)\s*(?:number|no\.?)?\s*[#:\-]?\s*([0-9]{4,30}(?:\s*\/\s*[0-9]{4,30})?)/gi;

function requestedProducts(segment: string): RequestedProduct[] {
  const products: RequestedProduct[] = [];
  for (const rawLine of segment.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s•▪◦*-]+/, '').trim();
    const match = line.match(/^(.*?)\s+-\s+([\d,]+)\s+Boxes?\s*$/i);
    const boxes = match ? Number(match[2].replace(/,/g, '')) : NaN;
    if (match?.[1].trim() && Number.isFinite(boxes)) products.push({ name: match[1].trim(), boxes });
  }
  return products;
}

function albertaSelections(events: OutlookEvent[]): PurchaseOrderSelection[] {
  const found = new Map<string, PurchaseOrderSelection>();
  for (const event of events) {
    if (event.isCancelled) continue;
    const text = eventText(event);
    if (!provincePattern('alberta').test(text)) continue;
    const headers = [...text.matchAll(AGLC_HEADER)];
    for (let index = 0; index < headers.length; index += 1) {
      const poNumber = normalizePoNumber(headers[index][1]);
      if (!poNumber) continue;
      const start = (headers[index].index ?? 0) + headers[index][0].length;
      const end = headers[index + 1]?.index ?? text.length;
      const segment = text.slice(start, end);
      const fullPo = /\bfull\s*P\.?O\.?\b/i.test(segment);
      const products = fullPo ? undefined : requestedProducts(segment);
      const current = found.get(poNumber);
      if (fullPo || (current && current.requestedProducts === undefined)) {
        found.set(poNumber, { poNumber });
      } else {
        const merged = [...(current?.requestedProducts ?? []), ...(products ?? [])];
        const unique = [...new Map(merged.map((product) => [
          `${product.name.toLocaleLowerCase()}\0${product.boxes}`,
          product,
        ])).values()];
        found.set(poNumber, { poNumber, requestedProducts: unique });
      }
    }
  }
  for (const selection of found.values()) {
    if (selection.requestedProducts?.length === 0) {
      throw new Error(`AGLC PO ${selection.poNumber} has no product list and is not marked Full PO.`);
    }
  }
  return [...found.values()];
}

export function discoverPurchaseOrders(
  events: OutlookEvent[],
  province: SupportedProvince,
): PurchaseOrderSelection[] {
  return province === 'alberta' ? albertaSelections(events) : ontarioSelections(events);
}

export function extractPoNumbers(events: OutlookEvent[], province: SupportedProvince): string[] {
  return discoverPurchaseOrders(events, province).map((selection) => selection.poNumber);
}

export function validateCalendarRange(startDateTime: string, endDateTime: string): void {
  const start = Date.parse(startDateTime);
  const end = Date.parse(endDateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Enter a valid Outlook date range.');
  }
}
