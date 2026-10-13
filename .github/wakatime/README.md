# WakaTime OAuth for profile Metrics

The account-specific notice retires API-key reads on November 1, 2026. Editor
heartbeats continue using their existing API key. Nothing here changes editor
configuration, revokes that key, or requests heartbeat access.

The [upstream WakaTime plugin](https://github.com/lowlighter/metrics/blob/65836723097537a54cd8eb90f61839426b4266b6/source/plugins/wakatime/index.mjs)
uses `?api_key=`, so putting an OAuth access token into `WAKATIME_API_KEY` is not a
migration. This workflow uses the same Metrics v3.34 renderer and templates with
only the WakaTime request changed to `Authorization: Bearer`. The image and action
are pinned. The patch checks the upstream request shape and suppresses Axios
errors that could contain tokens. The existing 30-day range, five-item limit,
sections, SVG URL, profile README, and AniList inputs stay the same.

## Activation requires separate approval

Do not create an OAuth app/grant, generate credentials, or configure persistent
credentials merely because this code is ready. Obtain action-time approval for:

1. A WakaTime OAuth app for **okisooo's GitHub profile**, with the authorized
   redirect URL `https://wakatime.com/oauth/test` and an **authorization-code**
   grant (`response_type=code`). Request exactly
   `read_stats.languages read_stats.editors read_stats.operating_systems`.
   This reads the displayed stats; it does not request projects, files, email,
   heartbeat reads/writes, or account modification. If the provider omits totals
   for the restricted grant, stop and ask before broadening to `read_stats`.
2. Store the following only in
   [okisooo/okisooo Actions settings](https://github.com/okisooo/okisooo/settings/secrets/actions):

   | Kind | Name | Value/source |
   | --- | --- | --- |
   | Variable | `WAKATIME_CLIENT_ID` | The new app's client ID |
   | Variable | `WAKATIME_REDIRECT_URI` | `https://wakatime.com/oauth/test` |
   | Secret | `WAKATIME_CLIENT_SECRET` | The new app's client secret |
   | Secret | `WAKATIME_STATE_KEY` | A newly generated random 32-byte key, base64 encoded |
   | Secret | `WAKATIME_OAUTH_INITIAL_TOKEN` | The authorization-code token response JSON, including access token, refresh token, and `expires_at` or `expires_in` |

3. Allow the approved workflow to persist **AES-256-GCM encrypted** access/refresh
   tokens at `dist:.wakatime/oauth-state.json`. This branch/file is public;
   plaintext credentials and the encryption key must never be committed.
   The existing ephemeral repository `GITHUB_TOKEN` needs only its existing
   `contents: write` permission for this file. No new GitHub PAT or external
   token-storage service is needed.

Keep all token values out of chat, logs, screenshots, command arguments, Git,
and build contexts. Use hidden local input or a protected temporary file piped
to `gh secret set --repo okisooo/okisooo NAME`; never print the value. Validate a
random OAuth `state` parameter before exchanging the authorization code. The
token exchange must include the same redirect URI. The code intentionally does
not perform the initial grant or exchange.

Review and approve merging separately. Only `main` can publish images or refresh
tokens. After approved setup and merge, manually run **Metrics** on `main` to
verify live stats, encrypted persistence and the displayed panel. Remove the
bootstrap secret after that successful run, with approval for the credential
configuration change. Do not trigger production runs from this draft PR.

## Renewal and recovery

[WakaTime's OAuth documentation](https://wakatime.com/developers#authentication)
specifies Bearer headers, refresh-token exchange, and 365-day authorization-code
tokens. The daily job reuses its access token, refreshes within seven days of
expiry (or once after a 401), and includes `client_id`, `client_secret`,
`redirect_uri`, `grant_type=refresh_token`, and the previous refresh token.

Rotated access and refresh tokens are encrypted and committed **before** the
stats request or renderer runs. AES-GCM authenticates the state and binds it to
this repository/file. A single workflow concurrency group prevents overlapping
rotations; active runs are not automatically cancelled. Failed saves retry the
same ciphertext and check whether a response was lost after a successful write.
A lost/invalid encryption key, concurrent conflicting write, revoked grant, or
unrecoverable save failure stops the main panel update with a sanitized error.
If a refresh was consumed but could not be saved, a new approved grant may be
needed. No fallback to the editor API key is allowed.

A non-200, stale or incomplete stats response keeps the previous main image.
The AniList steps run independently even when WakaTime fails. Valid stats are
checked for totals, languages, editors and operating systems before rendering.

Keep the encryption key for the lifetime of the encrypted state. Do not replace
it without an approved recovery/re-encryption plan. Git history retains old
ciphertext; never disclose the key. To disconnect, approve revocation of this
app's access/refresh tokens and removal of the new secrets/variables/state file.
Leave the editor ingestion API key alone. A code rollback does not revoke OAuth.

## Verification

Run offline lifecycle tests with `node --test .github/wakatime/oauth.test.mjs`.
Set `METRICS_PLUGIN_SOURCE` to a public upstream WakaTime `index.mjs`, then run
`node --test .github/wakatime/metrics.test.mjs` for request and display-data
compatibility. All credentials used by these tests are fake.

The PR check also extracts the actual plugin from the pinned image, checks it,
builds the small derived image, and smoke-renders the existing configuration
with upstream mocked data and Docker networking disabled. It also executes the
pinned local composite launcher with mocked base data and no commit output.
It cannot validate
the user's live grant until the separate activation approval is given.

When updating Metrics, review the image digest, the pinned action commit/version,
the `metrics:forked-3.34.0` tag expected by upstream's local composite action, and
the compatibility patch together. The unchanged local upstream action finds
the prepared image and runs it with its normal input/environment handling.
