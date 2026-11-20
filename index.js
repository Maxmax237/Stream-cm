require('./env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { db, seed, slugify } = require('./db');
const A = require('./auth');
const { distribute, SHARE_PCT } = require('./revenue');
const { charge } = require('./payments');
const svg = require('./svg');

seed();

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, '..', 'public');
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

// ---------- utilitaires ----------
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self' https: data:; connect-src 'self'",
};
function send(res, code, body, headers = {}) {
  res.writeHead(code, { ...SEC_HEADERS, ...headers });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const fail = (status, message) => Object.assign(new Error(message), { status });

function readBody(req) {
  return new Promise((ok, ko) => {
    let n = 0; const b = [];
    req.on('data', (c) => { n += c.length; if (n > 1e6) { ko(fail(413, 'Requête trop volumineuse')); req.destroy(); } else b.push(c); });
    req.on('end', () => { try { ok(b.length ? JSON.parse(Buffer.concat(b).toString()) : {}); } catch { ko(fail(400, 'JSON invalide')); } });
    req.on('error', ko);
  });
}

const hits = new Map();
function rateLimit(key, max = 10, windowMs = 15 * 60000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw fail(429, 'Trop de tentatives, réessayez plus tard');
  arr.push(now); hits.set(key, arr);
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, trial_used: !!u.trial_used });
const todayIso = () => new Date().toISOString().slice(0, 10);

function entitlement(user) {
  const guest = { tier: 'free', unlimited: false, quality: '480p', devices: 1, downloads: 0, plan: null, end: null };
  if (!user) return { ...guest, tier: 'guest' };
  if (user.role === 'superadmin') return { tier: 'superadmin', unlimited: true, quality: '4K', devices: 999, downloads: -1, plan: 'Super administrateur', end: null };
  const s = db.prepare(`SELECT s.is_trial, s.end_at, p.name pname, p.quality, p.devices, p.downloads_per_day dl
    FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status='active' AND s.end_at>? ORDER BY s.end_at DESC LIMIT 1`).get(user.id, Date.now());
  if (!s) return guest;
  return { tier: s.is_trial ? 'trial' : 'paid', unlimited: false, quality: s.quality, devices: s.devices, downloads: s.dl, plan: s.is_trial ? 'Essai gratuit' : s.pname, end: s.end_at };
}
const canWatchPremium = (e) => e.unlimited || e.tier === 'paid' || e.tier === 'trial';

const LIVE = '(t.license_end IS NULL OR t.license_end >= ?)';
const fmtTitle = (t) => ({ ...t, genres: t.genres.split(','), featured: !!t.featured });

// ---------- routes ----------
const routes = [];
const R = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

// Public
R('GET', '/api/config', () => ({ share_pct: SHARE_PCT, trial_days: TRIAL_DAYS, payment_mode: process.env.PAYMENT_MODE || 'demo' }));
R('GET', '/api/plans', () => db.prepare('SELECT * FROM plans ORDER BY sort').all().map((p) => ({ ...p, perks: JSON.parse(p.perks) })));

R('GET', '/api/home', () => {
  const hero = db.prepare(`SELECT t.* FROM titles t WHERE t.featured=1 AND ${LIVE} LIMIT 1`).get(todayIso())
    || db.prepare(`SELECT t.* FROM titles t WHERE ${LIVE} ORDER BY views DESC LIMIT 1`).get(todayIso());
  const eps = hero ? db.prepare('SELECT COUNT(*) c FROM episodes WHERE title_id=?').get(hero.id).c : 0;
  const genres = [...new Set(db.prepare('SELECT genres FROM titles').all().flatMap((r) => r.genres.split(',')))].sort();
  const years = db.prepare('SELECT DISTINCT year FROM titles ORDER BY year DESC').all().map((r) => r.year);
  return { hero: hero && { ...fmtTitle(hero), episodes: eps }, genres, years };
});

