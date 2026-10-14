import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
export const cacheDir = process.env.CACHE_DIR || join(root, '.cache');
await mkdir(cacheDir, { recursive: true });
let snapshot = { updatedAt: null, sources: {} };
try { snapshot = JSON.parse(await readFile(join(cacheDir, 'snapshot.json'), 'utf8')); } catch {}
let refreshing;
const permittedMediaHosts = new Set(['s4.anilist.co', 's3.anilist.co', 'cdn.discordapp.com', 'media.discordapp.net', 'i.scdn.co', 'a.ppy.sh', 'assets.ppy.sh', 'oki.so', 'okiso.net']);

async function request(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), ...options });
  if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
  return response;
}

export async function imageData(url) {
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !permittedMediaHosts.has(parsed.hostname)) throw new Error('unsupported artwork host');
  const response = await request(url, { redirect: 'error' });
  if (Number(response.headers.get('content-length')) > 6000000) throw new Error('artwork too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 6000000) throw new Error('artwork too large');
  const resized = await sharp(buffer, { limitInputPixels: 25000000 }).resize({ width: 360, height: 520, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

async function attachImages(items) {
  return Promise.all(items.map(async item => {
    try { return { ...item, imageData: await imageData(item.image) }; }
    catch { return { ...item, imageData: null }; }
  }));
}

async function anime() {
  const media = 'id title { english romaji } coverImage { large } siteUrl episodes';
  const query = `query($name: String!) {
    User(name: $name) { name favourites {
      anime(perPage: 6) { nodes { ${media} } }
      characters(perPage: 12) { nodes { id name { full } image { large } siteUrl } }
    } }
    current: Page(perPage: 6) { mediaList(userName: $name, type: ANIME, status: CURRENT, sort: UPDATED_TIME_DESC) { progress media { ${media} } } }
    completed: Page(perPage: 6) { mediaList(userName: $name, type: ANIME, status: COMPLETED, sort: UPDATED_TIME_DESC) { media { ${media} } } }
  }`;
  const response = await request('https://graphql.anilist.co', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { name: config.anilist } })
  });
  const result = await response.json();
  if (result.errors || !result.data?.User) throw new Error('AniList profile unavailable');
  const data = result.data;
  let section = 'favorite anime';
  let shows = data.User.favourites.anime.nodes;
  if (!shows.length) { section = 'currently watching'; shows = data.current.mediaList.map(row => row.media); }
  if (!shows.length) { section = 'from my completed list'; shows = data.completed.mediaList.map(row => row.media); }
  const cards = shows.map(show => ({ id: show.id, name: show.title.english || show.title.romaji || `anime ${show.id}`, image: show.coverImage.large, url: show.siteUrl }));
  const characters = data.User.favourites.characters.nodes.map(character => ({ id: character.id, name: character.name.full, image: character.image.large, url: character.siteUrl }));
  const [entries, portraits] = await Promise.all([attachImages(cards), attachImages(characters)]);
  return { section, entries, characters: portraits, url: `https://anilist.co/user/${config.anilist}` };
}

async function presence() {
  const result = await (await request(`https://api.lanyard.rest/v1/users/${config.discord}`)).json();
  if (!result.success || !result.data) throw new Error('presence unavailable');
  const data = result.data;
  const activity = data.activities?.find(activity => [0, 2, 3].includes(activity.type));
  return {
    status: data.discord_status,
    activity: activity ? { type: activity.type, name: activity.name, details: activity.details || '', state: activity.state || '' } : null,
    spotify: data.spotify ? { name: data.spotify.song, artist: data.spotify.artist, url: `https://open.spotify.com/track/${data.spotify.track_id}` } : null
  };
}

async function osu() {
  if (process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET) {
    const tokenResponse = await request('https://osu.ppy.sh/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.OSU_CLIENT_ID, client_secret: process.env.OSU_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'public' })
    });
    const token = await tokenResponse.json();
    const user = await (await request(`https://osu.ppy.sh/api/v2/users/${encodeURIComponent(config.osu)}/osu?key=username`, { headers: { authorization: `Bearer ${token.access_token}` } })).json();
    if (!user.statistics) throw new Error('osu statistics unavailable');
    return { provider: 'osu! API', name: user.username, pp: user.statistics.pp, rank: user.statistics.global_rank, accuracy: user.statistics.hit_accuracy, countryRank: user.statistics.country_rank, country: user.country_code, url: `https://osu.ppy.sh/users/${user.id}` };
  }
  const svg = await (await request(`https://osu-sig.s23.moe/card?user=${encodeURIComponent(config.osu)}&mode=std&lang=en&mini=true&animation=false`)).text();
  if (!svg.includes('<svg') || svg.length > 6000000) throw new Error('osu signature unavailable');
  const png = await sharp(Buffer.from(svg)).resize(640).png().toBuffer();
  return { provider: 'osu signature', name: config.osu, imageData: `data:image/png;base64,${png.toString('base64')}`, url: `https://osu.ppy.sh/users/${config.osu}` };
}

async function release() {
  const text = await (await request('https://raw.githubusercontent.com/okisooo/site/main/src/data/releases.ts')).text();
  const marker = 'export const staticReleases: Release[] = ';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('release data unavailable');
  const tail = text.slice(start + marker.length);
  const end = tail.lastIndexOf('];');
  const releases = JSON.parse(tail.slice(0, end + 1));
  const latest = releases.filter(item => item.releaseDate <= new Date().toISOString().slice(0, 10)).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
  if (!latest) throw new Error('no released music');
  return { name: latest.title, date: latest.releaseDate, type: latest.albumType, imageData: await imageData(latest.img), url: latest.slug ? `${config.website}/release/${latest.slug}` : latest.link };
}

export function getSnapshot() { return snapshot; }
export function freshSource(name, maxAge) {
  const source = snapshot.sources[name];
  if (!source?.data || !source.updatedAt || source.error) return false;
  return Date.now() - Date.parse(source.updatedAt) < maxAge;
}

export async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const adapters = { anime, presence, osu, release };
    const maxAges = { anime: 6 * 3600000, presence: 120000, osu: 3600000, release: 6 * 3600000 };
    const selected = Object.entries(adapters).filter(([name]) => !freshSource(name, maxAges[name]));
    const results = await Promise.allSettled(selected.map(([, adapter]) => adapter()));
    results.forEach((result, index) => {
      const name = selected[index][0];
      if (result.status === 'fulfilled') snapshot.sources[name] = { data: result.value, updatedAt: new Date().toISOString(), error: null };
      else snapshot.sources[name] = { ...snapshot.sources[name], error: 'temporarily unavailable', checkedAt: new Date().toISOString() };
    });
    snapshot.updatedAt = new Date().toISOString();
    const temporaryPath = join(cacheDir, 'snapshot.tmp.json');
    await writeFile(temporaryPath, JSON.stringify(snapshot));
    const { rename } = await import('node:fs/promises');
    await rename(temporaryPath, join(cacheDir, 'snapshot.json'));
    return snapshot;
  })().finally(() => { refreshing = null; });
  return refreshing;
}
