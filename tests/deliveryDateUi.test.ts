import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PAGE } from '../src/index.js';

describe('delivery-date presets', () => {
  it('shows generated PO sources and omissions from response metadata', () => {
    expect(PAGE).toContain("responseList('x-sell-sheet-work-order-pos')");
    expect(PAGE).toContain("responseList('x-sell-sheet-shipping-store-pos')");
    expect(PAGE).toContain('No eligible approved-brand products: ');
    expect(PAGE).toContain('Could not be generated: ');
  });

  it('uses completed Friday-Thursday weeks and completed calendar months', () => {
    const elements = new Map<string, any>();
    const valueFor = (id: string) => ({
      mode: 'delivery_date',
      'range-type': 'relative',
      'range-count': '1',
      'range-unit': 'weeks',
    })[id] ?? '';
    const document = {
      getElementById(id: string) {
        if (!elements.has(id)) {
          elements.set(id, {
            value: valueFor(id), hidden: false, required: false, textContent: '', className: '',
            classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
          });
        }
        return elements.get(id);
      },
    };
    const script = PAGE.match(/<script>([\s\S]*?)<\/script>/)?.[1]
      ?.replace('const today = new Date();', "const today = new Date('2026-08-19T12:00:00');");
    expect(script).toBeTruthy();
    const context: any = { document, Intl, Date, Number, String };
    vm.runInNewContext(`${script}\nglobalThis.getDates = selectedDeliveryDates;`, context);

    expect(context.getDates()).toEqual([
      '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10',
      '2026-08-11', '2026-08-12', '2026-08-13',
    ]);

    elements.get('range-count').value = '2';
    elements.get('range-unit').value = 'months';
    const months = context.getDates();
    expect([months[0], months.at(-1), months.length]).toEqual(['2026-06-01', '2026-07-31', 61]);
  });
});
