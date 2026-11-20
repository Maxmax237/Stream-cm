// Mots de passe (scrypt) + jetons signés HMAC-SHA256 (format JWT HS256), sans dépendance
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
  ? process.env.JWT_SECRET
  : crypto.randomBytes(32).toString('hex'); // sessions invalidées au redémarrage si non défini

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  try {
    const [, s, h] = stored.split('$');
    const t = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
    return crypto.timingSafeEqual(t, Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function signToken(payload, ttlSec = 7 * 86400) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec });
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [h, b, s] = String(token).split('.');
    const exp = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
    const a = Buffer.from(s), e = Buffer.from(exp);
    if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
