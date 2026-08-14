import 'dotenv/config';
const baseUrl = (process.env.SLINGR_BASE_URL || 'https://weedme.slingrs.io/prod/runtime/api').replace(/\/$/, '');
const email = process.env.SLINGR_EMAIL;
const password = process.env.SLINGR_PASSWORD;

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log('URL', url);
  console.log('STATUS', res.status, res.statusText);
  console.log('BODY', text.slice(0, 500));
  return { res, text };
}

const loginRes = await call(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.res.ok) process.exit(1);
const token = JSON.parse(loginRes.text).token;
console.log('TOKEN', !!token);

const workOrderRes = await call(`${baseUrl}/data/scm.workOrders?poNumber=24382&_size=20`, {
  method: 'GET',
  headers: { accept: 'application/json', token },
});
if (!workOrderRes.res.ok) process.exit(1);
const workJson = JSON.parse(workOrderRes.text);
console.log('TOTAL', workJson.total, 'ITEMS', workJson.items?.length);
console.log(JSON.stringify(workJson.items?.[0], null, 2).slice(0, 2000));
