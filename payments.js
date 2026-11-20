// Passerelle de paiement. Mode "demo" : paiement simulé (aucun argent réel).
// Mode "live" : à brancher sur un agrégateur (CinetPay, Flutterwave, Stripe, API MTN MoMo / Orange Money).
const crypto = require('crypto');

const METHODS = ['mtn_momo', 'orange_money', 'card'];
const PHONE_RE = /^(\+?237)?6\d{8}$/;

async function charge({ method, phone, amountXaf, userId, planCode }) {
  if (!METHODS.includes(method)) throw Object.assign(new Error('Moyen de paiement invalide'), { status: 400 });
  if (method !== 'card' && !PHONE_RE.test(String(phone || '').replace(/\s/g, ''))) {
    throw Object.assign(new Error('Numéro Mobile Money invalide (ex : 6XXXXXXXX)'), { status: 400 });
  }
  if ((process.env.PAYMENT_MODE || 'demo') === 'demo') {
    return { status: 'paid', ref: 'DEMO-' + crypto.randomBytes(5).toString('hex').toUpperCase() };
  }
  // TODO (mode live) : appeler l'API de l'agrégateur, attendre la confirmation (webhook) puis renvoyer { status:'paid', ref }.
  throw Object.assign(new Error('Passerelle de paiement live non configurée (voir server/payments.js)'), { status: 501 });
}

module.exports = { charge, METHODS };
