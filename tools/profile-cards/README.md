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

## animated profile

The public profile now uses baked GIF loops in `assets/profile/motion/`. The header has light and dark variants. A clearly linked `README-static.md` uses PNG posters throughout for readers who prefer less motion. GitHub strips unsupported picture media rules, so automatic reduced-motion source selection is not claimed. No JavaScript, tracking badges, or remote animation service is needed.

With Node dependencies and FFmpeg installed, render to explicit output and scratch directories:

```sh
node tools/profile-cards/build-motion-hero.mjs --out-dir /path/to/hero-output --frames-dir /path/to/hero-frames
node tools/profile-cards/build-project-motion.mjs /path/to/project-output /path/to/project-frames
```

The hero renderer currently requires absolute S: destinations on Windows to match this workspace's storage policy. Both generators leave publishing and copying selected GIF/PNG files into `assets/profile/motion/` to the caller. MP4s and intermediate frames stay outside the repository. Run `--help` on the hero renderer for poster-only and encoding options.

The header's waveforms are decorative. The Aether preview cycles through reviewed crops of genuine development editor stills from a synthetic session, accompanied by its cloud sprite. It is not live playback or a released-product demonstration. Only the cropped stills are included; full application captures, activity logs, connection details, private chats, and private Aether source are excluded.

Additional artwork in `assets/motion/` comes from already-public website derivatives: [OTORIxxx's animated diary](https://oki.so/art/gallery/otori-animated-motion.webp), the matching red mascot, and [engawa110's spinning chibi](https://oki.so/art/gallery/engawa110-motion.webp). The diary's four-second loop and the chibi's original 1.4-second timing are retained. See the [gallery and artist credits](https://oki.so/gallery). These commissioned artworks remain their creators' work and are not licensed for reuse with the profile's source code.
