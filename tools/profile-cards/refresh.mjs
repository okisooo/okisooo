import { refresh } from './data.mjs';
const snapshot = await refresh();
console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot.sources).map(([name, source]) => [name, { available: !!source.data, updatedAt: source.updatedAt, error: source.error }]))));
