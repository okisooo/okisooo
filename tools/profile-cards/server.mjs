import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, config, getSnapshot, refresh } from './data.mjs';
import { cardNames, renderCard, optionsFrom } from './render.mjs';

const renders = new Map();
const allowedParams = new Set(['theme', 'accent', 'art', 'count', 'title', 'v']);
const port = Number(process.env.PORT || 3000);

export function readme(base, opts = {}) {
  const escapedBase = base.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('v', '2');
  if (opts.accent) params.set('accent', opts.accent.replace('#', ''));
  if (opts.art) params.set('art', opts.art);
  if (opts.count) params.set('count', opts.count);
  if (opts.title) params.set('title', opts.title);
  const card = (name, alt, width) => {
    const url = theme => `${escapedBase}/${name}.svg?${new URLSearchParams({ ...Object.fromEntries(params), theme }).toString()}`;
    return `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${url('dark')}">\n  <img src="${url('light')}" alt="${alt}" width="${width}">\n</picture>`;
  };
  return `${card('banner', 'OKISO — original music, art and my little corner', 900)}

<div align="center">

### hey, i'm okiso ↗

music, art & little things i make ♡

[website ↗](https://oki.so) · [music ↗](https://oki.so/releases) · [discord ↗](https://discord.com/users/${config.discord}) · [anilist ↗](https://anilist.co/user/${config.anilist})

</div>

<a href="https://discord.com/users/${config.discord}">${card('presence', 'My Discord presence snapshot', '48%')}</a>
<a href="https://osu.ppy.sh/users/${config.osu}">${card('osu', 'My osu! profile signature', '48%')}</a>

<a href="https://anilist.co/user/${config.anilist}">${card('anime', 'Anime from my real AniList profile', 900)}</a>

<a href="https://anilist.co/user/${config.anilist}/favorites">${card('characters', 'My favorite characters on AniList', 900)}</a>

<a href="https://oki.so/releases">${card('release', 'My latest music release', 900)}</a>

${card('divider', 'little things i make', 900)}

[fleet](https://github.com/okisooo/fleet) · [codex-backdrop](https://github.com/okisooo/codex-backdrop) · [claude-backdrop](https://github.com/okisooo/claude-backdrop) · [my site](https://github.com/okisooo/site)

<details>
<summary>extra stats & old favorites</summary>

![GitHub and coding metrics](https://raw.githubusercontent.com/okisooo/okisooo/dist/metrics/metrics.svg)

![AniList favorites](metrics/metrics.plugin.anilist.svg)
![AniList character favorites](metrics/metrics.plugin.anilist.characters.svg)

</details>

<div align="center">

see you around ↗ ♡

<sub>art by suyosuyo, sobu · @sobsocks & 7mmchan · [profile cards](https://profile.oki.so)</sub>

</div>
`;
}

export const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      const sources = Object.fromEntries(Object.entries(getSnapshot().sources).map(([name, source]) => [name, { available: !!source.data, updatedAt: source.updatedAt || null, stale: !!source.error }]));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ service: 'okiso-profile-cards', sources })); return;
    }
    if (url.pathname === '/' || url.pathname === '/studio') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      const content = await readFile(join(root, 'public', 'index.html'));
      res.end(req.method === 'HEAD' ? undefined : content); return;
    }
    if (['/studio.css', '/studio.js'].includes(url.pathname)) {
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'public, max-age=3600' });
      const content = await readFile(join(root, 'public', url.pathname.slice(1)));
      res.end(req.method === 'HEAD' ? undefined : content); return;
    }
    for (const parameter of url.searchParams.keys()) if (!allowedParams.has(parameter)) throw new Error('unsupported card option');
    const options = optionsFrom(url.searchParams);
    if (url.pathname === '/readme.md') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : readme(process.env.PUBLIC_BASE || config.publicBase, options)); return;
    }
    const match = url.pathname.match(/^\/([a-z]+)\.svg$/);
    if (!match || !cardNames.includes(match[1])) { res.writeHead(404); res.end('card not found'); return; }
    if (!getSnapshot().updatedAt) await refresh();
    const key = `${match[1]}:${JSON.stringify(options)}:${getSnapshot().updatedAt}`;
    let svg = renders.get(key);
    if (!svg) {
      svg = await renderCard(match[1], getSnapshot(), options);
      if (renders.size >= 24) renders.clear();
      renders.set(key, svg);
    }
    const etag = `"${createHash('sha256').update(svg).digest('hex')}"`;
    const cacheAge = ['presence', 'osu'].includes(match[1]) ? 120 : 1800;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', `public, max-age=${cacheAge}, s-maxage=${cacheAge}`);
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : svg);
  } catch (error) {
    const isInput = /accent|count|theme|artwork|title|option/.test(error.message);
    res.writeHead(isInput ? 400 : 503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end(isInput ? error.message : 'card temporarily unavailable');
  }
});

if (process.argv[1]?.endsWith('server.mjs')) {
  server.listen(port, '0.0.0.0', () => console.log(`profile cards listening on ${port}`));
  refresh().catch(error => console.error('initial refresh failed:', error.name));
  setInterval(() => refresh().catch(error => console.error('refresh failed:', error.name)), 120000).unref();
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
