import { createServer, type ServerResponse } from 'node:http';
import { config, type AppConfig } from './config.js';
import { normalizePoNumber, poNumberFilePart } from './lib/poNumber.js';
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
    .credential-input { width: 100%; margin-bottom: 14px; }
    .password-wrap { position: relative; margin-bottom: 14px; }
    .password-wrap .credential-input { margin-bottom: 0; padding-right: 54px; }
    .password-toggle { position: absolute; top: 6px; right: 6px; min-height: 36px; width: 40px; padding: 0; color: #216b40; background: transparent; font-size: 20px; line-height: 1; }
    .password-toggle:hover { color: #185632; background: #edf5ef; }
    .controls { display: flex; gap: 10px; }
    input, button { min-height: 48px; border-radius: 10px; font: inherit; }
    input { min-width: 0; flex: 1; border: 1px solid #b7c9bd; padding: 0 14px; font-size: 18px; }
    input:focus { outline: 3px solid #a7d9b9; border-color: #287747; }
    button { border: 0; padding: 0 18px; color: white; background: #216b40; font-weight: 750; cursor: pointer; }
    button:hover { background: #185632; }
    button:disabled { opacity: 0.75; cursor: wait; }
    .secondary-button { background: #7a5c32; }
    .secondary-button:hover { background: #5e4526; }
    .joint-progress { display: none; width: 100%; margin-top: 14px; }
    .joint-progress.visible { display: block; }
    .joint-track {
      position: relative; height: 14px; border-radius: 999px; overflow: hidden;
      border: 1px solid rgba(24, 50, 38, 0.14);
      background: linear-gradient(90deg, #edf3ee 0%, #e4eee5 100%);
      box-shadow: inset 0 2px 8px rgba(24, 50, 38, 0.08);
    }
    .joint-burn {
      position: absolute; inset: 0 auto 0 0; width: 0%;
      border-radius: inherit;
      background: linear-gradient(90deg, #183226 0%, #216b40 26%, #3c8d5d 58%, #d9b74d 100%);
      background-size: 200% 100%;
      box-shadow: 0 0 16px rgba(33, 107, 64, 0.24), inset 0 0 18px rgba(255, 255, 255, 0.32);
      transition: width 0.25s ease-out;
      animation: progressShimmer 1.4s linear infinite;
    }
    .joint-burn::after {
      content: '';
      position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
      width: 12px; height: 12px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, #f5e6a9 32%, #d9b74d 60%, rgba(24,50,38,0.7) 100%);
      box-shadow: 0 0 14px rgba(217, 183, 77, 0.7);
    }
    .joint-core {
      position: absolute; left: 8px; top: 2px; width: 32px; height: 10px; border-radius: 999px;
      background: linear-gradient(90deg, rgba(24, 50, 38, 0.82), rgba(94, 129, 94, 0.78));
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.18);
      opacity: 0.8;
    }
    @keyframes progressShimmer {
      0% { background-position: 0% 0%; }
      100% { background-position: 200% 0%; }
    }
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
    <p>Enter your Slingr credentials and a purchase order number. Your Excel file will download when the Slingr data is ready.</p>
    <form id="sell-sheet-form" method="post" action="/sell-sheet">
      <label for="email">Slingr email</label>
      <input class="credential-input" id="email" name="email" type="email" maxlength="254" autocomplete="username" required autofocus>
      <label for="password">Slingr password</label>
      <div class="password-wrap">
        <input class="credential-input" id="password" name="password" type="password" maxlength="512" autocomplete="current-password" required>
        <button class="password-toggle" id="password-toggle" type="button" aria-label="Show password" title="Show password">👁</button>
      </div>
      <label for="poNumber">PO number</label>
      <div class="controls">
        <input id="poNumber" name="poNumber" inputmode="text" maxlength="63" placeholder="24382 or 80316 / 45000038" autocomplete="off" required>
        <button id="submit-button" type="submit">Download Excel</button>
        <button id="stop-button" type="button" class="secondary-button" hidden>Stop</button>
      </div>
      <div id="joint-progress" class="joint-progress" aria-live="polite" aria-label="Generation progress">
        <div class="joint-track">
          <div class="joint-core"></div>
          <div id="joint-burn" class="joint-burn"></div>
        </div>
      </div>
      <p id="form-status" class="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    const form = document.getElementById('sell-sheet-form');
    const submitButton = document.getElementById('submit-button');
    const stopButton = document.getElementById('stop-button');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('password-toggle');
    const status = document.getElementById('form-status');
    const jointProgress = document.getElementById('joint-progress');
    const jointBurn = document.getElementById('joint-burn');
    let activeController = null;
    let activeProgressTimer = null;

    const setStatus = (message, kind = '') => {
      status.textContent = message || '';
      status.className = (kind ? 'status ' + kind : 'status').trim();
    };

    const stopProgress = () => {
      if (activeProgressTimer) {
        cancelAnimationFrame(activeProgressTimer);
      }
      jointBurn.style.width = '0%';
      jointProgress.classList.remove('visible');
    };

    const beginProgress = () => {
      let start = null;
      const duration = 4200;
      stopProgress();
      jointProgress.classList.add('visible');
      const step = (time) => {
        if (start === null) start = time;
        const elapsed = time - start;
        const raw = Math.min(100, (elapsed / duration) * 100);
        const eased = raw;
        jointBurn.style.width = eased + '%';
        if (eased < 100) {
          activeProgressTimer = requestAnimationFrame(step);
        }
      };
      activeProgressTimer = requestAnimationFrame(step);
    };

    const resetControls = () => {
      submitButton.disabled = false;
      submitButton.textContent = 'Download Excel';
      stopButton.hidden = true;
      stopButton.disabled = false;
      passwordInput.value = '';
      passwordInput.type = 'password';
      passwordToggle.setAttribute('aria-label', 'Show password');
      passwordToggle.title = 'Show password';
      if (activeController) {
        activeController = null;
      }
      stopProgress();
    };

    passwordToggle.addEventListener('click', () => {
      const visible = passwordInput.type === 'text';
      passwordInput.type = visible ? 'password' : 'text';
      passwordToggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      passwordToggle.title = visible ? 'Show password' : 'Hide password';
    });

    stopButton.addEventListener('click', () => {
      if (activeController) {
        activeController.abort();
      }
      setStatus('Request stopped.', 'error');
      resetControls();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const email = formData.get('email')?.toString().trim() || '';
      const password = formData.get('password')?.toString() || '';
      const rawPoNumber = formData.get('poNumber')?.toString().trim() || '';
      const poMatch = rawPoNumber.match(/^([0-9]{1,30})(?:[ ]*[/][ ]*([0-9]{1,30}))?$/);
      const poNumber = poMatch ? (poMatch[2] ? poMatch[1] + ' / ' + poMatch[2] : poMatch[1]) : '';
      if (!email || !password) {
        setStatus('Enter your Slingr email and password.', 'error');
        return;
      }
      if (!poNumber) {
        setStatus('Enter a PO number like 24382 or 80316 / 45000038.', 'error');
        return;
      }

      activeController = new AbortController();
      submitButton.disabled = true;
      stopButton.hidden = false;
      submitButton.textContent = 'Generating...';
      setStatus('Creating your sell sheet...', '');
      beginProgress();

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ email, password, poNumber }).toString(),
          signal: activeController.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'The sell sheet could not be generated.');
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = 'sell_sheet_' + poNumber.replace(/[^0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.xlsx';
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        setStatus('Your sell sheet is ready.', 'success');
      } catch (error) {
        if (error && error.name === 'AbortError') {
          setStatus('Download stopped.', 'error');
        } else {
          setStatus(error instanceof Error ? error.message : 'The sell sheet could not be generated.', 'error');
        }
      } finally {
        resetControls();
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

function isPoNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /No scm\.workOrders record found|PO .* could not be found|invalid PO/i.test(error.message)
  );
}

async function generateSellSheetWithPoFallback(
  poNumber: string,
  cfg: AppConfig,
): Promise<{ workbook: Buffer; resolvedPoNumber: string }> {
  try {
    const workbook = await generateSellSheetBuffer(poNumber, cfg);

    return {
      workbook,
      resolvedPoNumber: poNumber,
    };
  } catch (error) {
    if (!isPoNotFoundError(error)) {
      throw error;
    }

    if (poNumber.startsWith('0') || poNumber.includes('/')) {
      throw error;
    }

    const fallbackPoNumber = `0${poNumber}`;

    console.log(
      `PO ${poNumber} was not found in Slingr. Retrying as ${fallbackPoNumber}`,
    );

    try {
      const workbook = await generateSellSheetBuffer(fallbackPoNumber, cfg);

      console.log(
        `PO ${poNumber} resolved successfully as ${fallbackPoNumber}`,
      );

      return {
        workbook,
        resolvedPoNumber: fallbackPoNumber,
      };
    } catch (fallbackError) {
      if (isPoNotFoundError(fallbackError)) {
        throw error;
      }

      throw fallbackError;
    }
  }
}

function getErrorStatus(error: unknown): number {
  if (error instanceof Error && /No scm\.workOrders record found|Multiple work orders returned|invalid PO|Enter a valid PO number/i.test(error.message)) {
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
    if (Buffer.byteLength(body) > 4_096) {
      sendText(response, 413, 'Request is too large.');
      return;
    }
  }

  const form = new URLSearchParams(body);
  const email = form.get('email')?.trim() || '';
  const password = form.get('password') || '';
  const poNumber = normalizePoNumber(form.get('poNumber') || '');
  if (!email || !password || email.length > 254 || password.length > 512) {
    sendText(response, 400, 'Enter valid Slingr credentials.');
    return;
  }
  if (!poNumber) {
    sendText(response, 400, 'Enter a PO number like 24382 or 80316 / 45000038.');
    return;
  }

  try {
    console.log(`Starting sell sheet generation for PO ${poNumber}`);

    const {
      workbook,
      resolvedPoNumber,
    } = await generateSellSheetWithPoFallback(poNumber, { ...config, email, password });

    console.log(
      `Generated sell sheet for PO ${poNumber} using Slingr PO ${resolvedPoNumber} (${workbook.length} bytes)`,
    );

    response.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="sell_sheet_${poNumberFilePart(poNumber)}.xlsx"`,
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
