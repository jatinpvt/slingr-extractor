import 'dotenv/config';
const baseUrl = (process.env.SLINGR_BASE_URL || 'https://weedme.slingrs.io/prod/runtime/api').replace(/\/$/, '');
const email = process.env.SLINGR_EMAIL;
const password = process.env.SLINGR_PASSWORD;

const login = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ email, password }),
});
const loginBody = await login.text();
const { token } = JSON.parse(loginBody);
console.log('login ok', !!token);

const resp = await fetch(`${baseUrl}/data/scm.productsInventory?_size=500`, {
  headers: { accept: 'application/json', token },
});
const text = await resp.text();
console.log('STATUS', resp.status, resp.statusText);
console.log(text.slice(0, 1500));
