import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { refresh, config } from './data.mjs';
import { cardNames, renderCard } from './render.mjs';
import { readme } from './server.mjs';
const directory = resolve(process.argv[2] || 'exports');
await mkdir(directory, { recursive: true });
const snapshot = await refresh();
for (const name of ['anime', 'presence', 'osu', 'release']) {
  if (!snapshot.sources[name]?.data) throw new Error(`${name} has no saved data; existing profile images must be preserved`);
}
for (const theme of ['light', 'dark']) {
  for (const name of cardNames) {
    const svg = await renderCard(name, snapshot, { theme });
    await writeFile(join(directory, `${name}-${theme}.svg`), svg);
    await sharp(Buffer.from(svg)).png().toFile(join(directory, `${name}-${theme}.png`));
  }
}
await writeFile(join(directory, 'README.md'), readme(config.publicBase));
await writeFile(join(directory, 'sources.json'), JSON.stringify(Object.fromEntries(Object.entries(snapshot.sources).map(([name, source]) => [name, { available: !!source.data, updatedAt: source.updatedAt, error: source.error }])), null, 2));
console.log(`exported light/dark cards and readme to ${directory}`);
