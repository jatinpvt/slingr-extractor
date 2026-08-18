import { getOutlookCalendarEvents } from '../api/outlookCalendar.js';
import type { AppConfig, OutlookConfig } from '../config.js';
import { extractPoNumbers, type SupportedProvince, validateCalendarRange } from './outlookPoDiscovery.js';
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
  const poNumbers = extractPoNumbers(events, args.province);
  if (poNumbers.length === 0) throw new Error('No Ontario/OCS PO numbers were found in Outlook for that period.');
  const result = await generateBatchSellSheetBuffer(poNumbers, args.province, args.slingrConfig);
  return {
    workbook: result.workbook,
    poNumbers: result.resolvedPoNumbers,
    skippedPoNumbers: result.skippedPoNumbers,
  };
}
