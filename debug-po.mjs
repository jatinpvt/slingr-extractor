import { generateSellSheetBuffer } from './src/services/generateSellSheet.ts';

const po = '24382';
try {
  const buf = await generateSellSheetBuffer(po);
  console.log('OK', buf.length);
} catch (e) {
  console.error('ERROR');
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
}
