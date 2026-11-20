/* Otaku Legal CM — application monopage (aucune dépendance) */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const TYPES = { anime: 'Animes', serie: 'Séries', film: 'Films', webtoon: 'Webtoons' };
const STATUS = { ongoing: 'En cours', completed: 'Terminé' };
const METHOD = { mtn_momo: 'MTN MoMo', orange_money: 'Orange Money', card: 'Carte' };
const xaf = (n) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n);
const dt = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const S = { token: localStorage.getItem('tk'), user: null, ent: null, cfg: { share_pct: 7, trial_days: 7 }, home: null, f: { type: 'webtoon', genre: '', year: '', status: '', sort: 'popular', page: 1, q: '' } };

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Erreur'); e.status = r.status; throw e; }
  return d;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
const go = (h) => { location.hash = h; };

async function loadMe() {
  if (!S.token) { S.user = null; S.ent = null; return; }
  try { const d = await api('/me'); S.user = d.user; S.ent = d.entitlement; } catch { S.token = null; localStorage.removeItem('tk'); S.user = null; S.ent = null; }
}
function logout() { S.token = null; localStorage.removeItem('tk'); S.user = null; S.ent = null; renderHeader(); go('#/'); }

/* ---------- en-tête ---------- */
function renderHeader() {
  const u = S.user, isAdmin = u && (u.role === 'admin' || u.role === 'superadmin');
  const tabs = Object.entries(TYPES).map(([t, l]) => `<button class="pill ${S.f.type === t && location.hash.startsWith('#/browse') ? 'on' : ''}" data-type="${t}">${l}</button>`).join('');
  $('#top').innerHTML = `<div class="in">
    <a class="logo" href="#/"><span class="star">✦</span><span>OTAKU<br>LEGAL <small>CM</small></span></a>
    <nav class="tabs">${tabs}</nav>
    <form class="search" id="sf"><span>🔍</span><input id="q" placeholder="Rechercher animes, séries, films, webtoons…" value="${esc(S.f.q)}" aria-label="Recherche"></form>
    <span class="spacer"></span>
    <a class="pill" href="#/pricing">Offres</a>
    ${u ? `<div class="menu" id="menu"><button class="avatar" id="avb" aria-label="Compte">${esc(u.name.slice(0, 2).toUpperCase())}</button>
      <div class="dd"><div class="who">${esc(u.email)}<br><b>${esc(S.ent?.plan || 'Compte gratuit')}</b></div>
      <a href="#/account">Mon compte</a><a href="#/watchlist">Ma liste</a>${isAdmin ? '<a href="#/admin/stats">Administration</a>' : ''}<button id="lo">Déconnexion</button></div></div>`
      : `<a class="btn sm" href="#/login">Connexion</a><a class="btn primary sm" href="#/register">S'inscrire</a>`}
  </div>`;
}
document.addEventListener('click', (e) => {
  const tb = e.target.closest('[data-type]');
  if (tb && tb.closest('.tabs')) { S.f.type = tb.dataset.type; S.f.page = 1; S.f.q = ''; go('#/browse'); if (location.hash === '#/browse') route(); return; }
  if (e.target.closest('#avb')) { $('#menu').classList.toggle('open'); return; }
  if (e.target.closest('#lo')) { logout(); return; }
  if (!e.target.closest('#menu')) $('#menu')?.classList.remove('open');
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'sf') { e.preventDefault(); S.f.q = $('#q').value.trim(); S.f.page = 1; S.f.type = ''; go('#/browse'); if (location.hash === '#/browse') route(); }
});

/* ---------- cartes ---------- */
const card = (t) => `<a class="card" href="#/title/${esc(t.slug)}">
  <div class="poster"><img loading="lazy" alt="${esc(t.title)}" src="/api/poster/${t.id}.svg">${t.badge ? `<span class="tag">${esc(t.badge)}</span>` : ''}<span class="rate"><b>★</b> ${t.rating.toFixed(1)}</span></div>
  <h3>${esc(t.title)}</h3><div class="gen">${t.genres.slice(0, 2).map((g) => `<span>${esc(g)}</span>`).join('')}</div>
  <div class="m">★ ${t.rating.toFixed(1)} · ${k(t.views)} · ${STATUS[t.status] || ''}</div></a>`;

/* ---------- accueil / catalogue ---------- */
async function viewBrowse() {
  if (!S.home) S.home = await api('/home');
  const f = S.f, h = S.home.hero;
  const qs = new URLSearchParams({ page: f.page, limit: 8, sort: f.sort });
  ['type', 'genre', 'year', 'status', 'q'].forEach((x) => f[x] && qs.set(x, f[x]));
  const d = await api('/titles?' + qs);
  const showHero = h && !f.q && location.hash !== '#/browse-all';
  const label = f.q ? `Résultats pour « ${esc(f.q)} »` : f.type ? `Tendances — ${TYPES[f.type]}` : 'Tendances';
  app.innerHTML = `
  ${showHero ? `<section class="hero"><img alt="" src="/api/banner/${h.id}.svg"><div class="c">
    <div class="badges"><span class="badge">À l'affiche</span><span class="badge">Nouvelle saison</span><span class="badge">En streaming</span></div>
    <h1 class="serif">${esc(h.title)}</h1><p>${esc(h.synopsis)}</p>
    <div class="meta">${h.genres.map(esc).join(' • ')} • ${h.year} • ${h.episodes} épisodes • ${h.rating.toFixed(1)} ★</div>
    <div class="acts"><a class="btn primary" href="#/title/${esc(h.slug)}">▶ Regarder</a><button class="btn ghost" data-list="${h.id}">＋ Ma liste</button></div>
    <div class="meta" style="margin:12px 0 0">Nouvel épisode chaque vendredi · VOSTFR | VF · ${esc(h.age)}</div></div></section>` : ''}
  <div class="bar">
    <select id="fg"><option value="">Genre</option>${S.home.genres.map((g) => `<option ${f.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
    <select id="fy"><option value="">Année</option>${S.home.years.map((y) => `<option ${String(f.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="fs"><option value="">Statut</option><option value="ongoing" ${f.status === 'ongoing' ? 'selected' : ''}>En cours</option><option value="completed" ${f.status === 'completed' ? 'selected' : ''}>Terminé</option></select>
    <span class="chip on">Légal ✓</span><span class="sp"></span>
    <select id="fo"><option value="popular" ${f.sort === 'popular' ? 'selected' : ''}>Tri : Populaire</option><option value="rating" ${f.sort === 'rating' ? 'selected' : ''}>Tri : Note</option><option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>Tri : Récent</option></select>
    <button class="chip" id="reset">Réinitialiser</button></div>
  <div class="head"><div><h2>${label}</h2><div class="sub">Titres sélectionnés et licenciés — mis à jour chaque semaine · ${d.total} titres</div></div></div>
  ${d.items.length ? `<div class="grid">${d.items.map(card).join('')}</div>` : '<div class="empty">Aucun titre ne correspond à votre recherche.</div>'}
  <div class="pager">${d.page > 1 ? '<button data-pg="' + (d.page - 1) + '">‹</button>' : ''}${Array.from({ length: d.pages }, (_, i) => `<button class="${i + 1 === d.page ? 'on' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}${d.page < d.pages ? '<button data-pg="' + (d.page + 1) + '">›</button>' : ''}</div>`;
  const re = () => { S.f.page = 1; viewBrowse(); renderHeader(); };
  $('#fg').onchange = (e) => { f.genre = e.target.value; re(); };
  $('#fy').onchange = (e) => { f.year = e.target.value; re(); };
  $('#fs').onchange = (e) => { f.status = e.target.value; re(); };
  $('#fo').onchange = (e) => { f.sort = e.target.value; re(); };
  $('#reset').onclick = () => { Object.assign(f, { genre: '', year: '', status: '', sort: 'popular', page: 1, q: '' }); re(); };
  $$('[data-pg]').forEach((b) => (b.onclick = () => { f.page = +b.dataset.pg; viewBrowse(); scrollTo({ top: 0, behavior: 'smooth' }); }));
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-list]');
  if (!b) return;
  if (!S.user) { toast('Connectez-vous pour utiliser Ma liste'); return go('#/login'); }
  try { const r = await api('/watchlist/' + b.dataset.list, { method: 'POST' }); toast(r.in_list ? 'Ajouté à votre liste' : 'Retiré de votre liste'); if (b.dataset.refresh) route(); } catch (err) { toast(err.message); }
});

/* ---------- détail ---------- */
async function viewTitle(slug) {
  const d = await api('/title/' + slug), t = d.title;
  const free = S.ent && (S.ent.unlimited || S.ent.tier === 'paid' || S.ent.tier === 'trial');
  app.innerHTML = `<div class="detail"><div class="big"><img alt="${esc(t.title)}" src="/api/poster/${t.id}.svg"></div><div>
    <div class="badges"><span class="badge">${TYPES[t.type]}</span>${t.badge ? `<span class="badge">${esc(t.badge)}</span>` : ''}<span class="badge">${esc(t.age)}</span></div>
    <h1 class="serif">${esc(t.title)}</h1>
    <div class="meta">${t.genres.map(esc).join(' • ')} • ${t.year} • ★ ${t.rating.toFixed(1)} • ${STATUS[t.status]}</div>
    <span class="lic">✔ Licence : ${esc(t.license_holder || 'Domaine public')}${t.license_end ? ' · jusqu\'au ' + esc(t.license_end) : ''}</span>
    <p>${esc(t.synopsis)}</p>
    <div class="acts" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" data-list="${t.id}" data-refresh="1">${d.in_list ? '✓ Dans ma liste' : '＋ Ajouter à ma liste'}</button>
    ${free ? '' : '<a class="btn primary" href="#/pricing">Débloquer tous les épisodes</a>'}</div></div></div>
  <div class="player" id="player"><div class="demo"><div class="play">▶</div><b>Choisissez un épisode</b><div class="note">Les épisodes gratuits sont accessibles après inscription.</div></div></div>
  <h2 style="margin:10px 0">${t.type === 'webtoon' ? 'Chapitres' : t.type === 'film' ? 'Film' : 'Épisodes'}</h2>
  <div class="eps">${d.episodes.map((e) => `<div class="ep"><span class="n">${e.number}</span><div class="t">${esc(e.name)}<br><small>${e.duration_min} min</small></div>
    ${e.free ? '<span class="free">Gratuit</span>' : free ? '' : '<span class="lock">Premium</span>'}
    <button class="btn sm primary" data-play="${e.id}">▶ Lire</button><button class="btn sm" data-dl="${e.id}" title="Télécharger">⬇</button></div>`).join('')}</div>
  ${d.similar.length ? `<div class="sect"><h2>Titres similaires</h2><div class="grid">${d.similar.map(card).join('')}</div></div>` : ''}`;
}
document.addEventListener('click', async (e) => {
  const p = e.target.closest('[data-play]'), dl = e.target.closest('[data-dl]');
  if (!p && !dl) return;
  if (!S.user) { toast('Créez un compte gratuit pour regarder'); return go('#/register'); }
  try {
    if (p) {
      const r = await api('/watch/' + p.dataset.play, { method: 'POST' });
      const box = $('#player');
      box.innerHTML = r.video_url ? `<video controls autoplay playsinline src="${esc(r.video_url)}"></video>`
        : `<div class="demo"><div class="play">▶</div><b>${esc(r.title)} — ${esc(r.episode)}</b><div class="note">Lecteur de démonstration (${esc(r.quality)}). Ajoutez l'URL vidéo sous licence dans Administration → Titres.</div></div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const r = await api('/download/' + dl.dataset.dl, { method: 'POST' });
      if (r.download_url) window.open(r.download_url, '_blank', 'noopener'); else toast('Téléchargement autorisé (fichier de démonstration : aucune vidéo liée)');
    }
  } catch (err) { toast(err.message); if (err.status === 402) setTimeout(() => go('#/pricing'), 1200); }
});

/* ---------- offres ---------- */
async function viewPricing() {
  const plans = await api('/plans');
  const per = { daily: '/ jour', weekly: '/ semaine', monthly: '/ mois', yearly: '/ an' };
  app.innerHTML = `<div class="head" style="margin-top:26px"><div><h1 class="serif" style="font-size:2.2rem">Choisissez votre offre</h1><div class="sub">Journalier, hebdomadaire, mensuel ou annuel — sans engagement. Paiement MTN MoMo, Orange Money ou carte.</div></div></div>
  <div class="trial"><div><b style="font-size:1.15rem">🎁 Essai gratuit de ${S.cfg.trial_days} jours</b><div class="note">Accès aux avantages du Pass Mois. Sans carte bancaire, une seule fois par compte.</div></div>
    <button class="btn primary" id="trial" ${S.user?.trial_used ? 'disabled' : ''}>${S.user?.trial_used ? 'Essai déjà utilisé' : 'Démarrer l\'essai gratuit'}</button></div>
  <div class="plans">${plans.map((p) => `<div class="plan ${p.code === 'monthly' ? 'best' : ''}">${p.code === 'monthly' ? '<span class="ribbon">Populaire</span>' : p.code === 'yearly' ? '<span class="ribbon">Meilleur prix</span>' : ''}
    <h3>${esc(p.name)}</h3><div class="price">${xaf(p.price_xaf)} <small>${per[p.code]}</small></div>
    <ul>${p.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><button class="btn primary" data-buy="${p.code}">Choisir ${esc(p.name)}</button></div>`).join('')}</div>
  <div class="share"><b>🤝 ${S.cfg.share_pct} % de chaque paiement est reversé aux ayants droit</b><div class="note">Studios, éditeurs et créateurs dont vous regardez les œuvres sont rémunérés automatiquement, au prorata des vues. Voir la page <a href="#/legal"><u>Contenus sous licence</u></a>.</div></div>`;
  $('#trial').onclick = async () => {
    if (!S.user) { toast('Créez un compte pour démarrer l\'essai'); return go('#/register'); }
    try { await api('/trial', { method: 'POST' }); await loadMe(); renderHeader(); toast('Essai gratuit activé 🎉'); go('#/'); } catch (err) { toast(err.message); }
  };
  $$('[data-buy]').forEach((b) => (b.onclick = () => {
    if (!S.user) { toast('Connectez-vous pour souscrire'); return go('#/login'); }
    checkout(plans.find((p) => p.code === b.dataset.buy));
  }));
}
function checkout(plan) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<form class="m"><h2>${esc(plan.name)} — ${xaf(plan.price_xaf)}</h2>
    <label>Moyen de paiement</label><div class="methods">${Object.entries(METHOD).map(([v, l], i) => `<label><input type="radio" name="method" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <div id="ph"><label>Numéro Mobile Money</label><input name="phone" placeholder="6XXXXXXXX" inputmode="tel"></div>
    <div class="note" style="margin-top:10px">${S.cfg.share_pct} % de ce montant est reversé aux fournisseurs de contenu.${S.cfg.payment_mode === 'demo' ? '<br><b>Mode démo :</b> aucun argent réel n\'est débité.' : ''}</div>
    <div class="err" id="perr"></div><div class="row" style="margin-top:12px"><button type="button" class="btn" id="cx">Annuler</button><button class="btn primary">Payer</button></div></form>`;
  document.body.appendChild(m);
  const sync = () => { $('#ph', m).style.display = m.querySelector('[name=method]:checked').value === 'card' ? 'none' : ''; };
  $$('[name=method]', m).forEach((r) => (r.onchange = sync));
  $('#cx', m).onclick = () => m.remove();
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('form', m).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/checkout', { method: 'POST', body: { plan: plan.code, method: fd.get('method'), phone: fd.get('phone') } });
      S.ent = r.entitlement; m.remove(); renderHeader(); toast('Paiement confirmé ✔ Réf. ' + r.ref); go('#/account');
    } catch (err) { $('#perr', m).textContent = err.message; }
  };
}

/* ---------- auth ---------- */
function viewAuth(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<form class="box" id="af"><h1 class="serif">${reg ? 'Créer un compte' : 'Connexion'}</h1>
    ${reg ? '<label>Nom</label><input name="name" required minlength="2" autocomplete="name">' : ''}
    <label>Email</label><input name="email" type="email" required autocomplete="email">
    <label>Mot de passe</label><input name="password" type="password" required minlength="8" autocomplete="${reg ? 'new-password' : 'current-password'}">
    <div class="err" id="ae"></div><button class="btn primary" style="width:100%;margin-top:8px">${reg ? 'S\'inscrire' : 'Se connecter'}</button>
    <p class="note" style="text-align:center">${reg ? 'Déjà inscrit ? <a href="#/login"><u>Connexion</u></a>' : 'Pas de compte ? <a href="#/register"><u>S\'inscrire</u></a>'}</p></form>`;
  $('#af').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api(reg ? '/register' : '/login', { method: 'POST', body: fd });
      S.token = r.token; localStorage.setItem('tk', r.token); await loadMe(); renderHeader();
      go(S.user.role === 'superadmin' ? '#/admin/stats' : '#/');
    } catch (err) { $('#ae').textContent = err.message; }
  };
}

/* ---------- compte, liste, légal ---------- */
function viewAccount() {
  if (!S.user) return go('#/login');
  const e = S.ent;
  app.innerHTML = `<div class="box" style="max-width:560px"><h1 class="serif">Mon compte</h1>
    <p><b>${esc(S.user.name)}</b><br><span class="note">${esc(S.user.email)}</span></p>
    <div class="stat"><span>Offre actuelle</span><b>${esc(e.plan || 'Gratuit')}</b>
    <span>${e.unlimited ? 'Accès illimité : lecture et téléchargements sans limite' : e.end ? 'Valable jusqu\'au ' + dt(e.end) : 'Épisodes gratuits uniquement'}</span></div>
    <p class="note">Qualité : ${esc(e.quality)} · Appareils : ${e.devices} · Téléchargements/jour : ${e.downloads < 0 ? 'illimités' : e.downloads}</p>
    <a class="btn primary" href="#/pricing">${e.tier === 'paid' || e.tier === 'superadmin' ? 'Voir les offres' : 'S\'abonner'}</a></div>`;
}
async function viewWatchlist() {
  if (!S.user) return go('#/login');
  const l = await api('/watchlist');
  app.innerHTML = `<div class="head" style="margin-top:26px"><h2>Ma liste</h2></div>${l.length ? `<div class="grid">${l.map(card).join('')}</div>` : '<div class="empty">Votre liste est vide.</div>'}`;
}
function viewLegal() {
  app.innerHTML = `<div class="box" style="max-width:760px"><h1 class="serif">Contenus sous licence</h1>
    <p>Otaku Legal CM ne diffuse que des œuvres pour lesquelles nous disposons des droits : titres sous contrat de licence avec des studios et éditeurs, œuvres du domaine public ou Creative Commons, et créations originales d'auteurs partenaires.</p>
    <p>Chaque fiche affiche le détenteur de droits et la date de fin de licence. Quand une licence expire, le titre est automatiquement retiré du catalogue.</p>
    <p><b>Partage des revenus :</b> ${S.cfg.share_pct} % de chaque abonnement est reversé aux ayants droit, au prorata de la consommation de leurs œuvres.</p>
    <p>Vous êtes titulaire de droits ou créateur ? Écrivez-nous pour devenir partenaire.</p></div>`;
}

/* ---------- administration ---------- */
const ATABS = { stats: 'Statistiques', titles: 'Titres', providers: 'Fournisseurs', payouts: 'Reversements', users: 'Utilisateurs', payments: 'Paiements' };
async function viewAdmin(tab = 'stats') {
  if (!S.user || !['admin', 'superadmin'].includes(S.user.role)) { app.innerHTML = '<div class="empty">Accès réservé aux administrateurs.</div>'; return; }
  const head = `<div class="head" style="margin-top:22px"><h2>Administration ${S.user.role === 'superadmin' ? '<span class="badge">Super admin</span>' : ''}</h2></div>
    <div class="atabs">${Object.entries(ATABS).map(([t, l]) => `<a class="pill ${t === tab ? 'on' : ''}" href="#/admin/${t}">${l}</a>`).join('')}</div>`;
  let body = '';
  if (tab === 'stats') {
    const s = await api('/admin/stats');
    body = `<div class="stats">${[['Revenus', xaf(s.revenue)], [`Part fournisseurs (${s.share_pct} %)`, xaf(s.provider_pool)], ['À reverser', xaf(s.provider_pending)], ['Utilisateurs', s.users], ['Abonnés actifs', s.active_subs], ['Essais en cours', s.trials], ['Lectures', s.views], ['Titres', s.titles]].map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
    <div class="two sect"><div><h3>Titres les plus vus</h3><div class="scroll"><table>${s.top.map((t) => `<tr><td>${esc(t.title)}</td><td>${TYPES[t.type]}</td><td>${k(t.views)}</td></tr>`).join('')}</table></div></div>
    <div><h3>Ventes par offre</h3><div class="scroll"><table>${s.by_plan.length ? s.by_plan.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.n}</td><td>${xaf(p.total)}</td></tr>`).join('') : '<tr><td>Aucune vente</td></tr>'}</table></div></div></div>`;
  } else if (tab === 'titles') {
    const [ts, ps] = await Promise.all([api('/admin/titles'), api('/admin/providers')]);
    body = `<button class="btn primary sm" id="nt">＋ Nouveau titre</button>
    <div class="scroll"><table><tr><th>Titre</th><th>Type</th><th>Fournisseur</th><th>Licence</th><th>Vues</th><th></th></tr>${ts.map((t) => `<tr><td>${esc(t.title)}${t.featured ? ' ⭐' : ''}</td><td>${TYPES[t.type]}</td><td>${esc(t.provider || '—')}</td><td>${esc(t.license_end || 'perpétuelle')}</td><td>${k(t.views)}</td>
      <td><button class="btn sm" data-eps="${t.id}">Épisodes</button> <button class="btn sm" data-edit="${t.id}">Modifier</button> <button class="btn sm danger" data-del="${t.id}">Suppr.</button></td></tr>`).join('')}</table></div>`;
    app.innerHTML = head + body;
    $('#nt').onclick = () => titleForm(null, ps);
    $$('[data-edit]').forEach((b) => (b.onclick = () => titleForm(ts.find((t) => t.id === +b.dataset.edit), ps)));
    $$('[data-eps]').forEach((b) => (b.onclick = () => episodesModal(+b.dataset.eps)));
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Supprimer ce titre et ses épisodes ?')) { await api('/admin/titles/' + b.dataset.del, { method: 'DELETE' }); S.home = null; route(); } }));
    return;
  } else if (tab === 'providers') {
    const ps = await api('/admin/providers');
    body = `<div class="scroll"><table><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Paiement</th><th>Titres</th></tr>${ps.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.kind)}</td><td>${esc(p.contact)}</td><td>${esc(p.payout_info)}</td><td>${p.titles}</td></tr>`).join('')}</table></div>
    <form id="pf" class="box" style="margin:20px 0;max-width:520px"><h3>Nouveau fournisseur / ayant droit</h3><label>Nom</label><input name="name" required><label>Type</label><input name="kind" placeholder="Studio, éditeur, créateur…"><label>Contact</label><input name="contact"><label>Infos de paiement (MoMo / IBAN)</label><input name="payout_info"><div class="err" id="pe"></div><button class="btn primary">Ajouter</button></form>`;
    app.innerHTML = head + body;
    $('#pf').onsubmit = async (e) => { e.preventDefault(); try { await api('/admin/providers', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); route(); } catch (err) { $('#pe').textContent = err.message; } };
    return;
  } else if (tab === 'payouts') {
    const rows = await api('/admin/payouts');
    body = `<p class="note">À chaque paiement, ${S.cfg.share_pct} % est réparti entre les fournisseurs au prorata des vues (30 derniers jours). Effectuez le virement réel (MoMo / banque) puis cliquez « Marquer payé ».</p>
    <div class="scroll"><table><tr><th>Fournisseur</th><th>Infos de paiement</th><th>À reverser</th><th>Déjà versé</th><th></th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.payout_info)}</td><td><b>${xaf(r.pending)}</b></td><td>${xaf(r.paid)}</td><td>${r.pending > 0 ? `<button class="btn sm primary" data-paid="${r.provider_id}">Marquer payé</button>` : ''}</td></tr>`).join('')}</table></div>`;
    app.innerHTML = head + body;
    $$('[data-paid]').forEach((b) => (b.onclick = async () => { await api(`/admin/payouts/${b.dataset.paid}/paid`, { method: 'POST' }); toast('Reversement marqué payé'); route(); }));
    return;
  } else if (tab === 'users') {
    const us = await api('/admin/users');
    body = `<div class="scroll"><table><tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Inscrit</th><th></th></tr>${us.map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.name)}</td><td>${u.role}</td><td>${u.status}</td><td>${dt(u.created_at)}</td><td>${u.role === 'superadmin' ? '' : `<button class="btn sm" data-ban="${u.id}" data-st="${u.status === 'active' ? 'banned' : 'active'}">${u.status === 'active' ? 'Bannir' : 'Réactiver'}</button>${S.user.role === 'superadmin' ? ` <button class="btn sm" data-role="${u.id}" data-r="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}</button>` : ''}`}</td></tr>`).join('')}</table></div>`;
    app.innerHTML = head + body;
    $$('[data-ban]').forEach((b) => (b.onclick = async () => { await api('/admin/users/' + b.dataset.ban, { method: 'POST', body: { status: b.dataset.st } }); route(); }));
    $$('[data-role]').forEach((b) => (b.onclick = async () => { try { await api('/admin/users/' + b.dataset.role, { method: 'POST', body: { role: b.dataset.r } }); route(); } catch (err) { toast(err.message); } }));
    return;
  } else if (tab === 'payments') {
    const ps = await api('/admin/payments');
    body = `<div class="scroll"><table><tr><th>Date</th><th>Utilisateur</th><th>Offre</th><th>Montant</th><th>Moyen</th><th>Statut</th><th>Réf.</th></tr>${ps.length ? ps.map((p) => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.email)}</td><td>${esc(p.plan)}</td><td>${xaf(p.amount_xaf)}</td><td>${METHOD[p.method] || p.method}</td><td>${p.status}</td><td>${esc(p.ref)}</td></tr>`).join('') : '<tr><td colspan="7">Aucun paiement</td></tr>'}</table></div>`;
  }
  app.innerHTML = head + body;
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="m">${html}</div>`; m.onclick = (e) => { if (e.target === m) m.remove(); }; document.body.appendChild(m); return m; }
function titleForm(t, providers) {
  const v = t || { title: '', type: 'webtoon', synopsis: '', genres: [], year: new Date().getFullYear(), rating: 4, status: 'ongoing', age: '12+', provider_id: '', license_end: '', featured: false, badge: '' };
  const m = modal(`<form><h2>${t ? 'Modifier' : 'Nouveau'} titre</h2>
    <label>Titre</label><input name="title" required value="${esc(v.title)}">
    <div class="row"><div><label>Type</label><select name="type">${Object.entries(TYPES).map(([a, b]) => `<option value="${a}" ${v.type === a ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    <div><label>Année</label><input name="year" type="number" value="${v.year}"></div></div>
    <label>Genres (séparés par des virgules)</label><input name="genres" value="${esc(v.genres.join(', '))}">
    <label>Synopsis</label><textarea name="synopsis" rows="3">${esc(v.synopsis)}</textarea>
    <div class="row"><div><label>Note (0-5)</label><input name="rating" type="number" step="0.1" min="0" max="5" value="${v.rating}"></div>
    <div><label>Statut</label><select name="status"><option value="ongoing" ${v.status === 'ongoing' ? 'selected' : ''}>En cours</option><option value="completed" ${v.status === 'completed' ? 'selected' : ''}>Terminé</option></select></div>
    <div><label>Âge</label><input name="age" value="${esc(v.age)}"></div></div>
    <label>Fournisseur sous licence (obligatoire)</label><select name="provider_id" required><option value="">— choisir —</option>${providers.map((p) => `<option value="${p.id}" ${v.provider_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <div class="row"><div><label>Fin de licence</label><input name="license_end" type="date" value="${esc(v.license_end || '')}"></div><div><label>Badge</label><input name="badge" value="${esc(v.badge || '')}"></div></div>
    <label><input type="checkbox" name="featured" style="width:auto" ${v.featured ? 'checked' : ''}> Mettre à l'affiche (hero)</label>
    <div class="err" id="te"></div><div class="row"><button type="button" class="btn" id="cx">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  $('#cx', m).onclick = () => m.remove();
  $('form', m).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target)); fd.featured = !!fd.featured;
    try { await api(t ? '/admin/titles/' + t.id : '/admin/titles', { method: t ? 'PUT' : 'POST', body: fd }); m.remove(); S.home = null; route(); toast('Enregistré'); } catch (err) { $('#te', m).textContent = err.message; }
  };
}
async function episodesModal(id) {
  const eps = await api(`/admin/titles/${id}/episodes`);
  const m = modal(`<h2>Épisodes</h2><p class="note">Collez uniquement des URL vidéo (https) dont vous détenez les droits de diffusion.</p>
    ${eps.map((e) => `<form class="ep" data-e="${e.id}" style="flex-wrap:wrap"><span class="n">${e.number}</span><input name="name" value="${esc(e.name)}" style="flex:1;min-width:120px"><input name="video_url" placeholder="https://…" value="${esc(e.video_url || '')}" style="flex:2;min-width:180px"><label style="margin:0"><input type="checkbox" name="free" style="width:auto" ${e.free ? 'checked' : ''}> gratuit</label><button class="btn sm primary">OK</button></form>`).join('')}
    <form id="ne" class="ep" style="margin-top:10px;flex-wrap:wrap"><input name="name" placeholder="Nouvel épisode" style="flex:1"><input name="video_url" placeholder="https://…" style="flex:2"><button class="btn sm">＋</button></form>
    <button class="btn" id="cx" style="margin-top:12px">Fermer</button>`);
  $('#cx', m).onclick = () => m.remove();
  $$('form[data-e]', m).forEach((f) => (f.onsubmit = async (ev) => { ev.preventDefault(); const fd = Object.fromEntries(new FormData(f)); fd.free = !!fd.free; try { await api('/admin/episodes/' + f.dataset.e, { method: 'PUT', body: fd }); toast('Épisode mis à jour'); } catch (err) { toast(err.message); } }));
  $('#ne', m).onsubmit = async (ev) => { ev.preventDefault(); try { await api(`/admin/titles/${id}/episodes`, { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); m.remove(); episodesModal(id); } catch (err) { toast(err.message); } };
}

/* ---------- routeur ---------- */
async function route() {
  const h = location.hash || '#/';
  const [, a, b] = h.split('/');
  $$('.modal').forEach((m) => m.remove());
  try {
    if (a === 'browse' || h === '#/' || h === '') { if (h === '#/' && !S.f.q) S.f.type = S.f.type || 'webtoon'; await viewBrowse(); }
    else if (a === 'title') await viewTitle(b);
    else if (a === 'pricing') await viewPricing();
    else if (a === 'login') viewAuth('login');
    else if (a === 'register') viewAuth('register');
    else if (a === 'account') viewAccount();
    else if (a === 'watchlist') await viewWatchlist();
    else if (a === 'legal') viewLegal();
    else if (a === 'admin') await viewAdmin(b);
    else app.innerHTML = '<div class="empty">Page introuvable.</div>';
  } catch (e) {
    app.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
  renderHeader();
  if (!['browse', ''].includes(a || '') ) scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);
(async () => {
  $('#yr').textContent = new Date().getFullYear();
  try { S.cfg = await api('/config'); } catch {}
  await loadMe();
  route();
})();
