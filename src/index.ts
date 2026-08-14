#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateSellSheet, generateSellSheetBuffer } from './services/generateSellSheet.js';

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
    @keyframes progressShimmer { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }
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
        jointBurn.style.width = raw + '%';
        if (raw < 100) {
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
      if (activeController) {
        activeController = null;
      }
      stopProgress();
    };

    stopButton.addEventListener('click', () => {
      if (activeController) {
        activeController.abort();
      }
      setStatus('Request stopped.', 'error');
      resetControls();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const poNumber = new FormData(form).get('poNumber')?.toString().trim() || '';
      if (!/^[0-9]{1,30}$/.test(poNumber)) {
        setStatus('Enter a valid numeric PO number.', 'error');
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
          body: new URLSearchParams({ poNumber }).toString(),
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
        anchor.download = 'sell_sheet_' + poNumber + '.xlsx';
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

export default async function handler(req: any, res: any): Promise<void> {
  if (!req || !res) {
    return;
  }

  const pathname = new URL(req.url || '/', 'https://example.com').pathname;

  if (req.method === 'GET' && pathname === '/') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(PAGE);
    return;
  }

  if (req.method === 'POST' && pathname === '/sell-sheet') {
    let body = '';
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (req.body && typeof req.body === 'object') {
      body = new URLSearchParams(req.body as Record<string, string>).toString();
    } else {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1_024) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Request is too large.');
          return;
        }
      }
    }

    const poNumber = new URLSearchParams(body).get('poNumber')?.trim() || '';
    if (!/^\d{1,30}$/.test(poNumber)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Enter a valid numeric PO number.');
      return;
    }

    try {
      const workbook = await generateSellSheetBuffer(poNumber);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="sell_sheet_${poNumber}.xlsx"`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(workbook);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`The sell sheet could not be generated for PO ${poNumber}: ${message}`);
    }
    return;
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Method not allowed.');
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
