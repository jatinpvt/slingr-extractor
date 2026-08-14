#!/usr/bin/env node
import path from 'node:path';
import { generateSellSheet } from './services/generateSellSheet.js';

function usage(): never {
  console.error('Usage: npm run generate -- <PO_NUMBER> [--output path/to/file.xlsx]');
  process.exit(2);
}

function parseArgs(argv: string[]): { poNumber: string; output?: string } {
  const args = [...argv];
  const poNumber = args.shift();
  if (!poNumber) usage();

  let output: string | undefined;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--output' || arg === '-o') {
      const next = args.shift();
      if (!next) usage();
      output = path.resolve(next);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  return { poNumber, output };
}

const { poNumber, output } = parseArgs(process.argv.slice(2));

generateSellSheet(poNumber, output)
  .then((file) => {
    console.log(`Sell sheet created: ${file}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
