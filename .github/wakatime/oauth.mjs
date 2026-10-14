import {createCipheriv, createDecipheriv, randomBytes} from "node:crypto"
import {appendFile} from "node:fs/promises"
import {pathToFileURL} from "node:url"

const statePath = ".wakatime/oauth-state.json"
const scopes = ["read_stats.languages", "read_stats.editors", "read_stats.operating_systems"]
const week = 7 * 24 * 60 * 60 * 1000

function keyBytes(key) {
  const bytes = Buffer.from(key, "base64")
  if (bytes.length !== 32 || bytes.toString("base64") !== key)
    throw new Error("WAKATIME_STATE_KEY must be a base64-encoded 32-byte key")
  return bytes
}

function hasWhitespace(value) {
  // trim and RegExp whitespace share ECMAScript's WhiteSpace + LineTerminator set.
  for (const character of value)
    if (character.trim().length === 0) return true
  return false
}

export function tokenState(token, now = Date.now(), previous = {}) {
  const expiresAt = token.expires_at
    ? Date.parse(token.expires_at)
    : now + Number(token.expires_in) * 1000
  if (typeof token.access_token !== "string" || !token.access_token || hasWhitespace(token.access_token)
    || typeof (token.refresh_token ?? previous.refresh_token) !== "string"
    || !(token.refresh_token ?? previous.refresh_token) || !Number.isFinite(expiresAt)
    || (token.token_type && token.token_type.toLowerCase() !== "bearer"))
    throw new Error("Invalid OAuth token response; access, refresh and expiry are required")
  const granted = token.scope ?? previous.scope
  if (granted && !granted.split(/[ ,]+/).includes("read_stats")
    && !scopes.every(scope => granted.split(/[ ,]+/).includes(scope)))
    throw new Error("OAuth grant is missing the profile's stats scopes")
  return {access_token: token.access_token, refresh_token: token.refresh_token ?? previous.refresh_token,
    expires_at: new Date(expiresAt).toISOString(), ...(granted ? {scope: granted} : {})}
}

export function seal(state, key, repository) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv)
  cipher.setAAD(Buffer.from(`${repository}/${statePath}/v1`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()])
  return JSON.stringify({version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64")})
}

export function unseal(envelope, key, repository) {
  try {
    const payload = JSON.parse(envelope)
    if (payload.version !== 1) throw new Error()
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(payload.iv, "base64"))
    decipher.setAAD(Buffer.from(`${repository}/${statePath}/v1`))
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
    return tokenState(JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final(),
    ]).toString("utf8")))
  } catch {
    throw new Error("Cannot decrypt OAuth state; restore the matching state key or authorize recovery")
  }
}

async function request(fetcher, url, options, label) {
  let response
  try {
    response = await fetcher(url, {...options, redirect: "error", signal: AbortSignal.timeout(30000)})
  } catch {
    throw new Error(`${label} failed (network); retry the workflow`)
  }
  return response
}

async function json(response, label) {
  try { return await response.json() }
  catch { throw new Error(`${label} returned invalid JSON`) }
}

