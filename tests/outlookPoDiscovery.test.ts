import { describe, expect, it } from 'vitest';
import type { OutlookEvent } from '../src/api/outlookCalendar.js';
import { discoverPurchaseOrders, extractPoNumbers, validateCalendarRange } from '../src/services/outlookPoDiscovery.js';

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

  it('parses AGLC product selections and Full PO sections from the Outlook body', () => {
    const events: OutlookEvent[] = [{
      id: 'aglc',
      subject: 'Alberta sell sheets',
      body: {
        contentType: 'html',
        content: '<p><b>AGLC - PO 80316 / 45000038:</b></p><ul>'
          + '<li>Grapes and Cream Blunt 1g Pre-Roll (1 Pre-Roll in a CR Tube) - 5 Boxes</li>'
          + '<li>Grape Gotti #12 Dried Flower - 7g in a jar - 10 Boxes</li></ul>'
          + '<p><b>AGLC - PO 80244 / 45000037: Full PO</b></p>',
      },
    }];

    expect(discoverPurchaseOrders(events, 'alberta')).toEqual([
      {
        poNumber: '80316 / 45000038',
        requestedProducts: [
          { name: 'Grapes and Cream Blunt 1g Pre-Roll (1 Pre-Roll in a CR Tube)', boxes: 5 },
          { name: 'Grape Gotti #12 Dried Flower - 7g in a jar', boxes: 10 },
        ],
      },
      { poNumber: '80244 / 45000037' },
    ]);
  });

  it('rejects an AGLC section without products or Full PO', () => {
    expect(() => discoverPurchaseOrders([
      { id: 'bad', subject: 'AGLC - PO 80316 / 45000038' },
    ], 'alberta')).toThrow('has no product list');
  });

  it('accepts long ISO ranges and rejects invalid ranges', () => {
    expect(() => validateCalendarRange('2026-08-03T04:00:00.000Z', '2026-08-10T04:00:00.000Z')).not.toThrow();
    expect(() => validateCalendarRange('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')).not.toThrow();
    expect(() => validateCalendarRange('bad', '2026-08-10T04:00:00.000Z')).toThrow('valid Outlook date range');
    expect(() => validateCalendarRange('2026-08-10T04:00:00.000Z', '2026-08-03T04:00:00.000Z')).toThrow('valid Outlook date range');
  });
});