R('GET', '/api/titles', ({ query }) => {
  const where = [LIVE.replace(/t\./g, 't.')], params = [todayIso()];
  if (query.type) { where.push('t.type=?'); params.push(query.type); }
  if (query.q) { where.push('(t.title LIKE ? OR t.genres LIKE ? OR t.synopsis LIKE ?)'); const q = `%${query.q}%`; params.push(q, q, q); }
  if (query.genre) { where.push('(\',\'||t.genres||\',\') LIKE ?'); params.push(`%,${query.genre},%`); }
  if (query.year) { where.push('t.year=?'); params.push(Number(query.year)); }
  if (query.status) { where.push('t.status=?'); params.push(query.status); }
  const order = { rating: 't.rating DESC', recent: 't.year DESC, t.id DESC', popular: 't.views DESC' }[query.sort] || 't.views DESC';
  const limit = Math.min(Number(query.limit) || 8, 48), page = Math.max(Number(query.page) || 1, 1);
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM titles t WHERE ${w}`).get(...params).c;
  const items = db.prepare(`SELECT t.* FROM titles t WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  return { items: items.map(fmtTitle), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
});

R('GET', '/api/title/:slug', ({ params, user }) => {
  const t = db.prepare(`SELECT t.* FROM titles t WHERE t.slug=? AND ${LIVE}`).get(params.slug, todayIso());
  if (!t) throw fail(404, 'Titre introuvable');
  const episodes = db.prepare('SELECT id,number,name,duration_min,free,(video_url IS NOT NULL AND video_url<>\'\') AS has_video FROM episodes WHERE title_id=? ORDER BY number').all(t.id);
  const similar = db.prepare(`SELECT t.* FROM titles t WHERE t.type=? AND t.id<>? AND ${LIVE} ORDER BY views DESC LIMIT 6`).all(t.type, t.id, todayIso());
  const inList = user ? !!db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND title_id=?').get(user.id, t.id) : false;
  const prov = t.provider_id ? db.prepare('SELECT name,kind FROM providers WHERE id=?').get(t.provider_id) : null;
  return { title: fmtTitle(t), episodes, similar: similar.map(fmtTitle), in_list: inList, provider: prov };
});

R('GET', '/api/poster/:id', ({ params }) => {
  const t = db.prepare('SELECT * FROM titles WHERE id=?').get(parseInt(params.id, 10));
  if (!t) throw fail(404, 'Introuvable');
  return { raw: svg.poster(t), type: 'image/svg+xml' };
});
R('GET', '/api/banner/:id', ({ params }) => {
  const t = db.prepare('SELECT * FROM titles WHERE id=?').get(parseInt(params.id, 10));
  if (!t) throw fail(404, 'Introuvable');
  return { raw: svg.banner(t), type: 'image/svg+xml' };
});

// Auth
R('POST', '/api/register', ({ body, ip }) => {
  rateLimit('reg:' + ip, 8);
  const email = String(body.email || '').trim().toLowerCase(), name = String(body.name || '').trim().slice(0, 60), pw = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Email invalide');
  if (name.length < 2) throw fail(400, 'Nom requis');
  if (pw.length < 8) throw fail(400, 'Mot de passe : 8 caractères minimum');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw fail(409, 'Cet email est déjà utilisé');
  const r = db.prepare('INSERT INTO users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run(email, name, A.hashPassword(pw), Date.now());
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
  return { token: A.signToken({ id: u.id }), user: publicUser(u) };
});

R('POST', '/api/login', ({ body, ip }) => {
  rateLimit('login:' + ip, 15);
  const email = String(body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !A.verifyPassword(String(body.password || ''), u.password_hash)) throw fail(401, 'Email ou mot de passe incorrect');
  if (u.status !== 'active') throw fail(403, 'Compte suspendu');
  return { token: A.signToken({ id: u.id }), user: publicUser(u) };
});

R('GET', '/api/me', ({ user }) => ({ user: publicUser(user), entitlement: entitlement(user) }), { auth: true });

// Abonnements
R('POST', '/api/trial', ({ user }) => {
  if (user.trial_used) throw fail(409, 'Essai gratuit déjà utilisé');
  const monthly = db.prepare("SELECT id FROM plans WHERE code='monthly'").get();
  const now = Date.now();
  db.prepare('INSERT INTO subscriptions(user_id,plan_id,is_trial,start_at,end_at) VALUES(?,?,1,?,?)').run(user.id, monthly.id, now, now + TRIAL_DAYS * 86400000);
  db.prepare('UPDATE users SET trial_used=1 WHERE id=?').run(user.id);
  return { ok: true, entitlement: entitlement({ ...user, trial_used: 1 }) };
}, { auth: true });

R('POST', '/api/checkout', async ({ user, body }) => {
  const plan = db.prepare('SELECT * FROM plans WHERE code=?').get(String(body.plan || ''));
  if (!plan) throw fail(400, 'Offre inconnue');
  const result = await charge({ method: body.method, phone: body.phone, amountXaf: plan.price_xaf, userId: user.id, planCode: plan.code });
  const now = Date.now();
  db.exec('BEGIN');
  try {
    const p = db.prepare('INSERT INTO payments(user_id,plan_id,amount_xaf,method,status,ref,created_at) VALUES(?,?,?,?,?,?,?)').run(user.id, plan.id, plan.price_xaf, body.method, result.status, result.ref, now);
    const paymentId = Number(p.lastInsertRowid);
    const cur = db.prepare("SELECT MAX(end_at) m FROM subscriptions WHERE user_id=? AND status='active' AND is_trial=0 AND end_at>?").get(user.id, now).m;
    const start = cur || now;
    db.prepare("UPDATE subscriptions SET status='ended' WHERE user_id=? AND is_trial=1 AND status='active'").run(user.id);
    db.prepare('INSERT INTO subscriptions(user_id,plan_id,is_trial,start_at,end_at) VALUES(?,?,0,?,?)').run(user.id, plan.id, start, start + plan.duration_hours * 3600000);
    const share = distribute(paymentId, plan.price_xaf);
    db.exec('COMMIT');
    return { ok: true, ref: result.ref, shared_xaf: share.pool, entitlement: entitlement(user) };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}, { auth: true });

// Watchlist
R('GET', '/api/watchlist', ({ user }) => db.prepare('SELECT t.* FROM watchlist w JOIN titles t ON t.id=w.title_id WHERE w.user_id=? ORDER BY t.title').all(user.id).map(fmtTitle), { auth: true });
R('POST', '/api/watchlist/:id', ({ user, params }) => {
  const id = Number(params.id);
  if (!db.prepare('SELECT 1 FROM titles WHERE id=?').get(id)) throw fail(404, 'Titre introuvable');
  const has = db.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND title_id=?').get(user.id, id);
  if (has) db.prepare('DELETE FROM watchlist WHERE user_id=? AND title_id=?').run(user.id, id);
  else db.prepare('INSERT INTO watchlist(user_id,title_id) VALUES(?,?)').run(user.id, id);
  return { in_list: !has };
}, { auth: true });

// Lecture & téléchargement
function episodeAccess(user, epId) {
  const ep = db.prepare('SELECT e.*, t.title ttitle, t.id tid, t.license_end FROM episodes e JOIN titles t ON t.id=e.title_id WHERE e.id=?').get(Number(epId));
  if (!ep) throw fail(404, 'Épisode introuvable');
  if (ep.license_end && ep.license_end < todayIso()) throw fail(410, 'Licence expirée pour ce titre');
  return { ep, ent: entitlement(user) };
}
R('POST', '/api/watch/:id', ({ user, params }) => {
  const { ep, ent } = episodeAccess(user, params.id);
  if (!ep.free && !canWatchPremium(ent)) throw fail(402, 'Abonnement ou essai gratuit requis pour cet épisode');
  db.prepare('INSERT INTO views_log(user_id,title_id,episode_id,created_at) VALUES(?,?,?,?)').run(user.id, ep.tid, ep.id, Date.now());
  db.prepare('UPDATE titles SET views=views+1 WHERE id=?').run(ep.tid);
  return { video_url: ep.video_url || null, quality: ent.quality, demo: !ep.video_url, title: ep.ttitle, episode: ep.name };
}, { auth: true });

R('POST', '/api/download/:id', ({ user, params }) => {
  const { ep, ent } = episodeAccess(user, params.id);
  if (!ent.unlimited) {
    if (!canWatchPremium(ent)) throw fail(402, 'Les téléchargements nécessitent une offre payante ou l\'essai gratuit');
    if (ent.downloads === 0) throw fail(403, 'Votre offre n\'inclut pas les téléchargements');
    if (ent.downloads > 0) {
      const day = new Date(); day.setHours(0, 0, 0, 0);
      const used = db.prepare('SELECT COUNT(*) c FROM downloads WHERE user_id=? AND created_at>=?').get(user.id, day.getTime()).c;
      if (used >= ent.downloads) throw fail(429, `Limite quotidienne atteinte (${ent.downloads} téléchargements)`);
    }
  }
  db.prepare('INSERT INTO downloads(user_id,episode_id,created_at) VALUES(?,?,?)').run(user.id, ep.id, Date.now());
  return { download_url: ep.video_url || null, demo: !ep.video_url };
}, { auth: true });

// ---------- Admin ----------
const admin = { auth: true, roles: ['superadmin', 'admin'] };
const superOnly = { auth: true, roles: ['superadmin'] };

R('GET', '/api/admin/stats', () => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const now = Date.now();
  return {
    users: one('SELECT COUNT(*) c FROM users').c,
    active_subs: one("SELECT COUNT(DISTINCT user_id) c FROM subscriptions WHERE status='active' AND end_at>?", now).c,
    trials: one("SELECT COUNT(*) c FROM subscriptions WHERE is_trial=1 AND status='active' AND end_at>?", now).c,
    revenue: one("SELECT COALESCE(SUM(amount_xaf),0) s FROM payments WHERE status='paid'").s,
    provider_pool: one('SELECT COALESCE(SUM(amount_xaf),0) s FROM revenue_shares').s,
    provider_pending: one("SELECT COALESCE(SUM(amount_xaf),0) s FROM revenue_shares WHERE status='pending'").s,
    views: one('SELECT COUNT(*) c FROM views_log').c,
    titles: one('SELECT COUNT(*) c FROM titles').c,
    top: db.prepare('SELECT title,type,views FROM titles ORDER BY views DESC LIMIT 5').all(),
    by_plan: db.prepare("SELECT p.name, COUNT(*) n, SUM(pay.amount_xaf) total FROM payments pay JOIN plans p ON p.id=pay.plan_id WHERE pay.status='paid' GROUP BY p.id ORDER BY p.sort").all(),
    share_pct: SHARE_PCT,
  };
}, admin);

R('GET', '/api/admin/titles', () => db.prepare('SELECT t.*, p.name provider FROM titles t LEFT JOIN providers p ON p.id=t.provider_id ORDER BY t.id DESC').all().map(fmtTitle), admin);

function titleFields(b) {
  const type = ['anime', 'serie', 'film', 'webtoon'].includes(b.type) ? b.type : null;
  if (!type) throw fail(400, 'Type invalide');
  const title = String(b.title || '').trim();
  if (!title) throw fail(400, 'Titre requis');
  const prov = b.provider_id ? Number(b.provider_id) : null;
  const holder = prov ? (db.prepare('SELECT name FROM providers WHERE id=?').get(prov) || {}).name || null : null;
  return {
    title, type, synopsis: String(b.synopsis || '').slice(0, 2000), genres: (Array.isArray(b.genres) ? b.genres.join(',') : String(b.genres || '')).replace(/\s*,\s*/g, ',') || 'Divers',
    year: Number(b.year) || new Date().getFullYear(), rating: Math.min(5, Math.max(0, Number(b.rating) || 0)), status: b.status === 'completed' ? 'completed' : 'ongoing',
    age: String(b.age || '12+').slice(0, 5), provider_id: prov, license_holder: holder, license_end: b.license_end ? String(b.license_end).slice(0, 10) : null,
    featured: b.featured ? 1 : 0, hue: Number(b.hue) || Math.floor(Math.random() * 360), badge: b.badge ? String(b.badge).slice(0, 20) : null,
  };
}
R('POST', '/api/admin/titles', ({ body }) => {
  const f = titleFields(body);
  if (!f.provider_id || !f.license_holder) throw fail(400, 'Un fournisseur sous licence est obligatoire pour publier un titre');
  if (f.featured) db.prepare('UPDATE titles SET featured=0').run();
  let slug = slugify(f.title) || 'titre', n = 1;
  while (db.prepare('SELECT 1 FROM titles WHERE slug=?').get(slug)) slug = `${slugify(f.title)}-${++n}`;
  const r = db.prepare(`INSERT INTO titles(slug,title,type,synopsis,genres,year,rating,status,age,provider_id,license_holder,license_end,featured,hue,badge)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug, f.title, f.type, f.synopsis, f.genres, f.year, f.rating, f.status, f.age, f.provider_id, f.license_holder, f.license_end, f.featured, f.hue, f.badge);
  return { id: Number(r.lastInsertRowid), slug };
}, admin);
R('PUT', '/api/admin/titles/:id', ({ params, body }) => {
  const f = titleFields(body), id = Number(params.id);
  if (f.featured) db.prepare('UPDATE titles SET featured=0').run();
  db.prepare(`UPDATE titles SET title=?,type=?,synopsis=?,genres=?,year=?,rating=?,status=?,age=?,provider_id=?,license_holder=?,license_end=?,featured=?,hue=?,badge=? WHERE id=?`)
    .run(f.title, f.type, f.synopsis, f.genres, f.year, f.rating, f.status, f.age, f.provider_id, f.license_holder, f.license_end, f.featured, f.hue, f.badge, id);
  return { ok: true };
}, admin);
R('DELETE', '/api/admin/titles/:id', ({ params }) => { db.prepare('DELETE FROM titles WHERE id=?').run(Number(params.id)); return { ok: true }; }, admin);

R('GET', '/api/admin/titles/:id/episodes', ({ params }) => db.prepare('SELECT * FROM episodes WHERE title_id=? ORDER BY number').all(Number(params.id)), admin);
R('POST', '/api/admin/titles/:id/episodes', ({ params, body }) => {
  const url = String(body.video_url || '').trim();
  if (url && !/^https:\/\//i.test(url)) throw fail(400, 'video_url doit commencer par https://');
  const id = Number(params.id);
  const next = db.prepare('SELECT COALESCE(MAX(number),0)+1 n FROM episodes WHERE title_id=?').get(id).n;
  db.prepare('INSERT INTO episodes(title_id,number,name,duration_min,video_url,free) VALUES(?,?,?,?,?,?)')
    .run(id, Number(body.number) || next, String(body.name || `Épisode ${next}`).slice(0, 120), Number(body.duration_min) || 24, url || null, body.free ? 1 : 0);
  return { ok: true };
}, admin);
R('PUT', '/api/admin/episodes/:id', ({ params, body }) => {
  const url = String(body.video_url || '').trim();
  if (url && !/^https:\/\//i.test(url)) throw fail(400, 'video_url doit commencer par https://');
  db.prepare('UPDATE episodes SET name=?, video_url=?, free=? WHERE id=?').run(String(body.name || '').slice(0, 120), url || null, body.free ? 1 : 0, Number(params.id));
  return { ok: true };
}, admin);

R('GET', '/api/admin/providers', () => db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM titles WHERE provider_id=p.id) titles FROM providers p ORDER BY p.id`).all(), admin);
R('POST', '/api/admin/providers', ({ body }) => {
  const name = String(body.name || '').trim();
  if (!name) throw fail(400, 'Nom requis');
  db.prepare('INSERT INTO providers(name,kind,contact,payout_info) VALUES(?,?,?,?)').run(name.slice(0, 80), String(body.kind || 'Partenaire').slice(0, 80), String(body.contact || '').slice(0, 120), String(body.payout_info || '').slice(0, 200));
  return { ok: true };
}, admin);

R('GET', '/api/admin/payouts', () => db.prepare(`SELECT p.id provider_id, p.name, p.payout_info,
  COALESCE(SUM(CASE WHEN r.status='pending' THEN r.amount_xaf END),0) pending,
  COALESCE(SUM(CASE WHEN r.status='paid' THEN r.amount_xaf END),0) paid
  FROM providers p LEFT JOIN revenue_shares r ON r.provider_id=p.id GROUP BY p.id ORDER BY pending DESC`).all(), admin);
R('POST', '/api/admin/payouts/:id/paid', ({ params }) => {
  const r = db.prepare("UPDATE revenue_shares SET status='paid', paid_at=? WHERE provider_id=? AND status='pending'").run(Date.now(), Number(params.id));
  return { ok: true, lines: r.changes };
}, admin);

R('GET', '/api/admin/users', () => db.prepare('SELECT id,email,name,role,status,trial_used,created_at FROM users ORDER BY id DESC LIMIT 500').all(), admin);
R('POST', '/api/admin/users/:id', ({ params, body, user }) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(Number(params.id));
  if (!target) throw fail(404, 'Utilisateur introuvable');
  if (target.role === 'superadmin') throw fail(403, 'Le super administrateur ne peut pas être modifié');
  if (body.role !== undefined) {
    if (user.role !== 'superadmin') throw fail(403, 'Seul le super administrateur change les rôles');
    if (!['user', 'admin'].includes(body.role)) throw fail(400, 'Rôle invalide');
    db.prepare('UPDATE users SET role=? WHERE id=?').run(body.role, target.id);
  }
  if (body.status !== undefined) {
    if (!['active', 'banned'].includes(body.status)) throw fail(400, 'Statut invalide');
    db.prepare('UPDATE users SET status=? WHERE id=?').run(body.status, target.id);
  }
  return { ok: true };
}, admin);

R('GET', '/api/admin/payments', () => db.prepare(`SELECT pay.id, u.email, p.name plan, pay.amount_xaf, pay.method, pay.status, pay.ref, pay.created_at
  FROM payments pay JOIN users u ON u.id=pay.user_id JOIN plans p ON p.id=pay.plan_id ORDER BY pay.id DESC LIMIT 200`).all(), admin);

// ---------- serveur ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);
  const ip = req.socket.remoteAddress || '';

  if (pathname.startsWith('/api/')) {
    try {
      const route = routes.find((r) => r.method === req.method && r.re.test(pathname));
      if (!route) throw fail(404, 'Route inconnue');
      const params = pathname.match(route.re).groups || {};
      let user = null;
      const h = req.headers.authorization || '';
      if (h.startsWith('Bearer ')) {
        const p = A.verifyToken(h.slice(7));
        if (p) { user = db.prepare('SELECT * FROM users WHERE id=?').get(p.id) || null; if (user && user.status !== 'active') user = null; }
      }
      if (route.auth && !user) throw fail(401, 'Connexion requise');
      if (route.roles && !route.roles.includes(user.role)) throw fail(403, 'Accès refusé');
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const out = await route.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, user, ip });
      if (out && out.raw) return send(res, 200, out.raw, { 'Content-Type': out.type, 'Cache-Control': 'public, max-age=300' });
      return json(res, 200, out);
    } catch (e) {
      if (!e.status) console.error(e);
      return json(res, e.status || 500, { error: e.status ? e.message : 'Erreur serveur' });
    }
  }

  // fichiers statiques (SPA)
  let file = path.join(PUB, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(PUB)) return send(res, 403, 'Interdit');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUB, 'index.html');
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
}

http.createServer(handle).listen(PORT, () => console.log(`Otaku Legal CM : http://localhost:${PORT}`));
