import { generateSellSheetBuffer } from '../dist/src/services/generateSellSheet.js';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 1024) {
        reject(new Error('Request is too large.'));
      }
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parsePoNumber(body) {
  if (!body) return '';

  if (typeof body === 'string') {
    return new URLSearchParams(body).get('poNumber')?.trim() || '';
  }

  if (typeof body === 'object') {
    return String(body.poNumber ?? body.po ?? '').trim();
  }

  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed.');
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const rawBody = await readRawBody(req);
      body = rawBody ? Object.fromEntries(new URLSearchParams(rawBody)) : {};
    }

    const poNumber = parsePoNumber(body);
    if (!/^\d{1,30}$/.test(poNumber)) {
      res.status(400).send('Enter a valid numeric PO number.');
      return;
    }

    const workbook = await generateSellSheetBuffer(poNumber);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sell_sheet_${poNumber}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(workbook);
  } catch (error) {
    console.error('Vercel sell-sheet generation failed:', error);
    res.status(500).send('The sell sheet could not be generated. Check the PO number and try again.');
  }
}
