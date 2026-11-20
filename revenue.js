// Reversement automatique : à chaque paiement, X % (7 % par défaut) est réparti entre les fournisseurs de contenu
const { db } = require('./db');

const SHARE_PCT = Number(process.env.REVENUE_SHARE_PCT || 7);

/**
 * Répartit la part fournisseurs d'un paiement au prorata des vues des 30 derniers jours.
 * S'il n'y a aucune vue, répartition égale. Le reste d'arrondi va au plus gros bénéficiaire.
 * Les lignes créées ont le statut "pending" : le virement réel se fait via Mobile Money / banque
 * puis l'admin marque la ligne "paid" (voir /api/admin/payouts).
 */
function distribute(paymentId, amountXaf) {
  const pool = Math.round((amountXaf * SHARE_PCT) / 100);
  if (pool <= 0) return { pool: 0, parts: [] };

  const since = Date.now() - 30 * 86400000;
  let weights = db.prepare(`
    SELECT t.provider_id AS pid, COUNT(*) AS w FROM views_log v JOIN titles t ON t.id=v.title_id
    WHERE v.created_at>=? AND t.provider_id IS NOT NULL GROUP BY t.provider_id`).all(since);
  if (!weights.length) weights = db.prepare('SELECT id AS pid, 1 AS w FROM providers').all();
  if (!weights.length) return { pool, parts: [] };

  const total = weights.reduce((s, x) => s + x.w, 0);
  const parts = weights.map((x) => ({ pid: x.pid, amount: Math.floor((pool * x.w) / total), w: x.w }));
  const remainder = pool - parts.reduce((s, p) => s + p.amount, 0);
  parts.sort((a, b) => b.w - a.w);
  parts[0].amount += remainder;

  const ins = db.prepare('INSERT INTO revenue_shares(payment_id,provider_id,amount_xaf,created_at) VALUES(?,?,?,?)');
  const now = Date.now();
  for (const p of parts) if (p.amount > 0) ins.run(paymentId, p.pid, p.amount, now);
  return { pool, parts: parts.map((p) => ({ provider_id: p.pid, amount_xaf: p.amount })) };
}

module.exports = { distribute, SHARE_PCT };