export async function prepareOAuth(env, {fetcher = fetch, now = Date.now(), mask = () => {}} = {}) {
  for (const name of ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "WAKATIME_CLIENT_ID", "WAKATIME_CLIENT_SECRET",
    "WAKATIME_REDIRECT_URI", "WAKATIME_STATE_KEY"])
    if (!env[name]) throw new Error(`Missing ${name}; complete the approved OAuth setup`)
  keyBytes(env.WAKATIME_STATE_KEY)
  const repository = env.GITHUB_REPOSITORY
  if (repository !== "okisooo/okisooo") throw new Error("OAuth state is restricted to okisooo/okisooo")
  const contents = `https://api.github.com/repos/${repository}/contents/${statePath}`
  const githubHeaders = {Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"}
  const stored = await request(fetcher, `${contents}?ref=dist`, {headers: githubHeaders}, "OAuth state read")
  let state, sha, dirty = false
  if (stored.status === 404) {
    if (!env.WAKATIME_OAUTH_INITIAL_TOKEN) throw new Error("Missing initial OAuth token; authorize setup first")
    try { state = tokenState(JSON.parse(env.WAKATIME_OAUTH_INITIAL_TOKEN), now) }
    catch { throw new Error("Invalid initial OAuth token JSON; access, refresh, expiry and stats scopes are required") }
    dirty = true
  } else {
    if (!stored.ok) throw new Error(`OAuth state read failed (HTTP ${stored.status})`)
    const saved = await json(stored, "OAuth state read")
    sha = saved.sha
    state = unseal(Buffer.from(saved.content, "base64").toString("utf8"), env.WAKATIME_STATE_KEY, repository)
  }
  const maskState = () => {
    for (const token of [state.access_token, state.refresh_token]) {
      mask(token)
      mask(encodeURIComponent(token)) // Upstream's composite action URL-encodes inputs.
    }
  }
  maskState()

  const refresh = async () => {
    const response = await request(fetcher, "https://wakatime.com/oauth/token", {
      method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/json"},
      body: new URLSearchParams({grant_type: "refresh_token", client_id: env.WAKATIME_CLIENT_ID,
        client_secret: env.WAKATIME_CLIENT_SECRET, redirect_uri: env.WAKATIME_REDIRECT_URI,
        refresh_token: state.refresh_token}),
    }, "WakaTime OAuth refresh")
    if (!response.ok) throw new Error(`WakaTime OAuth refresh failed (HTTP ${response.status}); reauthorize if revoked`)
    state = tokenState(await json(response, "WakaTime OAuth refresh"), now, state)
    if (Date.parse(state.expires_at) <= now + week)
      throw new Error("Refreshed OAuth token expires too soon; use an authorization-code grant")
    maskState()
    dirty = true
  }

  // Persist rotation before any stats/render request; a rendering failure cannot lose it.
  const persist = async () => {
    if (!dirty) return
    const encrypted = seal(state, env.WAKATIME_STATE_KEY, repository)
    const body = JSON.stringify({message: "[skip ci] Preserve WakaTime OAuth state", branch: "dist",
      content: Buffer.from(encrypted).toString("base64"), ...(sha ? {sha} : {})})
    let failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(fetcher, contents, {method: "PUT", headers: githubHeaders, body}, "OAuth state save")
        if (response.ok) {
          const saved = await json(response, "OAuth state save")
          if (!saved.content?.sha) throw new Error("OAuth state save returned no file SHA")
          sha = saved.content.sha
          dirty = false
          return
        }
        // A prior PUT may have succeeded even if its response was lost.
        failure = new Error(`OAuth state save failed (HTTP ${response.status}); restore/regrant if rotation was lost`)
      } catch (error) { failure = error }
      const check = await request(fetcher, `${contents}?ref=dist`, {headers: githubHeaders}, "OAuth state save verification")
      if (check.ok) {
        const saved = await json(check, "OAuth state save verification")
        if (Buffer.from(saved.content, "base64").toString("utf8") === encrypted) {
          sha = saved.sha
          dirty = false
          return
        }
        if (saved.sha !== sha) throw new Error("OAuth state changed concurrently; inspect state before recovery")
      }
    }
    throw failure
  }

  const refreshed = Date.parse(state.expires_at) <= now + week
  if (refreshed) await refresh()
  await persist()

  const stats = () => request(fetcher, "https://wakatime.com/api/v1/users/current/stats/last_30_days", {
    headers: {Authorization: `Bearer ${state.access_token}`},
  }, "WakaTime stats")
  let response = await stats()
  if (response.status === 401 && !refreshed) {
    await refresh()
    await persist()
    response = await stats()
  }
  if (response.status !== 200) throw new Error(`WakaTime stats not ready (HTTP ${response.status}); preserve the previous image and retry`)
  const {data} = await json(response, "WakaTime stats")
  if (!data || data.is_up_to_date === false || !Number.isFinite(data.total_seconds)
    || !Number.isFinite(data.daily_average) || ![data.languages, data.editors, data.operating_systems].every(Array.isArray))
    throw new Error("WakaTime stats are incomplete; preserve the previous image and check scopes or retry")
  return state.access_token
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mask = value => console.log(`::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`)
    const access = await prepareOAuth(process.env, {mask})
    await appendFile(process.env.GITHUB_OUTPUT, `access_token=${access}\n`)
    console.log("WakaTime OAuth ready; 30-day stats verified")
  } catch (error) {
    console.error(error.message.startsWith("Unexpected") ? "Invalid OAuth service response" : error.message)
    process.exitCode = 1
  }
}
