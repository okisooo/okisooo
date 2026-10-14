import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optionsFrom, renderCard, cardNames } from '../render.mjs';
import { getSnapshot } from '../data.mjs';
import { server, readme } from '../server.mjs';

test('input is bounded and unsupported themes, artwork, and color injection are rejected', () => {
  for (const query of ['accent=red', 'accent=fff%22%3E', 'count=0', 'count=13', 'count=2.5', 'theme=purple', 'art=https://localhost', `title=${'x'.repeat(56)}`]) {
    assert.throws(() => optionsFrom(new URLSearchParams(query)));
  }
  assert.equal(optionsFrom(new URLSearchParams('count=12&theme=dark&accent=ff4d4d')).accent, '#ff4d4d');
});

test('every card renders in both themes with portable image resources and exact dimensions', async () => {
  for (const theme of ['light', 'dark']) for (const name of cardNames) {
    const svg = await renderCard(name, getSnapshot(), { theme });
    assert.ok(!svg.includes('<script') && !svg.includes('<foreignObject'));
    assert.ok(!/\b(?:href|src)="https?:\/\//.test(svg), `${name} has an external nested image`);
    assert.ok(Buffer.byteLength(svg) < 4500000, `${name} exceeds the image budget`);
    const metadata = await sharp(Buffer.from(svg)).metadata();
    assert.equal(metadata.width, ['presence', 'osu'].includes(name) ? 440 : 900);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    assert.ok(png.length > 500);
  }
});

test('missing data renders an honest fallback, and large character selections still fit', async () => {
  const empty = { sources: {} };
  for (const name of ['anime', 'characters', 'presence', 'osu', 'release']) {
    const svg = await renderCard(name, empty);
    await sharp(Buffer.from(svg)).png().toBuffer();
  }
  for (const count of [1, 4, 8, 12]) {
    const svg = await renderCard('characters', getSnapshot(), { count });
    assert.ok(Buffer.byteLength(svg) < 4500000);
    await sharp(Buffer.from(svg)).png().toBuffer();
  }
});

test('markdown preserves custom settings and includes light/dark artwork', () => {
  const markdown = readme('https://profile.oki.so', { accent: '#ff4d4d', art: 'sobu', count: 8, title: 'hello & welcome' });
  assert.ok(markdown.includes('theme=dark') && markdown.includes('theme=light'));
  assert.ok(markdown.includes('title=hello+%26+welcome'));
  assert.ok(markdown.includes('width="48%"'));
  assert.ok(markdown.includes('metrics/metrics.svg'));
  assert.ok(!markdown.includes('localhost'));
});

test('HTTP supports conditional and HEAD requests, rejects mutation and bad options', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/banner.svg`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type').startsWith('image/svg+xml'));
  assert.ok(response.headers.get('etag'));
  const conditional = await fetch(`${base}/banner.svg`, { headers: { 'If-None-Match': response.headers.get('etag') } });
  assert.equal(conditional.status, 304);
  const head = await fetch(`${base}/banner.svg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/anime.svg?theme=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/anime.svg?url=http://localhost`)).status, 400);
  assert.equal((await fetch(`${base}/banner.svg`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/missing.svg`)).status, 404);
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.service, 'okiso-profile-cards');
});
