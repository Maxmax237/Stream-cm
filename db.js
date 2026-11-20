// Base SQLite (module natif node:sqlite) : schéma + données de démonstration
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'otaku.db'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', trial_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS plans(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, price_xaf INTEGER NOT NULL,
  duration_hours INTEGER NOT NULL, quality TEXT NOT NULL, devices INTEGER NOT NULL,
  downloads_per_day INTEGER NOT NULL, perks TEXT NOT NULL, sort INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active', is_trial INTEGER NOT NULL DEFAULT 0, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan_id INTEGER NOT NULL REFERENCES plans(id),
  amount_xaf INTEGER NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL, ref TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS providers(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, contact TEXT, payout_info TEXT);
CREATE TABLE IF NOT EXISTS titles(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, synopsis TEXT NOT NULL,
  genres TEXT NOT NULL, year INTEGER NOT NULL, rating REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ongoing',
  age TEXT NOT NULL DEFAULT '12+', provider_id INTEGER REFERENCES providers(id), license_holder TEXT, license_end TEXT,
  featured INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, hue INTEGER NOT NULL DEFAULT 260, badge TEXT);
CREATE TABLE IF NOT EXISTS episodes(
  id INTEGER PRIMARY KEY, title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE, number INTEGER NOT NULL,
  name TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 24, video_url TEXT, free INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS watchlist(
  user_id INTEGER NOT NULL REFERENCES users(id), title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, title_id));
