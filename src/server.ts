import { createServer, type ServerResponse } from 'node:http';
import { config } from './config.js';
import { applySecurityHeaders, isTrustedCredentialOrigin, safeErrorMessage } from './lib/httpSecurity.js';
import { parsePoNumbers, poNumberFilePart } from './lib/poNumber.js';
import { generateBatchSellSheetBuffer, generateDeliveryDateSellSheetBuffer } from './services/generateSellSheet.js';

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
    .date-grid[hidden] { display: none; }
    button { border: 0; padding: 0 18px; color: white; background: #216b40; font-weight: 750; cursor: pointer; }
    button:hover { background: #185632; }
    button:disabled { opacity: 0.75; cursor: wait; }
    .secondary-button { background: #7a5c32; }
    .secondary-button:hover { background: #5e4526; }
    .generation-loader {
      display: none; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 14px;
      border: 1px solid #d5e4d9; border-radius: 12px; color: #216b40; background: #f4f8f5; font-weight: 700;
    }
    .generation-loader.visible { display: flex; }
    .loading-spinner {
      width: 28px; height: 28px; flex: 0 0 28px; border: 4px solid #d8e7dc; border-radius: 50%;
      border-top-color: #216b40; border-right-color: #d9b74d; box-shadow: 0 0 12px rgba(33, 107, 64, 0.12);
      animation: loaderSpin 0.8s linear infinite;
    }
    @keyframes loaderSpin { to { transform: rotate(360deg); } }
    .status { min-height: 22px; margin-top: 12px; color: #2f7650; font-weight: 700; }
    .status.error { color: #8b1d1d; }
    .status.success { color: #226c44; }
    .status.warning { color: #8a5a00; }
    .hint { margin: -4px 0 14px; font-size: 14px; }
    @media (max-width: 480px) { main { padding: 28px 22px; } .controls { flex-direction: column; } .date-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Weed Me × Slingr</p>
    <h1>Create a sell sheet</h1>
    <p>Enter PO numbers, or find work orders by their Slingr delivery date.</p>
    <form id="sell-sheet-form" method="post" action="/api/sell-sheet">
      <label for="email">Slingr email</label>
      <input class="credential-input" id="email" name="email" type="email" maxlength="254" autocomplete="username" required autofocus>
      <label for="password">Slingr password</label>
      <div class="password-wrap">
        <input class="credential-input" id="password" name="password" type="password" maxlength="512" autocomplete="current-password" required>
        <button class="password-toggle" id="password-toggle" type="button" aria-label="Show password" title="Show password">👁</button>
      </div>
      <label for="province">Province</label>
      <select class="credential-input" id="province" name="province">
        <option value="ontario">Ontario / OCS</option>
        <option value="alberta">Alberta / AGLC</option>
      </select>
      <label for="mode">Source</label>
      <select class="credential-input" id="mode" name="mode">
        <option value="manual">Enter PO numbers</option>
        <option value="delivery_date">Delivery date</option>
      </select>
      <div id="manual-fields">
        <label for="poNumbers">PO numbers</label>
        <textarea class="credential-input" id="poNumbers" name="poNumbers" inputmode="text" placeholder="One per line, or separated by commas&#10;24382&#10;109418&#10;80316 / 45000038" autocomplete="off" required></textarea>
      </div>
      <div id="delivery-date-fields" hidden>
        <label for="range-type">Delivery date</label>
        <select class="credential-input" id="range-type" name="rangeType">
          <option value="relative">Last completed week(s) / month(s)</option>
          <option value="custom">Custom date range</option>
        </select>
        <div id="relative-date-field" class="date-grid">
          <div>
            <label for="range-count">Number</label>
            <input class="credential-input" id="range-count" name="rangeCount" type="number" min="1" max="12" value="1">
          </div>
          <div>
            <label for="range-unit">Period</label>
            <select class="credential-input" id="range-unit" name="rangeUnit">
              <option value="weeks">Week(s), Fri-Thu</option>
              <option value="months">Calendar month(s)</option>
            </select>
          </div>
        </div>
        <div id="custom-date-field" class="date-grid" hidden>
          <div>
            <label for="custom-start">Start date</label>
            <input class="credential-input" id="custom-start" name="customStart" type="date">
          </div>
          <div>
            <label for="custom-end">End date</label>
            <input class="credential-input" id="custom-end" name="customEnd" type="date">
          </div>
        </div>
        <p id="delivery-date-summary" class="hint"></p>
      </div>
      <div class="controls">
        <button id="submit-button" type="submit">Download Excel</button>
        <button id="stop-button" type="button" class="secondary-button" hidden>Stop</button>
      </div>
      <div id="generation-loader" class="generation-loader" role="status" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>Preparing your Excel file…</span>
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
    const provinceInput = document.getElementById('province');
    const modeInput = document.getElementById('mode');
    const poInput = document.getElementById('poNumbers');
    const manualFields = document.getElementById('manual-fields');
    const deliveryDateFields = document.getElementById('delivery-date-fields');
    const rangeTypeInput = document.getElementById('range-type');
    const relativeDateField = document.getElementById('relative-date-field');
    const rangeCountInput = document.getElementById('range-count');
    const rangeUnitInput = document.getElementById('range-unit');
    const customDateField = document.getElementById('custom-date-field');
    const customStartInput = document.getElementById('custom-start');
    const customEndInput = document.getElementById('custom-end');
    const deliveryDateSummary = document.getElementById('delivery-date-summary');
    const status = document.getElementById('form-status');
    const generationLoader = document.getElementById('generation-loader');
    let activeController = null;

    const dateValue = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');

    const datesBetween = (start, end) => {
      const dates = [];
      for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) dates.push(dateValue(date));
      return dates;
    };

    const selectedDeliveryDates = () => {
      if (rangeTypeInput.value === 'custom') {
        if (!customStartInput.value || !customEndInput.value) return [];
        const start = new Date(customStartInput.value + 'T00:00:00');
        const end = new Date(customEndInput.value + 'T00:00:00');
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
        return datesBetween(start, end);
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const count = Number.parseInt(rangeCountInput.value, 10);
      if (!Number.isInteger(count) || count < 1 || count > 12) return [];
      if (rangeUnitInput.value === 'months') {
        const start = new Date(today.getFullYear(), today.getMonth() - count, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return datesBetween(start, end);
      }
      const currentFriday = new Date(today);
      currentFriday.setDate(today.getDate() - ((today.getDay() + 2) % 7));
      const start = new Date(currentFriday);
      start.setDate(currentFriday.getDate() - count * 7);
      const end = new Date(currentFriday);
      end.setDate(currentFriday.getDate() - 1);
      return datesBetween(start, end);
    };

    const updateDeliveryDate = () => {
      const custom = rangeTypeInput.value === 'custom';
      relativeDateField.hidden = custom;
      customDateField.hidden = !custom;
      rangeCountInput.required = !custom && modeInput.value === 'delivery_date';
      customStartInput.required = custom && modeInput.value === 'delivery_date';
      customEndInput.required = custom && modeInput.value === 'delivery_date';
      const dates = selectedDeliveryDates();
      if (dates.length === 0) {
        deliveryDateSummary.textContent = custom ? 'Choose a valid start and end date.' : 'Enter a number from 1 to 12.';
        return;
      }
      const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
      const first = new Date(dates[0] + 'T00:00:00');
      const last = new Date(dates[dates.length - 1] + 'T00:00:00');
      deliveryDateSummary.textContent = dates.length === 1
        ? display.format(first)
        : display.format(first) + ' through ' + display.format(last);
    };

    const updateMode = () => {
      const byDate = modeInput.value === 'delivery_date';
      manualFields.hidden = byDate;
      deliveryDateFields.hidden = !byDate;
      poInput.required = !byDate;
      if (byDate) {
        updateDeliveryDate();
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
      generationLoader.classList.remove('visible');
    };

    const beginProgress = () => {
      stopProgress();
      generationLoader.classList.add('visible');
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
    rangeTypeInput.addEventListener('change', updateDeliveryDate);
    rangeCountInput.addEventListener('input', updateDeliveryDate);
    rangeUnitInput.addEventListener('change', updateDeliveryDate);
    customStartInput.addEventListener('change', updateDeliveryDate);
    customEndInput.addEventListener('change', updateDeliveryDate);
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
      const province = provinceInput.value === 'alberta' ? 'alberta' : 'ontario';
      const mode = formData.get('mode') === 'delivery_date' ? 'delivery_date' : 'manual';
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

      const request = { email, password, province, mode };
      let deliveryDates = [];
      if (mode === 'manual') {
        request.poNumbers = rawPoNumbers;
      } else {
        deliveryDates = selectedDeliveryDates();
        if (deliveryDates.length === 0) {
          setStatus('Choose a valid delivery date.', 'error');
          return;
        }
        request.deliveryDates = deliveryDates.join(',');
      }

      activeController = new AbortController();
      submitButton.disabled = true;
      stopButton.hidden = false;
      submitButton.textContent = 'Generating...';
      const provinceLabel = province === 'alberta' ? 'Alberta/AGLC' : 'Ontario/OCS';
      setStatus(mode === 'delivery_date' ? 'Finding ' + provinceLabel + ' work orders by delivery date...' : 'Creating a ' + provinceLabel + ' sell sheet from ' + poNumbers.length + ' PO(s)...', '');
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

        const responseList = (name) => (response.headers.get(name) || '').split(',').map((value) => value.trim()).filter(Boolean);
        const workOrderPos = responseList('x-sell-sheet-work-order-pos');
        const shippingStorePos = responseList('x-sell-sheet-shipping-store-pos');
        const failedPos = responseList('x-sell-sheet-failed-pos');
        const excludedPos = responseList('x-sell-sheet-excluded-pos');
        const skippedPos = responseList('x-sell-sheet-skipped-pos');

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = mode === 'delivery_date'
          ? 'sell_sheet_' + province + '_' + deliveryDates[0] + (deliveryDates.length > 1 ? '_' + deliveryDates[deliveryDates.length - 1] : '') + '.xlsx'
          : validPoNumbers.length === 1
          ? 'sell_sheet_' + validPoNumbers[0].replace(/[^0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.xlsx'
          : 'sell_sheet_' + validPoNumbers.length + '_pos.xlsx';
        anchor.click();
        URL.revokeObjectURL(downloadUrl);
        const sourceSummary = 'Purchase Orders: ' + (workOrderPos.join(', ') || 'none')
          + '. Shipping Stores: ' + (shippingStorePos.join(', ') || 'none') + '.';
        const notices = [];
        if (excludedPos.length) notices.push('No eligible approved-brand products: ' + excludedPos.join(', ') + '.');
        if (skippedPos.length) notices.push('Wrong province: ' + skippedPos.join(', ') + '.');
        if (failedPos.length) notices.push('Could not be generated: ' + failedPos.join(', ') + '.');
        setStatus('Your sell sheet is ready. ' + sourceSummary + (notices.length ? ' ' + notices.join(' ') : ''), notices.length ? 'warning' : 'success');
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
  return safeErrorMessage(error);
}

function getErrorStatus(error: unknown): number {
  if (error instanceof Error && /No scm\.workOrders record found|No Slingr records could be generated|Multiple work orders returned|invalid PO|Enter a valid PO number/i.test(error.message)) {
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
  applySecurityHeaders(response);
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
  if (!isTrustedCredentialOrigin(request)) {
    sendText(response, 403, 'Cross-site credential submissions are not allowed.');
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
  const province = form.get('province') === 'alberta' ? 'alberta' : 'ontario';
  const mode = form.get('mode') === 'delivery_date' ? 'delivery_date' : 'manual';
  const poNumbers = parsePoNumbers(form.get('poNumbers') || form.get('poNumber') || '');
  const deliveryDates = (form.get('deliveryDates') || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!email || !password || email.length > 254 || password.length > 512) {
    sendText(response, 400, 'Enter valid Slingr credentials.');
    return;
  }
  if (mode === 'manual' && poNumbers.length === 0) {
    sendText(response, 400, 'Enter valid PO numbers, one per line or separated by commas.');
    return;
  }
  if (mode === 'delivery_date' && deliveryDates.length === 0) {
    sendText(response, 400, 'Choose a valid delivery date.');
    return;
  }

  try {
    const filename = mode === 'delivery_date'
      ? `sell_sheet_${province}_${deliveryDates[0]}${deliveryDates.length > 1 ? `_${deliveryDates.at(-1)}` : ''}.xlsx`
      : poNumbers.length === 1
      ? `sell_sheet_${poNumberFilePart(poNumbers[0])}.xlsx`
      : `sell_sheet_${poNumbers.length}_pos.xlsx`;
    console.log(mode === 'delivery_date'
      ? `Starting delivery-date sell sheet generation for ${province}`
      : `Starting sell sheet generation for ${poNumbers.length} PO(s)`);
    const result = mode === 'delivery_date'
      ? await generateDeliveryDateSellSheetBuffer(deliveryDates, province, { ...config, email, password })
      : await generateBatchSellSheetBuffer(poNumbers, province, { ...config, email, password });
    const workbook = result.workbook;
    console.log(`Generated sell sheet for ${result.resolvedPoNumbers.length} PO(s); ${result.failedPoNumbers.length} failed, ${result.excludedPoNumbers.length} had no eligible rows, and ${result.skippedPoNumbers.length} were skipped (${workbook.length} bytes).`);

    response.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': workbook.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-sell-sheet-work-order-pos': result.workOrderPoNumbers.join(','),
      'x-sell-sheet-shipping-store-pos': result.shippingStorePoNumbers.join(','),
      'x-sell-sheet-failed-pos': result.failedPoNumbers.join(','),
      'x-sell-sheet-excluded-pos': result.excludedPoNumbers.join(','),
      'x-sell-sheet-skipped-pos': result.skippedPoNumbers.join(','),
    });
    response.end(workbook);
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Failed to generate ${mode === 'delivery_date' ? 'delivery-date sell sheet' : `${poNumbers.length} PO(s)`}:`, error instanceof Error ? error.stack || message : error);
    const status = getErrorStatus(error);
    const userMessage = mode === 'delivery_date'
      ? `The delivery-date sell sheet could not be generated: ${message}`
      : status === 404
      ? `One or more of the ${poNumbers.length} PO(s) could not be found in Slingr.`
      : `The sell sheet could not be generated for ${poNumbers.length} PO(s): ${message}`;
    sendText(response, status, userMessage);
  }
});

server.listen(port, host, () => {
  console.log(`Sell sheet app: http://${host}:${port}`);
});
