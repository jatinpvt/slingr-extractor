import { getOutlookCalendarEvents } from '../api/outlookCalendar.js';
import type { AppConfig, OutlookConfig } from '../config.js';
import { discoverPurchaseOrders, type SupportedProvince, validateCalendarRange } from './outlookPoDiscovery.js';
import { generateBatchSellSheetBuffer } from './generateSellSheet.js';

export async function generateOutlookSellSheetBuffer(args: {
  startDateTime: string;
  endDateTime: string;
  province: SupportedProvince;
  slingrConfig: AppConfig;
  outlookConfig: OutlookConfig;
}): Promise<{ workbook: Buffer; poNumbers: string[]; skippedPoNumbers: string[] }> {
  validateCalendarRange(args.startDateTime, args.endDateTime);
  const events = await getOutlookCalendarEvents(args.outlookConfig, args.startDateTime, args.endDateTime);
  const selections = discoverPurchaseOrders(events, args.province);
  if (selections.length === 0) {
    throw new Error(`No ${args.province === 'ontario' ? 'Ontario/OCS' : 'Alberta/AGLC'} PO numbers were found in Outlook for that period.`);
  }
  const result = await generateBatchSellSheetBuffer(selections, args.province, args.slingrConfig);
  return {
    workbook: result.workbook,
    poNumbers: result.resolvedPoNumbers,
    skippedPoNumbers: result.skippedPoNumbers,
  };
}