CREATE TABLE IF NOT EXISTS views_log(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title_id INTEGER NOT NULL, episode_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS downloads(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, episode_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS revenue_shares(
  id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES payments(id), provider_id INTEGER NOT NULL REFERENCES providers(id),
  amount_xaf INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, paid_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_titles_type ON titles(type);
CREATE INDEX IF NOT EXISTS idx_views_created ON views_log(created_at);
`);

const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function seed() {
  // Plans (toujours synchronisés)
  const plans = [
    ['daily', 'Pass Jour', 200, 24, '720p', 1, 0, ['Accès illimité pendant 24 h', 'Qualité HD 720p', '1 appareil', 'Sans publicité']],
    ['weekly', 'Pass Semaine', 1000, 168, '1080p', 2, 3, ['Accès illimité pendant 7 jours', 'Full HD 1080p', '2 appareils', '3 téléchargements / jour', 'Sans publicité']],
    ['monthly', 'Pass Mois', 3000, 720, '1080p', 3, 10, ['Accès illimité pendant 30 jours', 'Full HD 1080p', '3 appareils', '10 téléchargements / jour', 'Nouveaux épisodes en simulcast', 'Sans publicité']],
    ['yearly', 'Pass Année', 30000, 8760, '4K', 5, -1, ['Accès illimité pendant 365 jours', 'Qualité 4K', '5 appareils', 'Téléchargements illimités', 'Avant-premières et badge Fondateur', '2 mois offerts vs mensuel', 'Support prioritaire']],
  ];
  const upPlan = db.prepare(`INSERT INTO plans(code,name,price_xaf,duration_hours,quality,devices,downloads_per_day,perks,sort) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,price_xaf=excluded.price_xaf,duration_hours=excluded.duration_hours,quality=excluded.quality,devices=excluded.devices,downloads_per_day=excluded.downloads_per_day,perks=excluded.perks,sort=excluded.sort`);
  plans.forEach((p, i) => upPlan.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], JSON.stringify(p[7]), i + 1));

  // Super administrateur : identifiants lus dans .env, jamais écrits dans le code
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.SUPERADMIN_PASSWORD || '';
  if (email && pw) {
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (!u) db.prepare('INSERT INTO users(email,name,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(email, 'Super Admin', hashPassword(pw), 'superadmin', Date.now());
    else db.prepare("UPDATE users SET role='superadmin', status='active' WHERE id=?").run(u.id);
  } else {
    console.warn('[seed] SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD absents du .env : aucun super admin créé.');
  }

  if (db.prepare('SELECT COUNT(*) c FROM titles').get().c > 0) return;

  // Fournisseurs de démonstration (À REMPLACER par vos vrais partenaires sous contrat)
  const provs = [
    ['Kamer Toon Studio', 'Créateur original (Cameroun)', 'contact@kamertoon.example'],
    ['Savanna Pictures', 'Studio partenaire (licence)', 'licences@savanna.example'],
    ['Archive Domaine Public', 'Domaine public / Creative Commons', 'archive@example.org'],
    ['Indie Webtoon Collective', 'Collectif d\'auteurs indépendants', 'hello@indiewebtoon.example'],
    ['Nimbus Anime Partners', 'Éditeur partenaire (licence)', 'partners@nimbus.example'],
  ];
  const insP = db.prepare('INSERT INTO providers(name,kind,contact,payout_info) VALUES(?,?,?,?)');
  provs.forEach((p) => insP.run(p[0], p[1], p[2], 'À renseigner (Mobile Money / virement)'));

  // [titre, type, genres, année, note, statut, âge, fournisseur, badge, teinte, synopsis]
  const T = [
    ['Velvet Moon Protocol', 'anime', 'Action,Mystery,Sci-Fi', 2026, 4.9, 'ongoing', '16+', 5, 'Featured', 268, 'Quand une agence secrète découvre une prophétie interdite sous le ciel néon, une agente rebelle et un stratège énigmatique doivent réécrire le destin, une décision à la fois.'],
    ['Neon Blade Chronicles', 'anime', 'Action,Sci-Fi', 2026, 4.9, 'ongoing', '16+', 5, 'New', 285, 'Dans une mégapole saturée de lumière, une lame-relique choisit sa porteuse.'],
    ['Savane Cyber', 'anime', 'Action,Fantasy', 2025, 4.6, 'completed', '12+', 1, 'Popular', 28, 'Un jeune griot numérique réveille les esprits de la savane connectée.'],
    ['Kilimanjaro Samurai', 'anime', 'Adventure,Action', 2025, 4.7, 'completed', '12+', 2, 'Trending', 160, 'Un forgeron du Kilimandjaro traverse trois royaumes pour réparer une épée brisée.'],
    ['Étoile de Douala', 'anime', 'Romance,Drama', 2026, 4.5, 'ongoing', '12+', 1, 'New', 330, 'Deux étudiants en danse urbaine se retrouvent à Douala au rythme du makossa futuriste.'],
    ['Tempête sur Mboa', 'anime', 'Fantasy,Adventure', 2024, 4.4, 'completed', '12+', 5, null, 200, 'Les esprits de la forêt de Mboa se réveillent à l\'arrivée de la saison des orages.'],
    ['Les Nuits de Bamenda', 'serie', 'Drama,Thriller', 2025, 4.6, 'ongoing', '16+', 2, 'Popular', 12, 'Une journaliste enquête sur des disparitions dans les collines de Bamenda.'],
    ['Quartier Latin 237', 'serie', 'Comedy,Drama', 2024, 4.3, 'completed', '12+', 1, null, 48, 'Cinq colocataires, une cité universitaire, mille galères.'],
    ['Code Mvog-Ada', 'serie', 'Thriller,Crime', 2026, 4.7, 'ongoing', '16+', 2, 'New', 350, 'Un hacker de Yaoundé est entraîné dans une affaire de corruption internationale.'],
    ['Les Héritiers du Wouri', 'serie', 'Drama,Family', 2023, 4.2, 'completed', '12+', 1, null, 190, 'Trois familles rivales se disputent le port de Douala.'],
    ['Le Dernier Griot', 'film', 'Drama,Fantasy', 2025, 4.8, 'completed', '12+', 1, 'Featured', 40, 'Le dernier griot d\'un village confie ses récits à une jeune réfugiée.'],
    ['Nosferatu (Archive 1922)', 'film', 'Horror,Classic', 1922, 4.1, 'completed', '16+', 3, 'Domaine public', 120, 'Classique du cinéma muet, film du domaine public restauré.'],
    ['Voyage vers la Lune (Archive 1902)', 'film', 'Sci-Fi,Classic', 1902, 4.0, 'completed', 'Tous', 3, 'Domaine public', 220, 'Court-métrage pionnier du cinéma fantastique, domaine public.'],
    ['Sahel Express', 'film', 'Action,Adventure', 2026, 4.4, 'completed', '12+', 2, 'New', 18, 'Une course contre la montre à travers le Sahel à bord d\'un train blindé.'],
    ['Quantum Love Recipe', 'webtoon', 'Romance,Comedy', 2026, 4.9, 'ongoing', '12+', 4, 'Featured', 150, 'Une cheffe prodige découvre que ses recettes modifient les sentiments.'],
    ['Chronicles of Ember', 'webtoon', 'Adventure,Action', 2026, 4.5, 'ongoing', '12+', 4, 'Hot', 215, 'Un jeune épéiste hérite d\'une braise qui ne s\'éteint jamais.'],
    ['Midnight Pharmacy', 'webtoon', 'Supernatural,Drama', 2025, 4.8, 'completed', '16+', 4, 'Completed', 190, 'Une pharmacie qui n\'ouvre qu\'à minuit soigne les maux surnaturels.'],
    ['Dream Harbor Diary', 'webtoon', 'Slice of Life,Romance', 2026, 4.7, 'ongoing', 'Tous', 1, 'New', 195, 'Chronique tendre d\'un port de pêche où chaque été change une vie.'],
    ['Starlight Contract', 'webtoon', 'Romance,Drama', 2026, 4.8, 'ongoing', '12+', 4, 'Popular', 340, 'Une idole et son manager signent un contrat qui n\'a rien de professionnel.'],
    ['Forest of Petals', 'webtoon', 'Fantasy,Mystery', 2025, 4.7, 'completed', '12+', 4, 'Trending', 135, 'Dans la forêt des pétales, chaque fleur garde un souvenir volé.'],
    ['Cyber Shrine Girl', 'webtoon', 'Cyber,Thriller', 2026, 4.6, 'ongoing', '16+', 4, 'New', 355, 'Une gardienne de sanctuaire protège un temple devenu serveur.'],
    ['Griot 2099', 'webtoon', 'Sci-Fi,Adventure', 2026, 4.5, 'ongoing', '12+', 1, 'New', 40, 'Au 22e siècle, un conteur voyage dans la mémoire des peuples.'],
    ['Ndolo & Cie', 'webtoon', 'Comedy,Slice of Life', 2025, 4.3, 'ongoing', 'Tous', 1, null, 75, 'Les aventures d\'une famille de commerçants du marché Mokolo.'],
    ['Lune d\'Ébène', 'webtoon', 'Fantasy,Romance', 2024, 4.6, 'completed', '12+', 4, null, 290, 'Une princesse sans royaume apprend à dompter l\'ombre de la lune.'],
  ];
  const insT = db.prepare(`INSERT INTO titles(slug,title,type,synopsis,genres,year,rating,status,age,provider_id,license_holder,license_end,featured,views,hue,badge)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insE = db.prepare('INSERT INTO episodes(title_id,number,name,duration_min,video_url,free) VALUES(?,?,?,?,?,?)');
  T.forEach((t, i) => {
    const holder = provs[t[7] - 1][0];
    const lic = t[1] === 'film' && t[3] < 1950 ? null : '2028-12-31';
    const views = Math.round(20000 + Math.random() * 130000);
    const r = insT.run(slugify(t[0]), t[0], t[1], t[10], t[2], t[3], t[4], t[5], t[6], t[7], holder, lic, i === 0 ? 1 : 0, views, t[9], t[8]);
    const id = Number(r.lastInsertRowid);
    if (t[1] === 'film') insE.run(id, 1, 'Film complet', 95, null, 0);
    else for (let n = 1; n <= 8; n++) insE.run(id, n, `Épisode ${n}`, t[1] === 'webtoon' ? 6 : 24, null, n <= 2 ? 1 : 0);
  });
}

module.exports = { db, seed, slugify };
