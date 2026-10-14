import satori from 'satori';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, config } from './data.mjs';

const fontFiles = [
  ['Archivo', 400, '@fontsource/archivo/files/archivo-latin-400-normal.woff'],
  ['Archivo', 700, '@fontsource/archivo/files/archivo-latin-700-normal.woff'],
  ['Archivo', 900, '@fontsource/archivo/files/archivo-latin-900-normal.woff'],
  ['Geist Mono', 400, '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff']
];
const fonts = await Promise.all(fontFiles.map(async ([name, weight, location]) => ({ name, weight, style: 'normal', data: await readFile(new URL(import.meta.resolve(location))) })));
const assets = Object.fromEntries(await Promise.all(['sobu', 'suyosuyo', 'mascot'].map(async name => {
  const source = sharp(await readFile(join(root, 'assets', `${name}.webp`))).resize({ width: 420, height: 560, fit: 'inside', withoutEnlargement: true });
  const image = name === 'mascot' ? await source.png().toBuffer() : await source.jpeg({ quality: 90 }).toBuffer();
  return [name, `data:image/${name === 'mascot' ? 'png' : 'jpeg'};base64,${image.toString('base64')}`];
})));

export const cardNames = ['banner', 'anime', 'characters', 'presence', 'osu', 'release', 'divider'];
export function optionsFrom(searchParams) {
  const accent = searchParams.get('accent') || 'cc0000';
  if (!/^[0-9a-f]{6}$/i.test(accent)) throw new Error('accent must be six hex digits');
  const count = Number(searchParams.get('count') || 6);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('count must be between 1 and 12');
  const theme = searchParams.get('theme') || 'light';
  if (!['light', 'dark'].includes(theme)) throw new Error('theme must be light or dark');
  const art = searchParams.get('art') || 'suyosuyo';
  if (!['suyosuyo', 'sobu'].includes(art)) throw new Error('unknown artwork');
  const title = searchParams.get('title') || 'little things i make';
  if (title.length > 55) throw new Error('title is too long');
  return { theme, accent: `#${accent}`, art, count, title };
}

const el = (type, props = {}, ...children) => ({ type, props: { ...props, ...(type === 'div' ? { style: { display: 'flex', flexDirection: 'column', ...props.style } } : {}), children: children.flat().filter(child => child !== undefined && child !== null && child !== false) } });
const div = (style, ...children) => el('div', { style }, ...children);
const img = (src, width, height, style = {}) => src ? el('img', { src, width, height, style: { objectFit: 'cover', ...style } }) : div({ width, height, background: '#e3e3e6', alignItems: 'center', justifyContent: 'center', color: '#5c5c65', fontSize: 14 }, 'artwork unavailable');
const text = (value, style = {}) => div({ ...style }, value);
const arrow = (size, color) => el('svg', { width: size, height: size, viewBox: '0 0 24 24' }, el('path', { d: 'M5 19L19 5M5 5H19V19', stroke: color, strokeWidth: 2.5, fill: 'none' }));
const trim = (value, length = 42) => String(value || '').slice(0, length) + (String(value || '').length > length ? '…' : '');
const palettes = {
  light: { paper: '#fafafa', ink: '#28282c', muted: '#66666e', silver: '#e3e3e6', edge: '#c6c6cc', white: '#ffffff' },
  dark: { paper: '#17171b', ink: '#fafafa', muted: '#b7b7bf', silver: '#333339', edge: '#4b4b54', white: '#202026' }
};

