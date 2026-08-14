#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

function shouldRunCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (shouldRunCli()) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.exit(0);
  }

  const { poNumber, output } = parseArgs(args);

  generateSellSheet(poNumber, output)
    .then((file) => {
      console.log(`Sell sheet created: ${file}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : error);
      process.exit(1);
    });
}
