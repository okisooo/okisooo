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
  params.set('v', '4');
  if (opts.accent) params.set('accent', opts.accent.replace('#', ''));
  if (opts.art) params.set('art', opts.art);
  if (opts.count) params.set('count', opts.count);
  if (opts.title) params.set('title', opts.title);
  const card = (name, alt, width) => {
    const url = theme => `${escapedBase}/${name}.svg?${new URLSearchParams({ ...Object.fromEntries(params), theme }).toString()}`;
    return `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${url('dark')}">\n  <img src="${url('light')}" alt="${alt}" width="${width}">\n</picture>`;
  };
  return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/okisooo/okisooo/main/assets/profile/motion/hero-dark.gif">
  <img src="https://raw.githubusercontent.com/okisooo/okisooo/main/assets/profile/motion/hero-light.gif" alt="okiso — ideas in motion. original character artwork on an animated artist's workbench; music, art, aether, backdrop and fleet" width="900">
</picture>

<div align="center">

### hey, i'm okiso ♡

i make original music, collect art, and build little tools i want to use.

**[my world ↗](https://oki.so)** · **[listen ↗](https://oki.so/releases)** · [discord](https://discord.com/users/274178934143451137) · [anilist](https://anilist.co/user/okiso)

[backdrop · ai wallpapers](https://github.com/okisooo/backdrop) · [fleet · ai usage](https://github.com/okisooo/fleet) · [practice room](https://nihongo.okiso.net)

<sub>[prefer less motion? view the still version](https://github.com/okisooo/okisooo/blob/main/README-static.md)</sub>

</div>

## music, art & my little world

<p><a href="https://oki.so"><picture>
  <img src="https://raw.githubusercontent.com/okisooo/okisooo/main/assets/profile/motion/world-motion-v1.gif" alt="oki.so — music, art and everything in between, with OTORIxxx's animated diary artwork and a bobbing red mascot" width="900">
</picture></a></p>

my home for original releases, commissioned artwork, and whatever i'm making next.

**[listen to my music ↗](https://oki.so/releases)** · [wander through the art gallery](https://oki.so/gallery) · [website source](https://github.com/okisooo/site)

<p><a href="https://oki.so/releases">${card('release', 'my latest music release', 900)}</a></p>

## on my workbench

<p><picture>
  <img src="https://raw.githubusercontent.com/okisooo/okisooo/main/assets/profile/motion/aether-motion-v1.gif" alt="aether, in development — real arrangement, mixer and piano-roll stills from a synthetic session, with an animated cloud mascot" width="900">
</picture></p>

**aether** is my native windows music workstation, with shared controls for people and agents. **still in development.**

<sub>the preview cycles through cropped editor stills from a synthetic session; it isn't a live playback recording.</sub>

## little tools for a nicer everyday

| project | what it does | try it |
| :--- | :--- | :--- |
| **[backdrop ↗](https://github.com/okisooo/backdrop)** | your own images and animated wallpapers behind claude desktop, codex desktop, and t3 code. blur and contrast controls included. | **[windows download](https://github.com/okisooo/backdrop/releases/latest/download/Backdrop-win-x64.zip)** |
| **[fleet ↗](https://github.com/okisooo/fleet)** | ai usage, quotas, and reset times in one windows tray app. | **[windows download](https://github.com/okisooo/fleet/releases/latest)** |
| **[practice room ↗](https://github.com/okisooo/NihongoRevisionSuite)** | short language-practice rounds for reading, writing, listening, and recall. | **[open practice room](https://nihongo.okiso.net)** |

<details>
<summary>watch backdrop in the real app ♡</summary>

<p><a href="https://github.com/okisooo/backdrop"><picture><img src="https://raw.githubusercontent.com/okisooo/backdrop/main/docs/media/real-app-demo.gif" alt="real claude desktop recording: original app beside an animated backdrop wallpaper, using an empty chat and an unsent sample prompt" width="900"></picture></a></p>

**[get backdrop ↗](https://github.com/okisooo/backdrop)** · [watch the video](https://github.com/okisooo/backdrop/releases/download/v2.0.0/real-app-demo.mp4)

<sub>free & open source · runtime included · the demo contains no private chats</sub>

</details>

## after hours

<p align="center">
<a href="https://discord.com/users/274178934143451137">${card('presence', 'my discord presence snapshot', '48%')}</a>
<a href="https://osu.ppy.sh/users/oxo7">${card('osu', 'my osu! profile signature', '48%')}</a>
</p>

<p><a href="https://anilist.co/user/okiso">${card('anime', 'my anime shelf from anilist', 900)}</a></p>

<details>
<summary>favorite characters ♡</summary>

<p><a href="https://anilist.co/user/okiso/favorites">${card('characters', 'my favorite characters on anilist', 900)}</a></p>

</details>

<details>
<summary>a few github stats</summary>

![github and coding metrics](https://raw.githubusercontent.com/okisooo/okisooo/dist/metrics/metrics.svg)

</details>

<br>

<div align="center">

<a href="https://oki.so/gallery"><picture><img src="https://raw.githubusercontent.com/okisooo/okisooo/main/assets/profile/motion/chibi-motion-v1.gif" alt="a little spinning okiso chibi, animated artwork by engawa110" width="140"></picture></a>

thanks for stopping by — make yourself at home ♡

<sub>header art: suyosuyo, sobu · @sobsocks & 7mmchan<br>diary & red mascot: OTORIxxx · spinning chibi: engawa110<br>artwork belongs to its creators · [gallery & credits](https://oki.so/gallery) · [live cards](https://profile.oki.so)</sub>

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
