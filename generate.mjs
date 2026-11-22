import { readFile, writeFile } from 'node:fs/promises';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cut = (s, max = 34) => {
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
    console.log('[GITHUB] OK');
    return {
      key: 'github',
      label: 'GITHUB',
      color: '#58a6ff',
      value: `${d.public_repos} repos · ${d.followers} followers`,
      primary: `${d.public_repos} repos`,
      secondary: `${d.followers} followers · @${cfg.github}`,
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
      value: handle,
      primary: cut(handle, 22),
      secondary: cfg.discordNote || 'Profilo Discord',
      raw: { username: handle }
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
    console.log('[DISCOGS] OK');
    return {
      key: 'discogs',
      label: 'DISCOGS',
      color: '#f59e0b',
      value: `${d.count} dischi in collezione`,
      primary: `${d.count} dischi`,
      secondary: `collezione · @${cfg.discogs}`,
      raw: { count: d.count }
    };
  },

  async (cfg) => {
    const key = process.env.STEAM_API_KEY;
    if (!cfg.steamId) {
      console.log('[STEAM] Saltato: campo "steamId" vuoto in config.json');
      return null;
    }
    if (!key) {
      console.log('[STEAM] Saltato: manca il Secret STEAM_API_KEY in GitHub');
      return null;
    }
    const d = await getJson(
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${cfg.steamId}&count=1`
    );
    const game = d.response?.games?.[0];
    const hours = game ? (game.playtime_2weeks / 60).toFixed(1) : '0.0';
    console.log('[STEAM] OK');
    return {
      key: 'steam',
      label: 'STEAM',
      color: '#66c0f4',
      value: game ? `${cut(game.name, 24)} · ${hours}h` : 'Nessun gioco recente',
      primary: game ? cut(game.name, 23) : 'Nessun gioco',
      secondary: game ? `${hours}h nelle ultime 2 settimane` : 'Nessuna attività recente',
      raw: game ? { game: game.name, hours2Weeks: Number(hours) } : null
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
    const artist = t?.artist?.['#text'] || '';
    const track = t?.name || '';
    const trackText = t ? `${artist} — ${track}` : 'Nessun ascolto';
    console.log('[MUSIC] OK');
    return {
      key: 'music',
      label: 'MUSIC',
      color: '#1db954',
      value: cut(trackText, 36),
      primary: t ? cut(track, 23) : 'Nessun ascolto',
      secondary: t ? cut(artist, 34) : 'In attesa di nuovi brani',
      raw: t ? { artist, track } : null
    };
  }
];

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
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <text x="20" y="31" fill="#e6edf3" font-size="13" font-weight="700" letter-spacing="0.5">${esc(title)}</text>
  <text x="${width - 20}" y="31" text-anchor="end" fill="#6e7681" font-size="10">${esc(updated)}</text>
  <line x1="20" y1="45" x2="${width - 20}" y2="45" stroke="#21262d" stroke-width="1"/>
  ${content}
</svg>`;
}

function renderCardSVG(item, updated) {
  const width = 300;
  const height = 94;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <circle cx="22" cy="24" r="3.5" fill="${item.color}"/>
  <text x="34" y="28" fill="#8b949e" font-size="10.5" font-weight="600" letter-spacing="1">${esc(item.label)}</text>
  <text x="${width - 20}" y="28" text-anchor="end" fill="#6e7681" font-size="9.5">${esc(updated)}</text>
  <text x="20" y="57" fill="#e6edf3" font-size="16" font-weight="700">${esc(item.primary)}</text>
  <text x="20" y="77" fill="#8b949e" font-size="11">${esc(item.secondary)}</text>
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
    ...rows.map((r) => writeFile(`${r.key}.svg`, renderCardSVG(r, updated)))
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