function dateLabel(source) {
  if (!source?.updatedAt) return 'snapshot unavailable';
  const date = new Date(source.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Tokyo', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${source.error ? 'last saved' : 'snapshot'} · ${date} JST`;
}

function frame(width, height, p, children, style = {}) {
  return div({ width, height, boxSizing: 'border-box', position: 'relative', padding: 28, gap: 18, fontFamily: 'Archivo', fontSize: 18, color: p.ink, background: p.paper, border: `1px solid ${p.edge}`, borderRadius: 10, overflow: 'hidden', ...style }, children);
}

function section(title, subtitle, p, accent) {
  return div({ flexDirection: 'row', alignItems: 'center', gap: 14 },
    div({ width: 9, height: 9, background: accent }),
    div({ gap: 7 }, text(title, { fontSize: 30, fontWeight: 900, letterSpacing: -1 }), subtitle && text(subtitle, { fontFamily: 'Geist Mono', fontSize: 11, color: p.muted })),
    div({ height: 1, flexGrow: 1, background: p.edge, marginLeft: 8 }));
}

function footer(source, p, label) {
  return div({ marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', fontFamily: 'Geist Mono', fontSize: 10, color: p.muted }, text(label), text(dateLabel(source)));
}

export async function renderCard(name, snapshot, opts = {}) {
  const options = { theme: 'light', accent: '#cc0000', art: 'suyosuyo', count: 6, title: 'little things i make', ...opts };
  const p = palettes[options.theme];
  const accent = options.accent;
  let width = 900, height, tree;
  const source = snapshot.sources?.[name === 'characters' ? 'anime' : name];
  const data = source?.data;
  if (name === 'banner') {
    height = 368;
    tree = frame(width, height, p, [
      div({ flexDirection: 'row', justifyContent: 'space-between', fontFamily: 'Geist Mono', fontSize: 11, paddingBottom: 12, borderBottom: `1px solid ${p.edge}` }, text('okiso / original music', { color: accent }), text('vtuber & virtual artist')),
      text('OKISO', { position: 'absolute', left: 26, top: 68, fontSize: 138, fontWeight: 900, letterSpacing: -9, lineHeight: 1 }),
      div({ position: 'absolute', left: 544, top: 88 }, arrow(42, accent)),
      div({ position: 'absolute', left: 32, top: 172, transform: 'rotate(-4deg)', width: 332, height: 158, border: `5px solid ${p.white}`, background: p.silver }, img(assets.sobu, 322, 148, { objectPosition: 'center 32%' })),
      div({ position: 'absolute', right: 41, top: 65, transform: 'rotate(6deg)', width: 252, height: 267, border: `6px solid ${p.white}`, background: p.silver }, img(assets[options.art], 240, 255, { objectPosition: 'center 25%' })),
      div({ position: 'absolute', right: 15, bottom: 8 }, img(assets.mascot, 116, 116, { objectFit: 'contain' })),
      text('art by suyosuyo & sobu · @sobsocks / mascot by 7mmchan', { position: 'absolute', left: 28, bottom: 11, fontFamily: 'Geist Mono', fontSize: 9, color: p.muted })
    ]);
  } else if (name === 'anime' || name === 'characters') {
    const characters = name === 'characters';
    const entries = (characters ? data?.characters : data?.entries)?.slice(0, options.count) || [];
    height = characters ? (entries.length > 6 ? 380 : 360) : (entries.length > 3 ? 500 : 425);
    const n = Math.max(entries.length, 1);
    const thumbWidth = characters ? Math.min(132, Math.floor((844 - (n - 1) * 12) / n)) : Math.min(260, Math.floor((844 - (n - 1) * 18) / n));
    const imageHeight = characters ? 157 : 252;
    tree = frame(width, height, p, [
      section(characters ? 'favorite characters' : 'anime shelf', characters ? 'the characters i keep coming back to' : data?.section || 'my AniList corner', p, accent),
      entries.length ? div({ flexDirection: 'row', gap: characters ? 12 : 18, justifyContent: 'flex-start', alignItems: 'flex-start' }, entries.map(entry => div({ width: thumbWidth, gap: 9 },
        img(entry.imageData, thumbWidth, imageHeight, { borderRadius: 5 }),
        text(trim(entry.name, characters ? 18 : 36), { fontSize: characters ? 14 : 16, fontWeight: 700, lineHeight: 1.2 })
      ))) : div({ height: imageHeight, flexDirection: 'row', alignItems: 'center', gap: 22 }, img(assets.mascot, 140, 140, { objectFit: 'contain' }), text('nothing here just yet · my list is on AniList', { color: p.muted, fontSize: 20 })),
      footer(source, p, `anilist.co/user/${config.anilist}`)
    ]);
  } else if (name === 'presence') {
    width = 440; height = 210;
    const statusColors = { online: '#30a46c', idle: '#d6a43b', dnd: '#e64b4b', offline: '#868692' };
    const status = source?.error ? 'last saved presence' : data?.status || 'unavailable';
    const activity = data?.spotify ? `listening · ${data.spotify.name}` : data?.activity ? `${data.activity.type === 3 ? 'watching' : data.activity.type === 2 ? 'listening' : 'playing'} · ${data.activity.name}` : data?.status === 'offline' ? 'away from discord' : 'hanging out on discord';
    tree = frame(width, height, p, [
      div({ flexDirection: 'row', gap: 15, alignItems: 'center' }, img(assets.suyosuyo, 65, 65, { borderRadius: 33, objectPosition: 'center 18%' }),
        div({ gap: 8 }, text('okiso', { fontSize: 26, fontWeight: 900 }), div({ flexDirection: 'row', alignItems: 'center', gap: 7 }, div({ width: 7, height: 7, borderRadius: 4, background: statusColors[data?.status] || p.muted }), text(status, { fontFamily: 'Geist Mono', fontSize: 11, color: p.muted })))),
      text(data ? trim(activity, 48) : 'presence is temporarily unavailable', { fontSize: 14, fontWeight: 700 }),
      footer(source, p, 'discord')
    ], { padding: 23, gap: 13 });
  } else if (name === 'osu') {
    width = 440; height = 210;
    tree = frame(width, height, p, [
      div({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, text(`osu! / ${config.osu}`, { fontSize: 23, fontWeight: 900, letterSpacing: -0.5 }), arrow(22, accent)),
      data?.imageData ? img(data.imageData, 394, 113, { objectFit: 'contain', borderRadius: 4 }) : data?.rank ? div({ flexDirection: 'row', gap: 23 }, div({ gap: 6 }, text(`#${Number(data.rank).toLocaleString('en')}`, { fontWeight: 900, fontSize: 31 }), text('global rank', { fontFamily: 'Geist Mono', fontSize: 10, color: p.muted })), div({ gap: 6 }, text(`${Math.round(data.pp).toLocaleString('en')} pp`, { fontWeight: 900, fontSize: 27 }), text(`${data.accuracy.toFixed(2)}% accuracy`, { fontFamily: 'Geist Mono', fontSize: 10, color: p.muted }))) : text('signature temporarily unavailable', { fontSize: 14, color: p.muted }),
      footer(source, p, data?.provider || 'osu!')
    ], { padding: 23, gap: 8 });
  } else if (name === 'release') {
    height = 235;
    tree = frame(width, height, p, [
      div({ flexDirection: 'row', gap: 25, alignItems: 'center' }, img(data?.imageData, 178, 178, { borderRadius: 5 }), div({ gap: 15, flex: 1 },
        text('music by okiso', { fontFamily: 'Geist Mono', fontSize: 11, color: accent }),
        text(data?.name || 'my music', { fontSize: 44, fontWeight: 900, letterSpacing: -1.5 }),
        text(data ? `${data.type} · ${data.date}` : 'release snapshot unavailable', { fontFamily: 'Geist Mono', fontSize: 12, color: p.muted }),
        div({ flexDirection: 'row', alignItems: 'center', gap: 8 }, text('listen on oki.so', { fontSize: 16, fontWeight: 700 }), arrow(15, accent))), img(assets.mascot, 130, 130, { objectFit: 'contain' }))
    ]);
  } else if (name === 'divider') {
    height = 100;
    tree = div({ width, height, boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', gap: 14, fontFamily: 'Archivo', color: p.ink, background: p.paper, padding: '0 10px' },
      div({ width: 9, height: 9, background: accent }), text(options.title, { fontSize: 26, fontWeight: 900, letterSpacing: -0.6 }), div({ flex: 1, height: 1, background: p.edge, marginLeft: 10 }), img(assets.mascot, 85, 85, { objectFit: 'contain' }));
  } else throw new Error('unknown card');
  return satori(tree, { width, height, fonts });
}
