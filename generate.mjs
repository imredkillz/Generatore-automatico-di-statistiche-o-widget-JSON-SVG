import { readFile, writeFile } from 'node:fs/promises';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cut = (s, max = 40) => {
  const str = String(s ?? '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'StatsWidget/1.0', ...headers }
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const sources = [
  async (cfg) => {
    if (!cfg.github) {
      console.log('[GITHUB] Saltato: campo "github" vuoto in config.json');
      return null;
    }
    const headers = process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {};
    const d = await getJson(`https://api.github.com/users/${cfg.github}`, headers);
    const repoLabel = d.public_repos === 1 ? 'repo' : 'repos';
    const followerLabel = d.followers === 1 ? 'follower' : 'followers';
    console.log('[GITHUB] OK');
    return {
      key: 'github',
      label: 'GITHUB',
      color: '#58a6ff',
      meta: '↗',
      value: `${d.public_repos} ${repoLabel} · ${d.followers} ${followerLabel}`,
      primary: `${d.public_repos} ${repoLabel}`,
      secondary: `${d.followers} ${followerLabel} · @${cfg.github}`,
      raw: { repos: d.public_repos, followers: d.followers }
    };
  },

  async (cfg) => {
    if (!cfg.discordUsername) {
      console.log('[DISCORD] Saltato: campo "discordUsername" vuoto in config.json');
      return null;
    }
    const handle = cfg.discordUsername.startsWith('@')
      ? cfg.discordUsername
      : `@${cfg.discordUsername}`;
    console.log('[DISCORD] OK');
    return {
      key: 'discord',
      label: 'DISCORD',
      color: '#5865f2',
      meta: '↗',
      value: handle,
      primary: cut(handle, 28),
      secondary: cut(cfg.discordNote || 'DM on Discord', 42),
      raw: { username: handle }
    };
  },

  async (cfg) => {
    if (!cfg.focusPrimary) {
      console.log('[FOCUS] Saltato: campo "focusPrimary" vuoto in config.json');
      return null;
    }
    const label = (cfg.focusLabel || 'FOCUS').toUpperCase();
    const primary = cfg.focusPrimary;
    const secondary = cfg.focusSecondary || 'Stack & current focus';
    console.log('[FOCUS] OK');
    return {
      key: 'focus',
      label,
      color: '#a371f7',
      meta: '',
      value: cut(cfg.focusSecondary ? `${primary} · ${cfg.focusSecondary}` : primary, 36),
      primary: cut(primary, 28),
      secondary: cut(secondary, 42),
      raw: { label, primary, secondary }
    };
  },

  async (cfg) => {
    if (!cfg.discogs) {
      console.log('[DISCOGS] Saltato: campo "discogs" vuoto in config.json');
      return null;
    }
    const d = await getJson(
      `https://api.discogs.com/users/${cfg.discogs}/collection/folders/0`
    );
    const recordLabel = d.count === 1 ? 'record' : 'records';
    console.log('[DISCOGS] OK');
    return {
      key: 'discogs',
      label: 'DISCOGS',
      color: '#f59e0b',
      meta: '↗',
      value: `${d.count} ${recordLabel} in collection`,
      primary: `${d.count} ${recordLabel}`,
      secondary: `collection · @${cfg.discogs}`,
      raw: { count: d.count }
    };
  },

  async (cfg) => {
    const key = process.env.LASTFM_API_KEY;
    if (!cfg.lastfm) {
      console.log('[MUSIC] Saltato: campo "lastfm" vuoto in config.json');
      return null;
    }
    if (!key) {
      console.log('[MUSIC] Saltato: manca il Secret LASTFM_API_KEY in GitHub');
      return null;
    }
    const d = await getJson(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${cfg.lastfm}&api_key=${key}&format=json&limit=1`
    );
    const t = d.recenttracks?.track?.[0];
    const isPlaying = t?.['@attr']?.nowplaying === 'true';
    const artist = t?.artist?.['#text'] || '';
    const track = t?.name || '';
    const trackText = t ? `${artist} — ${track}` : 'No recent tracks';
    console.log('[MUSIC] OK');
    return {
      key: 'music',
      label: 'MUSIC',
      color: '#1db954',
      meta: t ? (isPlaying ? 'NOW PLAYING' : 'RECENT') : '',
      metaColor: isPlaying ? '#1db954' : '#6e7681',
      pulse: Boolean(t),
      value: cut(trackText, 36),
      primary: t ? cut(track, 28) : 'No recent tracks',
      secondary: t ? cut(artist, 42) : 'Waiting for scrobbles',
      raw: t ? { artist, track, nowPlaying: isPlaying } : null
    };
  }
];

function renderHeaderSVG(cfg) {
  const width = 724;
  const height = 62;
  const title = cfg.headerTitle || cfg.github || 'dev';
  const bio = cfg.headerBio || 'dev.';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="clip-header">
      <rect width="${width}" height="${height}" rx="12"/>
    </clipPath>
    <radialGradient id="glow-header" cx="6%" cy="50%" r="45%">
      <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.09"/>
      <stop offset="100%" stop-color="#58a6ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="border-header" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#30363d" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#21262d" stop-opacity="0.8"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .cursor { animation: blink 1.1s step-end infinite; }
  </style>
  <g clip-path="url(#clip-header)">
    <rect width="${width}" height="${height}" fill="#0d1117"/>
    <rect width="${width}" height="${height}" fill="url(#glow-header)"/>
  </g>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="11.5" fill="none" stroke="url(#border-header)" stroke-width="1"/>
  <text x="22" y="36" fill="#e6edf3" font-size="16" font-weight="700" letter-spacing="0.3"><tspan fill="#58a6ff">&gt; </tspan>${esc(title)}<tspan class="cursor" fill="#58a6ff">_</tspan></text>
  <text x="${width - 22}" y="35" text-anchor="end" fill="#8b949e" font-size="12" letter-spacing="0.8">${esc(bio)}</text>
</svg>`;
}

function renderDashboardSVG(title, updated, rows) {
  const width = 480;
  const rowHeight = 36;
  const height = 56 + rows.length * rowHeight + 12;

  const content = rows.map((r, i) => {
    const y = 74 + i * rowHeight;
    return `
      <circle cx="24" cy="${y - 4}" r="3.5" fill="${r.color}"/>
      <text x="38" y="${y}" fill="#8b949e" font-size="11" letter-spacing="1">${esc(r.label)}</text>
      <text x="${width - 20}" y="${y}" text-anchor="end" fill="#e6edf3" font-size="12.5" font-weight="600">${esc(r.value)}</text>
    `;
  }).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
  <rect width="${width}" height="${height}" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <text x="20" y="31" fill="#e6edf3" font-size="13" font-weight="700" letter-spacing="0.5">${esc(title)}</text>
  <text x="${width - 20}" y="31" text-anchor="end" fill="#6e7681" font-size="10">${esc(updated)}</text>
  <line x1="20" y1="45" x2="${width - 20}" y2="45" stroke="#21262d" stroke-width="1"/>
  ${content}
</svg>`;
}

function renderCardSVG(item) {
  const width = 360;
  const height = 100;
  const isArrow = item.meta === '↗';

  const pulseCss = item.pulse
    ? `
    @keyframes pulse {
      0%, 100% { opacity: 0.12; }
      50% { opacity: 0.42; }
    }
    .pulse { animation: pulse 2.4s ease-in-out infinite; }`
    : '';

  const pulseRing = item.pulse
    ? `<circle cx="22" cy="24" r="7.5" fill="${item.color}" class="pulse"/>`
    : '';

  const metaEl = item.meta
    ? `<text x="${width - 20}" y="28" text-anchor="end" fill="${item.metaColor || '#6e7681'}" font-size="${isArrow ? '12' : '9.5'}" font-weight="600" letter-spacing="${isArrow ? '0' : '0.8'}">${esc(item.meta)}</text>`
    : '';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="clip-${item.key}">
      <rect width="${width}" height="${height}" rx="12"/>
    </clipPath>
    <radialGradient id="glow-${item.key}" cx="10%" cy="12%" r="60%">
      <stop offset="0%" stop-color="${item.color}" stop-opacity="0.11"/>
      <stop offset="100%" stop-color="${item.color}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="border-${item.key}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#30363d" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#21262d" stop-opacity="0.8"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }${pulseCss}
  </style>
  <g clip-path="url(#clip-${item.key})">
    <rect width="${width}" height="${height}" fill="#0d1117"/>
    <rect width="${width}" height="${height}" fill="url(#glow-${item.key})"/>
  </g>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="11.5" fill="none" stroke="url(#border-${item.key})" stroke-width="1"/>
  ${pulseRing}
  <circle cx="22" cy="24" r="3.5" fill="${item.color}"/>
  <text x="36" y="28" fill="#8b949e" font-size="10.5" font-weight="600" letter-spacing="1.2">${esc(item.label)}</text>
  ${metaEl}
  <text x="20" y="60" fill="#e6edf3" font-size="16.5" font-weight="700">${esc(item.primary)}</text>
  <text x="20" y="81" fill="#8b949e" font-size="11.5">${esc(item.secondary)}</text>
</svg>`;
}

async function main() {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const results = await Promise.allSettled(sources.map((fn) => fn(cfg)));

  const rows = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) rows.push(r.value);
    if (r.status === 'rejected') console.warn('Errore sorgente:', r.reason.message);
  }

  const updated = new Date().toISOString().split('T')[0];

  await Promise.all([
    writeFile('stats.json', JSON.stringify({ updated, items: rows }, null, 2)),
    writeFile('stats.svg', renderDashboardSVG(cfg.title || 'STATS', updated, rows)),
    writeFile('header.svg', renderHeaderSVG(cfg)),
    ...rows.map((r) => writeFile(`${r.key}.svg`, renderCardSVG(r)))
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
