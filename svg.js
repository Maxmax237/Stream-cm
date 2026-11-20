// Affiches et bannières générées (illustrations originales, abstraites) pour le catalogue de démonstration
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function wrap(text, max) {
  const words = String(text).toUpperCase().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function poster(t) {
  const r = rng(t.id * 7 + 3);
  const h1 = t.hue, h2 = (t.hue + 70) % 360;
  let shapes = '';
  for (let i = 0; i < 9; i++) {
    const x = Math.round(r() * 400), y = Math.round(r() * 330), s = 30 + Math.round(r() * 120);
    shapes += `<circle cx="${x}" cy="${y}" r="${s}" fill="hsla(${(h1 + i * 25) % 360},80%,65%,${(0.06 + r() * 0.12).toFixed(2)})"/>`;
  }
  let city = '';
  let x = 0;
  while (x < 400) {
    const w = 20 + Math.round(r() * 38), hh = 60 + Math.round(r() * 150);
    city += `<rect x="${x}" y="${440 - hh}" width="${w}" height="${hh + 130}" fill="hsl(${h1},45%,9%)"/>`;
    for (let k = 0; k < 4; k++) {
      if (r() > 0.55) city += `<rect x="${x + 4 + Math.round(r() * (w - 10))}" y="${440 - hh + 8 + Math.round(r() * (hh - 16))}" width="3" height="5" fill="hsl(${(h2 + 20) % 360},95%,70%)"/>`;
    }
    x += w + 2;
  }
  const lines = wrap(t.title, 12);
  const text = lines.map((l, i) => `<text x="24" y="${420 - (lines.length - 1 - i) * 0 + i * 30 - lines.length * 30 + 50}" font-family="Georgia,serif" font-size="27" font-weight="700" fill="#fff" letter-spacing="1">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="hsl(${h1},70%,22%)"/><stop offset="1" stop-color="hsl(${h2},75%,10%)"/></linearGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>
<rect width="400" height="560" fill="url(#g)"/>${shapes}
<circle cx="${250 + Math.round(r() * 80)}" cy="${110 + Math.round(r() * 40)}" r="${46 + Math.round(r() * 20)}" fill="hsl(${(h1 + 30) % 360},90%,82%)" opacity=".85"/>
${city}<rect y="250" width="400" height="310" fill="url(#f)"/>${text}</svg>`;
}

function banner(t) {
  const r = rng(t.id * 13 + 5);
  const h1 = t.hue, h2 = (t.hue + 70) % 360;
  let stars = '';
  for (let i = 0; i < 90; i++) stars += `<circle cx="${Math.round(r() * 1600)}" cy="${Math.round(r() * 420)}" r="${(r() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.2 + r() * 0.6).toFixed(2)}"/>`;
  let rain = '';
  for (let i = 0; i < 70; i++) { const x = Math.round(r() * 1600), y = Math.round(r() * 700); rain += `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + 40}" stroke="#9db4ff" stroke-opacity=".12"/>`; }
  let city = '';
  let x = 0;
  while (x < 1600) {
    const w = 50 + Math.round(r() * 110), hh = 120 + Math.round(r() * 380);
    city += `<rect x="${x}" y="${700 - hh}" width="${w}" height="${hh}" fill="hsl(${h1},40%,${6 + Math.round(r() * 5)}%)"/>`;
    const neon = (h2 + Math.round(r() * 80)) % 360;
    if (r() > 0.5) city += `<rect x="${x + 6}" y="${700 - hh + 14}" width="${Math.max(8, w - 12)}" height="10" fill="hsl(${neon},95%,62%)" opacity=".9"/>`;
    for (let k = 0; k < 14; k++) if (r() > 0.6) city += `<rect x="${x + 6 + Math.round(r() * (w - 14))}" y="${700 - hh + 34 + Math.round(r() * (hh - 50))}" width="4" height="6" fill="hsl(${(neon + 20) % 360},95%,72%)" opacity=".8"/>`;
    x += w + 3;
  }
  const hero = `<g transform="translate(1180 330)"><path d="M0 330 L-20 120 Q0 40 60 40 Q120 40 140 120 L170 330 Z" fill="#05050a"/><circle cx="62" cy="10" r="30" fill="#0a0a12"/><path d="M40 -10 Q62 -34 90 -6 L96 40 Q60 24 34 40 Z" fill="hsl(${h1},20%,80%)" opacity=".85"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h1},60%,9%)"/><stop offset=".6" stop-color="hsl(${h2},60%,15%)"/><stop offset="1" stop-color="hsl(${h1},50%,8%)"/></linearGradient>
<radialGradient id="m"><stop offset="0" stop-color="hsl(${(h1 + 30) % 360},80%,92%)"/><stop offset="1" stop-color="hsl(${(h1 + 30) % 360},70%,70%)"/></radialGradient></defs>
<rect width="1600" height="700" fill="url(#s)"/>${stars}
<circle cx="1050" cy="190" r="${110 + Math.round(r() * 20)}" fill="url(#m)"/><circle cx="1050" cy="190" r="190" fill="hsl(${(h1 + 30) % 360},80%,70%)" opacity=".08"/>
${city}${hero}${rain}</svg>`;
}

module.exports = { poster, banner };
