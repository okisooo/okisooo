import satori from 'satori';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Explicit destinations keep rendered frames out of the source checkout.
const [outArg, scratchArg] = process.argv.slice(2);
if (!outArg || !scratchArg) throw new Error('Usage: node build-project-motion.mjs <output-dir> <frame-dir>');
const out = resolve(outArg), scratch = resolve(scratchArg);
const assets = fileURLToPath(new URL('./assets/motion/', import.meta.url));
await Promise.all([mkdir(out, { recursive: true }), mkdir(scratch, { recursive: true })]);
const W = 900, fps = 12;
const fonts = await Promise.all([
  ...[400, 700, 900].map(weight => ({ name: 'Archivo', weight, style: 'normal', file: `@fontsource/archivo/files/archivo-latin-${weight}-normal.woff` })),
  { name: 'Geist Mono', weight: 400, style: 'normal', file: '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff' },
].map(async ({ file, ...font }) => ({ ...font, data: await readFile(new URL(import.meta.resolve(file))) })));
const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } });
const box = (style, ...children) => h('div', { style: { display: 'flex', flexDirection: 'column', ...style } }, ...children);
const label = (value, left, top, style = {}) => box({ position: 'absolute', left, top, fontSize: 14, ...style }, value);
async function renderBase(height, background, children) {
  return sharp(Buffer.from(await satori(box({ width: W, height, position: 'relative', overflow: 'hidden', background,
    color: '#28282C', fontFamily: 'Archivo', borderRadius: 18, border: '1px solid #C6C6CC' }, children), { width: W, height, fonts }))).flatten({ background }).png().toBuffer();
}
async function decodeWebp(name, size) {
  const input = join(assets, name), meta = await sharp(input, { animated: true }).metadata();
  const delays = meta.delay || [100];
  const duration = delays.reduce((a, b) => a + b, 0);
  const frames = [];
  for (let i = 0; i < (meta.pages || 1); i++) frames.push(await sharp(input, { page: i, pages: 1 }).resize(size, size).png().toBuffer());
  return { frames, duration, delays, at(ms) {
    let time = ms % duration;
    for (let i = 0; i < frames.length; i++) { if (time < delays[i]) return frames[i]; time -= delays[i]; }
    return frames[0];
  } };
}
function run(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
}
async function finish(name, frameDir, height, rate = fps) {
  const input = join(frameDir, '%03d.png');
  run(['-framerate', String(rate), '-i', input, '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=full:reserve_transparent=1[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', join(out, `${name}.gif`)]);
  run(['-framerate', String(rate), '-i', input, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${name}.mp4`)]);
  await copyFile(join(frameDir, '000.png'), join(out, `${name}.png`));
  console.log(`${name}: ${W}x${height}, ${rate} fps`);
}

// The diary animation is an existing public commission, with its original four-second loop.
const diary = await decodeWebp('otori-animated-motion.webp', 260);
const mascot = await sharp(join(assets, 'otori-mascot-front.webp')).ensureAlpha().resize(92, 92, { fit: 'contain', background: '#FAFAFA00' }).png().toBuffer();
const siteBase = await renderBase(310, '#FAFAFA', [
  box({ position: 'absolute', left: 561, top: 0, width: 339, height: 310, background: '#E3E3E6' }),
  label('a little corner of the internet', 34, 22, { fontFamily: 'Geist Mono', fontSize: 13, color: '#5C5C65' }),
  label('oki.so', 29, 47, { fontSize: 93, fontWeight: 900, letterSpacing: -6, color: '#CC0000', lineHeight: 1 }),
  label('music, art, and', 36, 162, { fontSize: 30, fontWeight: 700 }),
  label('everything in between.', 36, 197, { fontSize: 30, fontWeight: 700 }),
  label('come wander around', 37, 267, { fontFamily: 'Geist Mono', fontSize: 14, color: '#5C5C65' }),
  label('art by OTORIxxx', 590, 289, { fontFamily: 'Geist Mono', fontSize: 11, color: '#5C5C65' }),
]);
const siteFrames = join(scratch, 'site'); await mkdir(siteFrames, { recursive: true });
const siteCount = Math.round(diary.duration / 1000 * fps);
for (let i = 0; i < siteCount; i++) {
  const phase = i / siteCount * Math.PI * 2;
  const decoration = Buffer.from(`<svg width="900" height="310"><path d="M36 148H${Math.round(310 + 8 * Math.sin(phase))}" stroke="#CC0000" stroke-width="3"/><g transform="translate(491 79) rotate(${Math.sin(phase) * 14})"><path d="M0-14C0-4-4 0-14 0C-4 0 0 4 0 14C0 4 4 0 14 0C4 0 0-4 0-14Z" fill="#CC0000"/></g></svg>`);
  await sharp(siteBase).composite([
    { input: diary.at(i / fps * 1000), left: 582, top: 20 },
    { input: mascot, left: 458, top: Math.round(190 + Math.sin(phase) * 4) },
    { input: decoration, left: 0, top: 0 },
  ]).png().toFile(join(siteFrames, `${String(i).padStart(3, '0')}.png`));
}
await finish('world-motion-v1', siteFrames, 310);

// These are reviewed crops of real editor stills, using a synthetic benchmark session.
// Do not replace them with full-window captures: those include internal activity logs.
const shots = await Promise.all(['arrange', 'mix', 'roll'].map(async name => {
  let shot = sharp(join(assets, `aether-${name}-crop.png`));
  // Each view has its own focal region, entirely inside the reviewed safe crops.
  if (name === 'mix') shot = shot.extract({ left: 0, top: 230, width: 1488, height: 768 });
  if (name === 'roll') shot = shot.extract({ left: 0, top: 345, width: 950, height: 440 });
  const resized = await shot.resize(536, 238, { fit: name === 'mix' ? 'contain' : 'cover',
    position: name === 'arrange' ? 'north' : 'centre', background: '#2E3943' }).png().toBuffer();
  const mask = Buffer.from('<svg width="536" height="238"><rect width="536" height="238" rx="8" fill="white"/></svg>');
  return sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}));
const clouds = [];
for (let frame = 0; frame < 4; frame++) clouds.push(await sharp(join(assets, 'aether-cloud.png')).extract({ left: frame * 48, top: 0, width: 48, height: 48 }).resize(96, 96, { kernel: 'nearest' }).png().toBuffer());
const aetherBase = await renderBase(340, '#EAF5FA', [
  label('the music workbench', 32, 24, { fontFamily: 'Geist Mono', fontSize: 13, color: '#44636C' }),
  label('aether', 27, 61, { fontSize: 76, fontWeight: 900, letterSpacing: -5, lineHeight: 1 }),
  label('a music workstation', 33, 149, { fontSize: 21, fontWeight: 700 }),
  box({ position: 'absolute', left: 32, top: 186, padding: '7px 11px', borderRadius: 6, background: '#D1EAF0', border: '1px solid #9FCFD9' },
    box({ fontSize: 13, fontFamily: 'Geist Mono', color: '#244D58' }, 'in development')),
  label('human + agent', 34, 287, { fontFamily: 'Geist Mono', fontSize: 13, color: '#44636C' }),
  box({ position: 'absolute', left: 326, top: 23, width: 552, height: 277, background: '#C9D6DC', border: '1px solid #A5BBC5', borderRadius: 12 }),
  label('development stills / synthetic session', 335, 316, { fontFamily: 'Geist Mono', fontSize: 12, color: '#44636C' }),
]);
const aetherFrames = join(scratch, 'aether'); await mkdir(aetherFrames, { recursive: true });
const names = ['arrange', 'mix', 'piano roll'];
const nameSvgs = await Promise.all(names.map(name => satori(box({ width: 536, height: 24, fontFamily: 'Geist Mono', color: '#244D58', fontSize: 12 }, name), { width: 536, height: 24, fonts }).then(svg => Buffer.from(svg))));
const aetherCount = 96;
for (let i = 0; i < aetherCount; i++) {
  const phase = i / aetherCount * Math.PI * 2;
  const stage = Math.floor(i / 32);
  const shotLayers = [{ input: shots[stage], left: 334, top: 31 }];
  const decor = Buffer.from(`<svg width="900" height="340"><path d="M33 277H136" stroke="#38C4D8" stroke-width="3"/><path d="M${Math.round(33 + 55 * (0.5 + 0.5 * Math.sin(phase)))} 277h34" stroke="#FF78B0" stroke-width="3"/><circle cx="263" cy="249" r="22" fill="none" stroke="#BBDDE5"/><circle cx="263" cy="249" r="${(17 + 2 * Math.cos(phase)).toFixed(2)}" fill="none" stroke="#C9DDE7"/></svg>`);
  await sharp(aetherBase).composite([
    ...shotLayers,
    { input: nameSvgs[stage], left: 336, top: 276 },
    { input: decor, left: 0, top: 0 },
    { input: clouds[Math.floor(i / 3) % 4], left: Math.round(167 + 10 * Math.sin(phase)), top: Math.round(216 + 4 * Math.cos(phase)) },
  ]).png().toFile(join(aetherFrames, `${String(i).padStart(3, '0')}.png`));
}
await finish('aether-motion-v1', aetherFrames, 340);

// Preserve the original chibi's timing instead of forcing it onto a new frame rate.
const chibi = await decodeWebp('engawa110-motion.webp', 150);
const chibiPages = [];
for (const frame of chibi.frames) chibiPages.push(await sharp({ create: { width: 180, height: 170, channels: 4, background: '#F3EFEA' } }).composite([{ input: frame, left: 15, top: 10 }]).png().toBuffer());
const joined = await sharp({ create: { width: 180, height: 170 * chibiPages.length, channels: 4, background: '#F3EFEA' } }).composite(chibiPages.map((input, i) => ({ input, left: 0, top: i * 170 }))).raw().toBuffer();
await sharp(joined, { raw: { width: 180, height: 170 * chibiPages.length, channels: 4, pageHeight: 170 } }).gif({ delay: chibi.delays, loop: 0, colours: 128, dither: 0.5 }).toFile(join(out, 'chibi-motion-v1.gif'));
await writeFile(join(out, 'chibi-motion-v1.png'), chibiPages[0]);
await writeFile(join(out, 'provenance.json'), JSON.stringify({ website: { publicArt: 'OTORIxxx / works/37', durationMs: diary.duration, frames: siteCount }, chibi: { publicArt: 'engawa110', durationMs: chibi.duration, frames: chibi.frames.length }, aether: { source: 'reviewed native editor crops', session: 'synthetic', status: 'in development', frames: aetherCount, durationMs: 8000 } }, null, 2));
