import { createServer, type ServerResponse } from 'node:http';
import { config, outlookConfig } from './config.js';
import { parsePoNumbers, poNumberFilePart } from './lib/poNumber.js';
import { generateBatchSellSheetBuffer } from './services/generateSellSheet.js';
import { generateOutlookSellSheetBuffer } from './services/generateOutlookSellSheet.js';

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
    input, select, textarea, button { min-height: 48px; border-radius: 10px; font: inherit; }
    input, select, textarea { min-width: 0; flex: 1; border: 1px solid #b7c9bd; padding: 0 14px; font-size: 18px; background: white; }
    textarea { min-height: 116px; padding-block: 12px; resize: vertical; }
    input:focus, select:focus, textarea:focus { outline: 3px solid #a7d9b9; border-color: #287747; }
    .date-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
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
    .hint { margin: -4px 0 14px; font-size: 14px; }
    @media (max-width: 480px) { main { padding: 28px 22px; } .controls { flex-direction: column; } .date-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Weed Me × Slingr</p>
    <h1>Create a sell sheet</h1>
    <p>Combine any PO numbers, or find Ontario POs from an Outlook calendar period.</p>
    <form id="sell-sheet-form" method="post" action="/api/sell-sheet">
      <label for="email">Slingr email</label>
      <input class="credential-input" id="email" name="email" type="email" maxlength="254" autocomplete="username" required autofocus>
      <label for="password">Slingr password</label>
      <div class="password-wrap">
        <input class="credential-input" id="password" name="password" type="password" maxlength="512" autocomplete="current-password" required>
        <button class="password-toggle" id="password-toggle" type="button" aria-label="Show password" title="Show password">👁</button>
      </div>
      <label for="mode">Source</label>
      <select class="credential-input" id="mode" name="mode">
        <option value="manual">Enter PO numbers</option>
        <option value="outlook">Outlook calendar</option>
      </select>
      <div id="manual-fields">
        <label for="poNumbers">PO numbers</label>
        <textarea class="credential-input" id="poNumbers" name="poNumbers" inputmode="text" placeholder="One per line, or separated by commas&#10;24382&#10;109418&#10;80316 / 45000038" autocomplete="off" required></textarea>
      </div>
      <div id="outlook-fields" hidden>
        <label for="province">Province</label>
        <select class="credential-input" id="province" name="province">
          <option value="ontario">Ontario / OCS</option>
        </select>
        <label for="range-type">Date range</label>
        <select class="credential-input" id="range-type" name="rangeType">
          <option value="last_week">Last week</option>
          <option value="last_month">Last month</option>
          <option value="last_n_weeks">Last X weeks</option>
          <option value="last_n_months">Last X months</option>
          <option value="custom">Custom date range</option>
        </select>
        <div id="range-count-fields" hidden>
          <label id="range-count-label" for="range-count">Number of weeks</label>
          <input class="credential-input" id="range-count" name="rangeCount" type="number" min="1" max="520" value="2">
        </div>
        <div id="custom-range-fields" class="date-grid" hidden>
          <div>
            <label for="custom-start">Start date</label>
            <input class="credential-input" id="custom-start" name="customStart" type="date">
          </div>
          <div>
            <label for="custom-end">End date</label>
            <input class="credential-input" id="custom-end" name="customEnd" type="date">
          </div>
        </div>
        <p id="outlook-range" class="hint"></p>
      </div>
      <div class="controls">
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
    const modeInput = document.getElementById('mode');
    const poInput = document.getElementById('poNumbers');
    const manualFields = document.getElementById('manual-fields');
    const outlookFields = document.getElementById('outlook-fields');
    const rangeTypeInput = document.getElementById('range-type');
    const rangeCountFields = document.getElementById('range-count-fields');
    const rangeCountLabel = document.getElementById('range-count-label');
    const rangeCountInput = document.getElementById('range-count');
    const customRangeFields = document.getElementById('custom-range-fields');
    const customStartInput = document.getElementById('custom-start');
    const customEndInput = document.getElementById('custom-end');
    const outlookRange = document.getElementById('outlook-range');
    const status = document.getElementById('form-status');
    const jointProgress = document.getElementById('joint-progress');
    const jointBurn = document.getElementById('joint-burn');
    let activeController = null;
    let activeProgressTimer = null;

    const selectedRange = () => {
      const today = new Date();
      const currentMonday = new Date(today);
      currentMonday.setHours(0, 0, 0, 0);
      currentMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const type = rangeTypeInput.value;
      let start;
      let end;
      if (type === 'custom') {
        if (!customStartInput.value || !customEndInput.value) return null;
        start = new Date(customStartInput.value + 'T00:00:00');
        end = new Date(customEndInput.value + 'T00:00:00');
        end.setDate(end.getDate() + 1);
      } else if (type === 'last_month' || type === 'last_n_months') {
        const count = type === 'last_month' ? 1 : Number(rangeCountInput.value);
        if (!Number.isInteger(count) || count < 1) return null;
        end = currentMonth;
        start = new Date(end.getFullYear(), end.getMonth() - count, 1);
      } else {
        const count = type === 'last_week' ? 1 : Number(rangeCountInput.value);
        if (!Number.isInteger(count) || count < 1) return null;
        end = currentMonday;
        start = new Date(end);
        start.setDate(start.getDate() - (7 * count));
      }
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
      return { start, end };
    };

    const updateRange = () => {
      const type = rangeTypeInput.value;
      const usesCount = type === 'last_n_weeks' || type === 'last_n_months';
      const custom = type === 'custom';
      rangeCountFields.hidden = !usesCount;
      customRangeFields.hidden = !custom;
      rangeCountInput.required = usesCount;
      customStartInput.required = custom;
      customEndInput.required = custom;
      rangeCountLabel.textContent = type === 'last_n_months' ? 'Number of months' : 'Number of weeks';
      const range = selectedRange();
      if (!range) {
        outlookRange.textContent = custom ? 'Choose both start and end dates.' : 'Enter a valid period.';
        return;
      }
      const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
      outlookRange.textContent = display.format(range.start) + ' through ' + display.format(new Date(range.end.getTime() - 1));
    };

    const updateMode = () => {
      const outlook = modeInput.value === 'outlook';
      manualFields.hidden = outlook;
      outlookFields.hidden = !outlook;
      poInput.required = !outlook;
      if (outlook) {
        updateRange();
      } else {
        rangeCountInput.required = false;
        customStartInput.required = false;
        customEndInput.required = false;
      }
    };

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

    modeInput.addEventListener('change', updateMode);
    rangeTypeInput.addEventListener('change', updateRange);
    rangeCountInput.addEventListener('input', updateRange);
    customStartInput.addEventListener('change', updateRange);
    customEndInput.addEventListener('change', updateRange);
    updateMode();

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
      const mode = formData.get('mode') === 'outlook' ? 'outlook' : 'manual';
      const rawPoNumbers = formData.get('poNumbers')?.toString().trim() || '';
      const poNumbers = rawPoNumbers.replace(/[,;]+/g, String.fromCharCode(10))
        .split(String.fromCharCode(10)).map((value) => value.trim()).filter(Boolean);
      const validPoNumbers = poNumbers.filter((value) => /^([0-9]{1,30})(?:[ ]*[/][ ]*([0-9]{1,30}))?$/.test(value));
      if (!email || !password) {
        setStatus('Enter your Slingr email and password.', 'error');
        return;
      }
      if (mode === 'manual' && (validPoNumbers.length === 0 || validPoNumbers.length !== poNumbers.length)) {
        setStatus('Enter valid PO numbers, one per line or separated by commas.', 'error');
        return;
      }

      const request = { email, password, mode };
      let range = null;
      if (mode === 'manual') {
        request.poNumbers = rawPoNumbers;
      } else {
        range = selectedRange();
        if (!range) {
          setStatus('Enter a valid Outlook date range.', 'error');
          return;
        }
        request.province = 'ontario';
        request.startDateTime = range.start.toISOString();
        request.endDateTime = range.end.toISOString();
      }

      activeController = new AbortController();
      submitButton.disabled = true;
      stopButton.hidden = false;
      submitButton.textContent = 'Generating...';
      setStatus(mode === 'outlook' ? 'Finding Ontario POs in Outlook...' : 'Creating a sell sheet from ' + poNumbers.length + ' PO(s)...', '');
      beginProgress();

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams(request).toString(),
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
        anchor.download = mode === 'outlook'
          ? 'sell_sheet_ontario_' + range.start.toISOString().slice(0, 10) + '_' + new Date(range.end.getTime() - 1).toISOString().slice(0, 10) + '.xlsx'
          : validPoNumbers.length === 1
          ? 'sell_sheet_' + validPoNumbers[0].replace(/[^0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.xlsx'
          : 'sell_sheet_' + validPoNumbers.length + '_pos.xlsx';
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

  if (request.method !== 'POST' || (pathname !== '/sell-sheet' && pathname !== '/api/sell-sheet')) {
    sendText(response, 404, 'Not found.');
    return;
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 65_536) {
      sendText(response, 413, 'Request is too large.');
      return;
    }
  }

  const form = new URLSearchParams(body);
  const email = form.get('email')?.trim() || '';
  const password = form.get('password') || '';
  const mode = form.get('mode') === 'outlook' ? 'outlook' : 'manual';
  const poNumbers = parsePoNumbers(form.get('poNumbers') || form.get('poNumber') || '');
  if (!email || !password || email.length > 254 || password.length > 512) {
    sendText(response, 400, 'Enter valid Slingr credentials.');
    return;
  }
  if (mode === 'manual' && poNumbers.length === 0) {
    sendText(response, 400, 'Enter valid PO numbers, one per line or separated by commas.');
    return;
  }

  try {
    const filename = mode === 'outlook'
      ? `sell_sheet_ontario_${(form.get('startDateTime') || '').slice(0, 10)}_${(form.get('endDateTime') || '').slice(0, 10)}.xlsx`
      : poNumbers.length === 1
      ? `sell_sheet_${poNumberFilePart(poNumbers[0])}.xlsx`
      : `sell_sheet_${poNumbers.length}_pos.xlsx`;
    let workbook: Buffer;
    if (mode === 'outlook') {
      console.log('Starting Outlook sell sheet generation for Ontario');
      const result = await generateOutlookSellSheetBuffer({
        startDateTime: form.get('startDateTime') || '',
        endDateTime: form.get('endDateTime') || '',
        province: 'ontario',
        slingrConfig: { ...config, email, password },
        outlookConfig,
      });
      workbook = result.workbook;
      console.log(`Generated Outlook sell sheet from ${result.poNumbers.length} PO(s); skipped ${result.skippedPoNumbers.length}.`);
    } else {
      console.log(`Starting sell sheet generation for ${poNumbers.length} PO(s)`);
      const result = await generateBatchSellSheetBuffer(poNumbers, undefined, { ...config, email, password });
      workbook = result.workbook;
      console.log(`Generated sell sheet for ${result.resolvedPoNumbers.length} PO(s) (${workbook.length} bytes)`);
    }

    response.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': workbook.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(workbook);
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Failed to generate ${mode === 'outlook' ? 'Outlook sell sheet' : `${poNumbers.length} PO(s)`}:`, error instanceof Error ? error.stack || message : error);
    const status = getErrorStatus(error);
    const userMessage = mode === 'outlook'
      ? `The Outlook sell sheet could not be generated: ${message}`
      : status === 404
      ? `One or more of the ${poNumbers.length} PO(s) could not be found in Slingr.`
      : `The sell sheet could not be generated for ${poNumbers.length} PO(s): ${message}`;
    sendText(response, status, userMessage);
  }
});

server.listen(port, host, () => {
  console.log(`Sell sheet app: http://${host}:${port}`);
});
