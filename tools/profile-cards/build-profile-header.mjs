import satori from 'satori';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('Pass an explicit output directory');
await mkdir(out, { recursive: true });
const fonts = await Promise.all([400, 700, 900].map(async weight => ({
  name: 'Archivo', weight, style: 'normal',
  data: await readFile(new URL(import.meta.resolve(`@fontsource/archivo/files/archivo-latin-${weight}-normal.woff`)))
})));
const art = {};
for (const name of ['suyosuyo', 'sobu', 'mascot']) {
  const image = sharp(await readFile(join(root, 'assets', `${name}.webp`)))
    .resize({ width: name === 'mascot' ? 128 : name === 'sobu' ? 280 : 440, withoutEnlargement: true });
  const bytes = await (name === 'mascot' ? image.png() : image.jpeg({quality:88})).toBuffer();
  art[name] = `data:image/${name === 'mascot' ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
}
const el = (type, props = {}, ...children) => ({ type, props: { ...props, children: children.flat() } });
const div = (style, ...children) => el('div', { style: { display: 'flex', flexDirection: 'column', ...style } }, ...children);
const text = (value, style) => div(style, value);
const star = (x, y, size, color) => el('svg', { width:size, height:size, viewBox:'0 0 24 24', style:{position:'absolute',left:x,top:y} },
  el('path', { d:'M12 0C12 8 8 12 0 12C8 12 12 16 12 24C12 16 16 12 24 12C16 12 12 8 12 0Z', fill:color }));
for (const theme of ['light', 'dark']) {
  const p = theme === 'light'
    ? { bg:'#f4efe8', ink:'#393343', muted:'#73667d', accent:'#a18ab8', cloud:'#e7dff0', edge:'#dfd3e3', white:'#fffaf4' }
    : { bg:'#24212c', ink:'#f4edf2', muted:'#bfb1c9', accent:'#c4a7dc', cloud:'#393043', edge:'#514259', white:'#e3d7e4' };
  const tree = div({ width:900,height:288,position:'relative',overflow:'hidden',borderRadius:20,
    padding:34,fontFamily:'Archivo',background:p.bg,color:p.ink,border:`1px solid ${p.edge}` },
    div({position:'absolute',left:560,top:-88,width:380,height:380,borderRadius:190,background:p.cloud}),
    text('music / art / little tools', {fontSize:15,letterSpacing:1.5,color:p.muted}),
    text('okiso', {fontSize:109,fontWeight:900,letterSpacing:-7,lineHeight:1,marginTop:13}),
    text('a little corner of the internet.', {fontSize:23,marginTop:20,color:p.muted}),
    div({position:'absolute',left:634,top:20,width:214,height:248,border:`6px solid ${p.white}`,borderRadius:13,
      transform:'rotate(6deg)',overflow:'hidden',background:p.white},
      el('img',{src:art.suyosuyo,width:202,height:236,style:{objectFit:'cover',objectPosition:'center 22%'}})),
    div({position:'absolute',left:530,top:162,width:147,height:109,border:`5px solid ${p.white}`,borderRadius:9,
      transform:'rotate(-8deg)',overflow:'hidden',background:p.white},
      el('img',{src:art.sobu,width:137,height:99,style:{objectFit:'cover',objectPosition:'center 42%'}})),
    star(496,39,25,p.accent), star(858,194,20,p.accent), star(554,137,13,p.accent),
    el('img',{src:art.mascot,width:68,height:68,style:{position:'absolute',left:810,top:220,objectFit:'contain'}})
  );
  const svg = await satori(tree, {width:900,height:288,fonts});
  await writeFile(join(out, `header-${theme}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(join(out, `header-${theme}.png`));
}
console.log('Wrote themed profile headers with the existing credited artwork');
