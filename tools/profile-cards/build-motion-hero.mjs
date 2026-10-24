#!/usr/bin/env node
/**
 * OKISO — artist workbench / ideas in motion.
 * Offline, deterministic render. Reads only the three existing credited artworks.
 * No network, browser, generated character art, app mockups, or playback data.
 *
 * Reproduce (PowerShell; both variants, posters, GIFs, MP4s, and verification):
 * node S:\tmp\codex\github-profile-20261024\repo\tools\profile-cards\build-motion-hero.mjs `
 *   --out-dir S:\Codex\outputs\2026-10-24\github-profile-motion\hero `
 *   --frames-dir S:\tmp\codex\github-profile-motion-20261024\hero `
 *   --theme both --width 960 --height 336 --fps 12 --seconds 8 --colors 192
 *
 * --poster-only skips animation/encoding. --help lists the remaining options.
 * Artwork is contained, never cropped, recolored, retouched, or redrawn.
 * Artwork credits: suyosuyo; sobu / @sobsocks; mascot: 7mmchan.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import satori from 'satori';
import sharp from 'sharp';

const HELP = `Offline OKISO motion hero
Required:
  --out-dir <absolute S: directory>     Deliverables (PNG, GIF, MP4, JSON)
  --frames-dir <absolute S: directory>  PNG sequences, palette, scratch, logs
Optional:
  --theme both|light|dark  (both)
  --width 900..1000        (960, even for H.264)
  --height 300..360        (336, even for H.264)
  --fps 10..20             (12)
  --seconds 4..16          (8; seconds * fps must be an integer)
  --colors 96..256         (192; reduced if GIF exceeds the size budget)
  --gif-max-mib <number>   (3.5)
  --ffmpeg <executable>    (ffmpeg)
  --ffprobe <executable>   (ffprobe)
  --poster-only            Render frame zero PNGs without encoders
  --help
The waveform is decorative. The render contains no audio or live data.
Existing frames are overwritten only at predictable hero-owned filenames.
`;

function options(argv) {
  const result = { theme: 'both', width: 960, height: 336, fps: 12, seconds: 8,
    colors: 192, 'gif-max-mib': 3.5, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
  const allowed = new Set([...Object.keys(result), 'out-dir', 'frames-dir', 'poster-only', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.has(key)) throw new Error(`Unknown argument: ${argv[i]}`);
    if (key === 'help' || key === 'poster-only') result[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
      result[key] = argv[++i];
    }
  }
  if (result.help) return result;
  for (const key of ['out-dir', 'frames-dir']) {
    if (!result[key] || !isAbsolute(result[key]) || parse(resolve(result[key])).root.toLowerCase() !== 's:\\') {
      throw new Error(`--${key} must explicitly name an absolute S: directory`);
    }
    result[key] = resolve(result[key]);
  }
  if (result['out-dir'] === result['frames-dir']) throw new Error('Output and frames directories must differ');
  if (!['both', 'light', 'dark'].includes(result.theme)) throw new Error('Invalid --theme');
  for (const [key, min, max] of [['width', 900, 1000], ['height', 300, 360], ['fps', 10, 20],
    ['seconds', 4, 16], ['colors', 96, 256], ['gif-max-mib', 0.1, 50]]) {
    result[key] = Number(result[key]);
    if (!Number.isFinite(result[key]) || result[key] < min || result[key] > max) throw new Error(`Invalid --${key}`);
  }
  for (const key of ['width', 'height', 'fps', 'colors']) {
    if (!Number.isInteger(result[key])) throw new Error(`--${key} must be an integer`);
  }
  if (result.width % 2 || result.height % 2) throw new Error('Width and height must be even');
  if (!Number.isInteger(result.fps * result.seconds)) throw new Error('seconds * fps must be an integer');
  return result;
}

const opt = options(process.argv.slice(2));
if (opt.help) { console.log(HELP); process.exit(0); }
const outputDir = opt['out-dir'];
const framesDir = opt['frames-dir'];
const cacheDir = join(framesDir, 'cache');
for (const directory of [outputDir, framesDir, cacheDir]) await mkdir(directory, { recursive: true });
// Set process-local scratch/cache before loading fonts or rasterizing anything.
Object.assign(process.env, { TEMP: framesDir, TMP: framesDir, TMPDIR: framesDir,
  XDG_CACHE_HOME: cacheDir, npm_config_cache: join(cacheDir, 'npm'),
  FONTCONFIG_CACHE: join(cacheDir, 'fontconfig'), VIPS_DISC_THRESHOLD: '1g' });
sharp.cache({ memory: 96, files: 0, items: 64 });
sharp.concurrency(2);

const root = dirname(fileURLToPath(import.meta.url));
const TAU = Math.PI * 2;
const fmt = number => Number(number.toFixed(3));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const wrapSvg = (content, background) => `<svg xmlns="http://www.w3.org/2000/svg" width="${opt.width}" height="${opt.height}" viewBox="0 0 960 336">${background ? `<rect width="960" height="336" fill="${background}"/>` : ''}<defs><clipPath id="hero-clip"><rect x="0.5" y="0.5" width="959" height="335" rx="16"/></clipPath></defs><g clip-path="url(#hero-clip)">${content}</g></svg>`;
const rect = (x, y, width, height, fill, radius = 0, extra = '') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, width = 1, extra = '') => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const star = (x, y, size, color, rotation = 0) => `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rotation)}) scale(${size / 24})"><path d="M0 -12C1 -3 3 -1 12 0C3 1 1 3 0 12C-1 3 -3 1 -12 0C-3 -1 -1 -3 0 -12Z" fill="${color}"/></g>`;
const fonts = await Promise.all([
  ['Archivo', 700, '@fontsource/archivo/files/archivo-latin-700-normal.woff'],
  ['Archivo', 900, '@fontsource/archivo/files/archivo-latin-900-normal.woff'],
  ['Geist Mono', 400, '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff'],
].map(async ([name, weight, path]) => ({ name, weight, style: 'normal', data: await readFile(new URL(import.meta.resolve(path))) })));

async function type(value, width, height, size, color, { family = 'Geist Mono', weight = 400, spacing = 0 } = {}) {
  const svg = await satori({ type: 'div', props: {
    style: { display: 'flex', width, height, fontFamily: family, fontWeight: weight,
      fontSize: size, letterSpacing: spacing, lineHeight: 1.15, color }, children: value,
  } }, { width, height, fonts });
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}
const at = (fragment, x, y, extra = '') => `<g transform="translate(${fmt(x)} ${fmt(y)})" ${extra}>${fragment}</g>`;

const art = {};
const assetVerification = [];
for (const name of ['suyosuyo', 'sobu', 'mascot']) {
  const path = join(root, 'assets', `${name}.webp`);
  const bytes = await readFile(path);
  const metadata = await sharp(bytes).metadata();
  // Full images are kept intact. Only proportional resampling is performed.
  const png = await sharp(bytes).resize({ width: name === 'mascot' ? 112 : 400, withoutEnlargement: true }).png().toBuffer();
  art[name] = `data:image/png;base64,${png.toString('base64')}`;
  assetVerification.push({ name, path, width: metadata.width, height: metadata.height, sha256: hash(bytes) });
}

const palettes = {
  light: { bg: '#F3EFEA', ink: '#1D1B1C', muted: '#6E6267', red: '#CC0000',
    edge: '#D8D0CA', paper: '#FFFCF7', lavender: '#E3DDF0', cyan: '#9ACED0', orbit: '#B9AFBD', shadow: '#D6CBC6' },
  dark: { bg: '#1D1B1E', ink: '#F3EFEA', muted: '#B7AAB1', red: '#EF6573',
    edge: '#433B43', paper: '#F3EFEA', lavender: '#383042', cyan: '#8DC9CD', orbit: '#746477', shadow: '#111013' },
};

async function makeScene(theme) {
  const p = palettes[theme];
  const labels = await Promise.all(['aether', 'oki.so', 'backdrop', 'fleet'].map(value => type(value, 120, 24, 16, p.ink, { family: 'Archivo', weight: 700 })));
  const title = await type('OKISO', 550, 150, 137, p.ink, { family: 'Archivo', weight: 900, spacing: -9 });
  const eyebrow = await type('artist workbench', 300, 20, 12, p.muted, { spacing: 0.8 });
  const subline = await type('electronic music + desktop tools', 500, 22, 12, p.muted);
  const owner = await type('virtual artist / okisooo', 280, 18, 10, p.muted, { spacing: 0.2 });
  const credits = await type('art: suyosuyo / sobu · @sobsocks / mascot: 7mmchan', 620, 16, 9, p.muted);
  const words = await Promise.all([['ideas', 115], ['in', 48], ['motion.', 158]].map(([value, width]) => type(value, width, 43, 34, p.ink, { family: 'Archivo', weight: 700, spacing: -1.2 })));
  const mainPrint = `<g transform="translate(807 176) rotate(6)">
    ${rect(-94, -142, 188, 284, p.shadow, 3, 'transform="translate(4 5)"')}
    ${rect(-94, -142, 188, 284, p.paper, 3)}
    <image href="${art.suyosuyo}" x="-88" y="-136" width="176" height="272" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
  const sketchPrint = `<g transform="translate(651 195) rotate(-10)">
    ${rect(-80, -102, 160, 204, p.shadow, 2, 'transform="translate(3 5)"')}
    ${rect(-80, -102, 160, 204, p.paper, 2)}
    <image href="${art.sobu}" x="-74" y="-96" width="148" height="192" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
  const content = [
    rect(0, 0, 960, 336, p.bg),
    // A print-board field, not an imitation software window.
    `<ellipse cx="750" cy="174" rx="175" ry="133" fill="${p.lavender}"/>`,
    `<ellipse cx="748" cy="175" rx="190" ry="119" transform="rotate(-15 748 175)" fill="none" stroke="${p.orbit}" stroke-width="1"/>`,
    `<ellipse cx="748" cy="175" rx="178" ry="130" transform="rotate(12 748 175)" fill="none" stroke="${p.orbit}" stroke-width="1" stroke-dasharray="2 10"/>`,
    line(32, 43, 536, 43, p.edge),
    line(32, 299, 530, 299, p.edge),
    star(38, 26, 14, p.red),
    at(eyebrow, 53, 19),
    at(owner, 690, 15),
    at(title, 26, 42),
    at(subline, 33, 239),
    at(credits, 33, 315),
    sketchPrint,
    mainPrint,
    // The little tape tabs sit outside the original image pixels.
    `<g transform="translate(807 176) rotate(6)">${rect(-27, -148, 54, 10, p.cyan, 1)}</g>`,
    `<g transform="translate(651 195) rotate(-10)">${rect(-23, -107, 46, 9, theme === 'light' ? '#C7BCD9' : '#AD9ABD', 1)}</g>`,
    rect(0.5, 0.5, 959, 335, 'none', 16, `stroke="${p.edge}"`),
  ].join('');
  // Opaque canvas lets GIF reuse unchanged art pixels. Transparent outer corners
  // force FFmpeg's GIF encoder to dispose/repaint the full canvas every frame.
  const base = await sharp(Buffer.from(wrapSvg(content, p.bg))).png().toBuffer();

  function motion(phase) {
    // Everything is an integer-period function. phase=1 is normalized to phase=0.
    const t = ((phase % 1) + 1) % 1;
    const a = TAU * t;
    const parts = [];
    // Staggered type: readable at every instant, small buoyant displacements.
    let wordX = 32;
    for (let i = 0; i < words.length; i++) {
      const dy = -2.4 * Math.sin(a + i * 0.6);
      parts.push(at(words[i], wordX, 195 + dy));
      wordX += [99, 38, 0][i];
    }
    // A hand-composed traveling waveform; explicitly decorative, with no audio input.
    const points = [];
    for (let x = 0; x <= 500; x += 2) {
      const envelope = Math.sin(Math.PI * x / 500) ** 2;
      const y = 183 + envelope * (7.7 * Math.sin(x * 0.078 - a * 3) + 3.2 * Math.sin(x * 0.15 + a * 2));
      points.push(`${x === 0 ? 'M' : 'L'}${32 + x} ${fmt(y)}`);
    }
    parts.push(`<path d="${points.join('')}" fill="none" stroke="${p.red}" stroke-width="2" stroke-linecap="round"/>`);
    // A small counter-rhythm of vertical marks at the end of the wave.
    for (let i = 0; i < 5; i++) {
      const h = 4 + 12 * (0.5 + 0.5 * Math.sin(a * 4 + i * 0.9));
      parts.push(rect(497 + i * 7, 214 - h / 2, 3, fmt(h), i === 2 ? p.red : p.orbit, 1.5));
    }
    const projectX = [33, 154, 274, 431];
    const icon = i => {
      if (i === 0) return `<path d="M0 9L3 9L5 2L8 15L11 5L14 9L17 9" fill="none" stroke="${p.red}" stroke-width="1.5"/>`;
      if (i === 1) return star(8, 8, 14, p.red, 20);
      if (i === 2) return `${rect(1, 1, 11, 11, 'none', 0, `stroke="${p.red}" stroke-width="1.4"`)}${rect(5, 5, 11, 11, p.bg, 0, `stroke="${p.red}" stroke-width="1.4"`)}`;
      return [0, 1, 2, 3].map(n => rect((n % 2) * 8, Math.floor(n / 2) * 8, 5, 5, p.red, 0.5)).join('');
    };
    for (let i = 0; i < labels.length; i++) {
      const lift = 3.2 * Math.sin(a * 2 - i * 0.7);
      const x = projectX[i];
      parts.push(at(icon(i), x, 273 - lift));
      parts.push(at(labels[i], x + 24, 269 - lift));
      const sweep = 0.5 + 0.5 * Math.sin(a - i * 0.75);
      parts.push(line(x + 24, 294, x + 24 + [50, 45, 74, 36][i] * sweep, 294, p.red, 1.4));
    }
    // The original mascot rides a loping orbit, with a secondary bounce and tilt.
    const orbitA = a + 0.54;
    const mascotX = 754 + 135 * Math.cos(orbitA);
    const mascotY = 176 + 99 * Math.sin(orbitA) - 8 * Math.sin(a * 3);
    const scale = 1 + 0.055 * Math.sin(a * 3 + 0.4);
    const tilt = 9 * Math.sin(a * 2 - 0.4);
    parts.push(`<g transform="translate(${fmt(mascotX)} ${fmt(mascotY)}) rotate(${fmt(tilt)}) scale(${fmt(scale)})">
      <image href="${art.mascot}" x="-43" y="-43" width="86" height="86" preserveAspectRatio="xMidYMid meet"/>
    </g>`);
    // Distant orbit satellites add depth without obscuring the lettering.
    parts.push(star(748 + 183 * Math.cos(a + 2.8), 175 + 116 * Math.sin(a + 2.8), 15, p.red, 30 * Math.sin(a)));
    parts.push(star(748 + 175 * Math.cos(a + 4.8), 175 + 126 * Math.sin(a + 4.8), 10, p.cyan, 40 * Math.sin(a)));
    const dotX = 748 + 184 * Math.cos(a + 3.9);
    const dotY = 175 + 118 * Math.sin(a + 3.9);
    parts.push(`<circle cx="${fmt(dotX)}" cy="${fmt(dotY)}" r="3.2" fill="${p.red}"/>`);
    return Buffer.from(wrapSvg(parts.join('')));
  }
  async function render(phase) {
    return sharp(base).composite([{ input: motion(phase) }]).png({ compressionLevel: 8 }).toBuffer();
  }
  return { render };
}

async function run(executable, args, logPath) {
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', data => stdout.push(data));
    child.stderr.on('data', data => stderr.push(data));
    child.on('error', reject);
    child.on('close', code => resolveRun({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
  });
  if (logPath) await writeFile(logPath, JSON.stringify({ executable, args, ...result }, null, 2));
  if (result.code !== 0) throw new Error(`${executable} exited ${result.code}: ${result.stderr.slice(-4000)}`);
  return result.stdout;
}

const frameCount = opt.fps * opt.seconds;
const verification = { renderer: 'OKISO / artist workbench', width: opt.width, height: opt.height,
  fps: opt.fps, seconds: opt.seconds, frameCount, decorativeMotion: true, audio: false,
  fonts: ['Archivo 900 + 700', 'Geist Mono 400'], credits: 'suyosuyo; sobu / @sobsocks; mascot: 7mmchan',
  sourceAssets: assetVerification, outputDir, framesDir, themes: {},
  command: [process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
  reducedMotion: 'Use hero-light.png / hero-dark.png; these are clear, complete frame-zero posters.' };

function difference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

for (const theme of opt.theme === 'both' ? ['light', 'dark'] : [opt.theme]) {
  console.log(`Rendering ${theme}: ${opt.width}x${opt.height}, ${frameCount} frames`);
  const themeFrames = join(framesDir, theme);
  await mkdir(themeFrames, { recursive: true });
  const { render } = await makeScene(theme);
  const first = await render(0);
  const posterPath = join(outputDir, `hero-${theme}.png`);
  await writeFile(posterPath, first);
  if (opt['poster-only']) continue;
  const signatures = new Set();
  const nameSignatures = new Set();
  const thumbnails = [];
  const titleRegion = {
    left: Math.round(26 * opt.width / 960), top: Math.round(62 * opt.height / 336),
    width: Math.round(460 * opt.width / 960), height: Math.round(108 * opt.height / 336),
  };
  for (let i = 0; i < frameCount; i++) {
    const png = i === 0 ? first : await render(i / frameCount);
    await writeFile(join(themeFrames, `frame-${String(i).padStart(4, '0')}.png`), png);
    signatures.add(hash(png));
    nameSignatures.add(hash(await sharp(png).extract(titleRegion).raw().toBuffer()));
    thumbnails.push(await sharp(png).resize(120, 42).removeAlpha().raw().toBuffer());
    if ((i + 1) % 24 === 0) console.log(`  ${theme}: ${i + 1}/${frameCount}`);
  }
  const end = await render(1);
  await writeFile(join(themeFrames, 'loop-end.png'), end);
  if (!first.equals(end)) throw new Error(`${theme}: loop endpoint does not match frame zero`);
  if (signatures.size !== frameCount) throw new Error(`${theme}: repeated/unchanging motion frames`);
  if (nameSignatures.size !== 1) throw new Error(`${theme}: the anchored OKISO name changed during motion`);
  const deltas = thumbnails.slice(1).map((image, i) => difference(image, thumbnails[i]));
  const seamDifference = difference(thumbnails.at(-1), thumbnails[0]);
  if (seamDifference > Math.max(...deltas) * 1.3) throw new Error(`${theme}: seam jump exceeds normal motion`);

  const sequence = join(themeFrames, 'frame-%04d.png');
  const mp4 = join(outputDir, `hero-${theme}.mp4`);
  await run(opt.ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(opt.fps),
    '-i', sequence, '-frames:v', String(frameCount), '-an', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '2', '-movflags', '+faststart', mp4], join(themeFrames, 'ffmpeg-mp4.json'));

  const gif = join(outputDir, `hero-${theme}.gif`);
  let chosenColors = opt.colors;
  const attempts = [];
  // Low, ordered dithering avoids temporal shimmer in the static printed art.
  for (const colors of [...new Set([opt.colors, Math.min(opt.colors, 160), Math.min(opt.colors, 128), 96])]) {
    const palette = join(themeFrames, 'palette.png');
    await run(opt.ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(opt.fps), '-i', sequence,
      '-vf', `palettegen=max_colors=${colors}:stats_mode=full:reserve_transparent=1`, '-frames:v', '1',
      '-threads', '2', palette], join(themeFrames, `ffmpeg-palette-${colors}.json`));
    await run(opt.ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(opt.fps), '-i', sequence,
      '-i', palette, '-filter_complex', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
      '-frames:v', String(frameCount), '-an', '-threads', '2', '-loop', '0', gif], join(themeFrames, `ffmpeg-gif-${colors}.json`));
    const bytes = (await stat(gif)).size;
    attempts.push({ colors, bytes });
    chosenColors = colors;
    if (bytes <= opt['gif-max-mib'] * 1024 * 1024) break;
  }

  const files = [];
  for (const path of [posterPath, gif, mp4]) {
    const bytes = await readFile(path);
    const result = { path, bytes: bytes.length, sha256: hash(bytes) };
    if (!path.endsWith('.png')) {
      result.probe = JSON.parse(await run(opt.ffprobe, ['-v', 'error', '-count_frames', '-show_entries',
        'stream=codec_name,width,height,nb_read_frames,avg_frame_rate,duration:format=duration,size', '-of', 'json', path]));
      const stream = result.probe.streams[0];
      if (Number(stream.nb_read_frames) !== frameCount || stream.width !== opt.width || stream.height !== opt.height) {
        throw new Error(`${path}: encoded frame count or dimensions mismatch`);
      }
      if (Math.abs(Number(result.probe.format.duration) - opt.seconds) > 0.03) throw new Error(`${path}: duration mismatch`);
    }
    files.push(result);
  }
  const gifFrameHashes = await run(opt.ffmpeg, ['-v', 'error', '-i', gif, '-map', '0:v:0', '-f', 'framemd5', '-']);
  const decodedGifFrames = gifFrameHashes.split(/\r?\n/).filter(row => /^\d+,/.test(row));
  const decodedGifUnique = new Set(decodedGifFrames.map(row => row.split(',').at(-1).trim())).size;
  if (decodedGifFrames.length !== frameCount || decodedGifUnique !== frameCount) throw new Error('GIF lost distinct motion frames');
  const gifMetadata = await sharp(gif, { animated: true }).metadata();
  const gifDurationMs = gifMetadata.delay.reduce((a, b) => a + b, 0);
  if (gifMetadata.loop !== 0 || gifDurationMs !== opt.seconds * 1000) throw new Error('GIF loop or timing mismatch');
  verification.themes[theme] = { files, uniqueSourceFrames: signatures.size, uniqueDecodedGifFrames: decodedGifUnique,
    anchoredNamePixelInvariant: nameSignatures.size === 1, gifInfiniteLoop: gifMetadata.loop === 0,
    gifFrameDelaysMs: [...new Set(gifMetadata.delay)], gifDurationMs,
    loopEndpointPixelExact: true, lastToFirstMeanAbsoluteDifference: seamDifference,
    adjacentMeanAbsoluteDifference: { min: Math.min(...deltas), max: Math.max(...deltas), average: deltas.reduce((a, b) => a + b, 0) / deltas.length },
    gifColors: chosenColors, gifAttempts: attempts,
    gifWithinSizeBudget: (await stat(gif)).size <= opt['gif-max-mib'] * 1024 * 1024 };

  // A six-moment contact sheet is an inspection aid, kept out of deliverables.
  const cells = await Promise.all([0, 16, 32, 48, 64, 80].map(async value => {
    const index = Math.floor(value / 96 * frameCount);
    return sharp(join(themeFrames, `frame-${String(index).padStart(4, '0')}.png`)).resize(640, 224).png().toBuffer();
  }));
  await sharp({ create: { width: 1280, height: 672, channels: 3, background: '#a8a3a6' } })
    .composite(cells.map((input, i) => ({ input, left: (i % 2) * 640, top: Math.floor(i / 2) * 224 })))
    .png().toFile(join(themeFrames, 'contact-sheet.png'));
  console.log(`  ${theme}: GIF ${((await stat(gif)).size / 1024 / 1024).toFixed(2)} MiB; ${decodedGifUnique} distinct decoded frames; seam verified`);
}

// Verify that the source artworks remained byte-for-byte untouched.
for (const asset of assetVerification) {
  if (hash(await readFile(asset.path)) !== asset.sha256) throw new Error(`Source art changed during render: ${asset.name}`);
}
if (!opt['poster-only']) {
  await writeFile(join(outputDir, 'hero-verification.json'), JSON.stringify(verification, null, 2) + '\n');
}
console.log(`Done. Physical output: ${outputDir}`);
