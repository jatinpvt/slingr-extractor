import { generateSellSheetBuffer } from './src/services/generateSellSheet.ts';

const po = '24382';

try {
  const buf = await generateSellSheetBuffer(po);
  console.log('OK', buf.length);
} catch (error) {
  console.error('ERROR');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
}
