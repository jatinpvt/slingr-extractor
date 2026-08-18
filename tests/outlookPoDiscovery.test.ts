import { describe, expect, it } from 'vitest';
import type { OutlookEvent } from '../src/api/outlookCalendar.js';
import { extractPoNumbers, validateCalendarRange } from '../src/services/outlookPoDiscovery.js';

describe('Outlook PO discovery', () => {
  it('extracts unique Ontario POs while ignoring other provinces and cancelled events', () => {
    const events: OutlookEvent[] = [
      { id: '1', subject: 'OCS PO 109418' },
      { id: '2', subject: 'Ontario Purchase Order #80316 / 45000038' },
      { id: '3', subject: 'Alberta PO 77777' },
      { id: '4', subject: 'OCS PO 109418', isCancelled: true },
      { id: '5', subject: 'Launch meeting', bodyPreview: 'Ontario — P.O. 24382' },
      { id: '6', subject: 'Ontario forecast for 2026-08-17' },
    ];

    expect(extractPoNumbers(events, 'ontario')).toEqual([
      '109418',
      '80316 / 45000038',
      '24382',
    ]);
  });

  it('accepts long ISO ranges and rejects invalid ranges', () => {
    expect(() => validateCalendarRange('2026-08-03T04:00:00.000Z', '2026-08-10T04:00:00.000Z')).not.toThrow();
    expect(() => validateCalendarRange('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')).not.toThrow();
    expect(() => validateCalendarRange('bad', '2026-08-10T04:00:00.000Z')).toThrow('valid Outlook date range');
    expect(() => validateCalendarRange('2026-08-10T04:00:00.000Z', '2026-08-03T04:00:00.000Z')).toThrow('valid Outlook date range');
  });
});
