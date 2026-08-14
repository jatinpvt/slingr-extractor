import 'dotenv/config';
const baseUrl = (process.env.SLINGR_BASE_URL || 'https://weedme.slingrs.io/prod/runtime/api').replace(/\/$/, '');
const email = process.env.SLINGR_EMAIL;
const password = process.env.SLINGR_PASSWORD;

const login = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const loginJson = await login.json();
const token = loginJson.token;
console.log('login ok', !!token);

const productId = '660b09550e5a6f63539c26c3';

for (const [label, url] of [
  ['caseProduct', `${baseUrl}/data/pmd.products.caseProducts/${productId}`],
  ['inventory', `${baseUrl}/data/scm.productsInventory?_size=500`],
  ['portfolios', `${baseUrl}/data/crm.portfolios?_size=500`],
]) {
  const res = await fetch(url, { headers: { accept: 'application/json', token } });
  console.log('\n---', label, 'status', res.status, res.statusText, '---');
  const text = await res.text();
  console.log(text.slice(0, 1200));
}
