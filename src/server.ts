import { createServer, type ServerResponse } from 'node:http';
import { generateSellSheetBuffer } from './services/generateSellSheet.js';

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weed Me Sell Sheet</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; color: #183226; background: #eef4ef; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 520px); padding: 40px; background: white; border-radius: 20px; box-shadow: 0 20px 60px #1832261f; }
    .eyebrow { margin: 0 0 10px; color: #2f7650; font-size: 13px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0 0 12px; font-size: clamp(28px, 7vw, 42px); line-height: 1.05; }
    p { color: #557064; line-height: 1.55; }
    form { margin-top: 28px; }
    label { display: block; margin-bottom: 8px; font-weight: 750; }
    .controls { display: flex; gap: 10px; }
    input, button { min-height: 48px; border-radius: 10px; font: inherit; }
    input { min-width: 0; flex: 1; border: 1px solid #b7c9bd; padding: 0 14px; font-size: 18px; }
    input:focus { outline: 3px solid #a7d9b9; border-color: #287747; }
    button { border: 0; padding: 0 18px; color: white; background: #216b40; font-weight: 750; cursor: pointer; }
    button:hover { background: #185632; }
    button:disabled { opacity: 0.75; cursor: wait; }
    .status { min-height: 22px; margin-top: 12px; color: #2f7650; font-weight: 700; }
    .status.error { color: #8b1d1d; }
    .status.success { color: #226c44; }
    @media (max-width: 480px) { main { padding: 28px 22px; } .controls { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Weed Me × Slingr</p>
    <h1>Create a sell sheet</h1>
    <p>Enter an OCS purchase order number. Your Excel file will download when the Slingr data is ready.</p>
    <form id="sell-sheet-form" method="post" action="/sell-sheet">
      <label for="poNumber">PO number</label>
      <div class="controls">
        <input id="poNumber" name="poNumber" inputmode="numeric" pattern="[0-9]+" maxlength="30" placeholder="e.g. 24382" autocomplete="off" required autofocus>
        <button id="submit-button" type="submit">Download Excel</button>
      </div>
      <p id="form-status" class="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    const form = document.getElementById('sell-sheet-form');
    const submitButton = document.getElementById('submit-button');
    const status = document.getElementById('form-status');
    const setStatus = (message, kind = '') => {
      status.textContent = message || '';
      status.className = (kind ? 'status ' + kind : 'status').trim();
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const poNumber = new FormData(form).get('poNumber')?.toString().trim() || '';
      if (!/^[0-9]{1,30}$/.test(poNumber)) {
        setStatus('Enter a valid numeric PO number.', 'error');
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Generating...';
      setStatus('Creating your sell sheet...', '');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ poNumber }).toString(),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'The sell sheet could not be generated.');
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = 'sell_sheet_' + poNumber + '.xlsx';
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        setStatus('Your sell sheet is ready.', 'success');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The sell sheet could not be generated.', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Download Excel';
      }
    });
  </script>
</body>
</html>`;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorStatus(error: unknown): number {
  if (error instanceof Error && /No scm\.workOrders record found|Multiple work orders returned|invalid PO|Enter a valid numeric PO number/i.test(error.message)) {
    return 404;
  }
  return 500;
}

const host = '127.0.0.1';
const port = Number(process.env.SELL_SHEET_PORT || '3000');
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('SELL_SHEET_PORT must be a number between 1 and 65535.');
}

function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(message);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;

  if (request.method === 'GET' && pathname === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(PAGE);
    return;
  }

  if (request.method !== 'POST' || pathname !== '/sell-sheet') {
    sendText(response, 404, 'Not found.');
    return;
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1_024) {
      sendText(response, 413, 'Request is too large.');
      return;
    }
  }

  const poNumber = new URLSearchParams(body).get('poNumber')?.trim() || '';
  if (!/^\d{1,30}$/.test(poNumber)) {
    sendText(response, 400, 'Enter a valid numeric PO number.');
    return;
  }

  try {
    console.log(`Starting sell sheet generation for PO ${poNumber}`);
    const workbook = await generateSellSheetBuffer(poNumber);
    console.log(`Generated sell sheet for PO ${poNumber} (${workbook.length} bytes)`);
    response.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="sell_sheet_${poNumber}.xlsx"`,
      'content-length': workbook.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(workbook);
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Failed to generate PO ${poNumber}:`, error instanceof Error ? error.stack || message : error);
    const status = getErrorStatus(error);
    const userMessage = status === 404
      ? `The PO ${poNumber} could not be found in Slingr.`
      : `The sell sheet could not be generated for PO ${poNumber}: ${message}`;
    sendText(response, status, userMessage);
  }
});

server.listen(port, host, () => {
  console.log(`Sell sheet app: http://${host}:${port}`);
});
