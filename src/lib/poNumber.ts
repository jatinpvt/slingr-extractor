const PO_NUMBER = /^([0-9]{1,30})(?:\s*\/\s*([0-9]{1,30}))?$/;

export function normalizePoNumber(value: string): string | null {
  const match = value.trim().match(PO_NUMBER);
  if (!match) return null;
  return match[2] ? `${match[1]} / ${match[2]}` : match[1];
}

export function parsePoNumbers(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[\r\n,;]+/)) {
    const poNumber = normalizePoNumber(part);
    if (poNumber) seen.add(poNumber);
  }
  return [...seen];
}

export function poNumberFilePart(value: string): string {
  return value.replace(/[^0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
