// Test de bout en bout : lance le serveur sur un port libre avec une base temporaire
process.env.PORT = '3199';
process.env.DB_PATH = require('path').join(require('os').tmpdir(), 'otaku-smoke-' + Date.now() + '.db');
process.env.SUPERADMIN_EMAIL = 'admin@test.local';
process.env.SUPERADMIN_PASSWORD = 'Sup3r-Test-Pass';
process.env.JWT_SECRET = 'x'.repeat(40);
require('../server/index.js');

const base = 'http://localhost:3199';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { s: r.status, d };
}

(async () => {
  await new Promise((r) => setTimeout(r, 500));
  const plans = await call('/api/plans');
  ok(plans.d.length === 4 && ['daily', 'weekly', 'monthly', 'yearly'].every((c) => plans.d.some((p) => p.code === c)), '4 offres (jour/semaine/mois/année)');

  const list = await call('/api/titles?type=webtoon&limit=4');
  ok(list.s === 200 && list.d.items.length === 4 && list.d.total > 4, 'catalogue paginé');
  const poster = await call('/api/poster/1.svg');
  ok(poster.s === 200 && String(poster.d).includes('<svg'), 'affiche SVG générée');

  const bad = await call('/api/login', { method: 'POST', body: { email: 'admin@test.local', password: 'wrong' } });
  ok(bad.s === 401, 'mauvais mot de passe refusé');
  const sa = await call('/api/login', { method: 'POST', body: { email: 'admin@test.local', password: 'Sup3r-Test-Pass' } });
  ok(sa.s === 200 && sa.d.user.role === 'superadmin', 'connexion directe super admin');
  const me = await call('/api/me', { token: sa.d.token });
  ok(me.d.entitlement.unlimited && me.d.entitlement.downloads === -1, 'super admin : accès et téléchargements illimités');

  const premiumEp = (await call('/api/title/' + list.d.items[0].slug)).d.episodes.find((e) => !e.free);
  const dl = await call('/api/download/' + premiumEp.id, { method: 'POST', token: sa.d.token });
  ok(dl.s === 200, 'super admin télécharge un épisode premium');

  const u = await call('/api/register', { method: 'POST', body: { name: 'Test User', email: 'u@test.local', password: 'password123' } });
  ok(u.s === 200, 'inscription');
  const blocked = await call('/api/watch/' + premiumEp.id, { method: 'POST', token: u.d.token });
  ok(blocked.s === 402, 'épisode premium bloqué sans abonnement');
  const t1 = await call('/api/trial', { method: 'POST', token: u.d.token });
  ok(t1.s === 200, 'essai gratuit activé');
  const t2 = await call('/api/trial', { method: 'POST', token: u.d.token });
  ok(t2.s === 409, 'essai gratuit unique par compte');
  const w = await call('/api/watch/' + premiumEp.id, { method: 'POST', token: u.d.token });
  ok(w.s === 200, 'lecture premium pendant l\'essai');

  const noPhone = await call('/api/checkout', { method: 'POST', token: u.d.token, body: { plan: 'weekly', method: 'mtn_momo', phone: '123' } });
  ok(noPhone.s === 400, 'numéro Mobile Money invalide refusé');
  const pay = await call('/api/checkout', { method: 'POST', token: u.d.token, body: { plan: 'monthly', method: 'orange_money', phone: '699112233' } });
  ok(pay.s === 200 && pay.d.shared_xaf === 210, 'paiement 3000 FCFA -> 210 FCFA (7 %) reversés');

  const stats = await call('/api/admin/stats', { token: sa.d.token });
  ok(stats.d.revenue === 3000 && stats.d.provider_pool === 210, 'stats admin : revenus et part fournisseurs cohérents');
  const payouts = await call('/api/admin/payouts', { token: sa.d.token });
  ok(payouts.d.reduce((s, p) => s + p.pending, 0) === 210, 'reversements en attente = 210 FCFA');
  const forbidden = await call('/api/admin/stats', { token: u.d.token });
  ok(forbidden.s === 403, 'utilisateur simple refusé sur /admin');
  const noLic = await call('/api/admin/titles', { method: 'POST', token: sa.d.token, body: { title: 'X', type: 'film' } });
  ok(noLic.s === 400, 'publication sans fournisseur sous licence refusée');

  console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent');
  process.exit(fails ? 1 : 0);
})();
