# okiso / profile cards

original-art profile cards that match [oki.so](https://oki.so). generates light/dark svg banners, an anime shelf, favorite characters, discord presence, osu signatures, music releases, and mascot dividers. the small studio previews artwork/color choices and exports github markdown.

```sh
npm ci
npm start
```

open `http://localhost:3000`. `npm run export -- /path/to/output` writes svg/png snapshots and a readme. `npm test` checks rendering, input bounds, http behavior, and portable svg output.

each card is at `/<name>.svg`. options: `theme=light|dark`, `accent=cc0000`, `art=suyosuyo|sobu`, `count=1..12`, and `title=<divider title>`. options change only the requested image; the public studio has no settings-writing endpoint.

data is cached to `CACHE_DIR` (default `.cache`). AniList and music refresh every six hours, osu hourly, and presence every two minutes. errors retain the last good snapshot, marked as saved where relevant. github's image proxy can cache these snapshots longer.

environment settings:

- `PORT`: defaults to 3000.
- `CACHE_DIR`: writable persistent cache.
- `PUBLIC_BASE`: base URL in copied markdown; defaults to `https://profile.oki.so`.
- `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET`: optional official osu API application credentials. without them, the existing s23 signature is cached and embedded as an image; no website scraping is performed here.

the service uses AniList's public GraphQL API and Lanyard's public presence API. latest releases come from the same public release dataset as the site. the renderer is self-hosted; it still depends on these data providers. the studio returns no secrets or raw cached account data.

art: suyosuyo; sobu · @sobsocks; mascot by 7mmchan. artwork remains its creators' work and is not licensed for reuse by this source code. fonts are distributed by Fontsource under their respective font licenses. implementation uses Satori and Sharp; third-party notices remain in installed packages.

on the vps, clone this profile repository to `/home/fedora/profile-cards`, then run `docker compose -f tools/profile-cards/compose.yml up -d --build`. it joins the existing Caddy network without publishing a new host port. Caddy's `profile.oki.so` route is tracked separately in okiso-stack. keep the persistent volume and preserve unrelated live server edits.

the profile also keeps generated svg snapshots in `cards/`, refreshed by its own github workflow every six hours. these are fallback assets when the vps is offline. live hosted embeds are used by the main profile and can be customized and copied from the studio.

## profile header artwork

The profile's cream/lavender light banner and plum dark banner are static assets in `assets/profile/`. They use the existing credited artwork and self-contained SVGs with outlined text. Regenerate them with an explicit output directory, then copy the two SVGs into that folder:

```sh
node tools/profile-cards/build-profile-header.mjs /path/to/header-output
```

The header generator also produces PNG previews. It does not change the live card service or its data sources.

`assets/profile/profile-share.png` is the matching custom GitHub preview for this repository's links.
