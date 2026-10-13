import assert from "node:assert/strict"
import {test} from "node:test"
import {prepareOAuth, seal, tokenState, unseal} from "./oauth.mjs"

const now = Date.parse("2026-10-13T00:00:00Z")
const env = {GITHUB_TOKEN: "fake-github", GITHUB_REPOSITORY: "okisooo/okisooo",
  WAKATIME_CLIENT_ID: "fake-client", WAKATIME_CLIENT_SECRET: "fake-secret",
  WAKATIME_REDIRECT_URI: "https://wakatime.com/oauth/test", WAKATIME_STATE_KEY: Buffer.alloc(32, 7).toString("base64")}
const original = {access_token: "fake-access", refresh_token: "fake-refresh", expires_at: "2027-10-13T00:00:00.000Z",
  scope: "read_stats.languages read_stats.editors read_stats.operating_systems"}
const stats = {data: {total_seconds: 3600, daily_average: 120, languages: [], editors: [], operating_systems: []}}
const reply = (status, data = {}) => new Response(JSON.stringify(data), {status})
const saved = state => ({sha: "original-sha", content: Buffer.from(seal(state, env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY)).toString("base64")})
const harness = handlers => {
  const calls = [], masked = []
  const fetcher = async (url, options) => {
    calls.push({url, ...options})
    const handler = handlers.shift()
    assert.ok(handler, `Unexpected request to ${url}`)
    return typeof handler === "function" ? handler(calls.at(-1)) : handler
  }
  return {calls, masked, fetcher, mask: value => masked.push(value), now}
}

test("encrypted state is confidential, authenticated, randomized and bound to the repository", () => {
  const encrypted = seal(original, env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY)
  assert.ok(!encrypted.includes(original.access_token) && !encrypted.includes(original.refresh_token))
  assert.deepEqual(unseal(encrypted, env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY), original)
  assert.notEqual(encrypted, seal(original, env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY))
  for (const [key, repo] of [[Buffer.alloc(32, 8).toString("base64"), env.GITHUB_REPOSITORY], [env.WAKATIME_STATE_KEY, "other/repo"]])
    assert.throws(() => unseal(encrypted, key, repo), /Cannot decrypt/)
  const tampered = JSON.parse(encrypted)
  tampered.ciphertext = Buffer.alloc(50).toString("base64")
  assert.throws(() => unseal(JSON.stringify(tampered), env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY), /Cannot decrypt/)
})

test("bootstrap saves only ciphertext before reading 30-day stats with Bearer auth", async () => {
  const h = harness([reply(404), call => {
    assert.equal(call.method, "PUT")
    const body = JSON.parse(call.body)
    assert.equal(body.branch, "dist")
    assert.equal(body.sha, undefined)
    const encrypted = Buffer.from(body.content, "base64").toString("utf8")
    assert.deepEqual(unseal(encrypted, env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY), original)
    assert.ok(!call.body.includes("fake-refresh"))
    return reply(201, {content: {sha: "bootstrap-sha"}})
  }, call => {
    assert.equal(call.url, "https://wakatime.com/api/v1/users/current/stats/last_30_days")
    assert.equal(call.headers.Authorization, "Bearer fake-access")
    assert.equal(call.redirect, "error")
    return reply(200, stats)
  }])
  assert.equal(await prepareOAuth({...env, WAKATIME_OAUTH_INITIAL_TOKEN: JSON.stringify(original)}, h), "fake-access")
  assert.ok(h.masked.includes("fake-access") && h.masked.includes("fake-refresh"))
})

test("healthy stored token is reused without token creation or state commits", async () => {
  const h = harness([reply(200, saved(original)), reply(200, stats)])
  assert.equal(await prepareOAuth(env, h), "fake-access")
  assert.equal(h.calls.length, 2)
})

test("expiry refresh includes redirect URI and preserves rotated refresh before stats", async () => {
  const expiring = {...original, expires_at: "2026-10-14T00:00:00Z"}
  const renewed = {access_token: "fake-new-access", refresh_token: "fake-new-refresh", expires_in: 31536000, token_type: "bearer"}
  const h = harness([reply(200, saved(expiring)), call => {
    assert.equal(call.url, "https://wakatime.com/oauth/token")
    assert.equal(call.method, "POST")
    assert.equal(call.body.get("grant_type"), "refresh_token")
    assert.equal(call.body.get("redirect_uri"), env.WAKATIME_REDIRECT_URI)
    assert.equal(call.body.get("refresh_token"), original.refresh_token)
    assert.equal(call.body.get("client_secret"), env.WAKATIME_CLIENT_SECRET)
    return reply(200, renewed)
  }, call => {
    const body = JSON.parse(call.body)
    assert.equal(body.sha, "original-sha")
    const state = unseal(Buffer.from(body.content, "base64").toString("utf8"), env.WAKATIME_STATE_KEY, env.GITHUB_REPOSITORY)
    assert.equal(state.refresh_token, renewed.refresh_token)
    assert.equal(state.scope, original.scope)
    return reply(200, {content: {sha: "renewed-sha"}})
  }, call => {
    assert.equal(call.headers.Authorization, "Bearer fake-new-access")
    return reply(200, stats)
  }])
  assert.equal(await prepareOAuth(env, h), renewed.access_token)
})

test("unexpected 401 refreshes once and retries with the new token", async () => {
  const h = harness([reply(200, saved(original)), reply(401), reply(200, {...original, access_token: "fake-new-access"}),
    reply(200, {content: {sha: "renewed-sha"}}), reply(200, stats)])
  assert.equal(await prepareOAuth(env, h), "fake-new-access")
  assert.equal(h.calls.filter(call => call.url.endsWith("/oauth/token")).length, 1)
})

test("bootstrap followed by a 401 updates the newly created state's SHA", async () => {
  const h = harness([reply(404), reply(201, {content: {sha: "bootstrap-sha"}}), reply(401),
    reply(200, {...original, access_token: "fake-new-access"}), call => {
      assert.equal(JSON.parse(call.body).sha, "bootstrap-sha")
      return reply(200, {content: {sha: "renewed-sha"}})
    }, reply(200, stats)])
  assert.equal(await prepareOAuth({...env, WAKATIME_OAUTH_INITIAL_TOKEN: JSON.stringify(original)}, h), "fake-new-access")
})

test("a lost successful state-save response is recovered by ciphertext equality", async () => {
  let encrypted
  const h = harness([reply(404), call => {
    encrypted = JSON.parse(call.body).content
    throw new Error("fake-network-detail-with-secret")
  }, () => reply(200, {sha: "new-sha", content: encrypted}), reply(200, stats)])
  assert.equal(await prepareOAuth({...env, WAKATIME_OAUTH_INITIAL_TOKEN: JSON.stringify(original)}, h), original.access_token)
  assert.equal(h.calls.filter(call => call.method === "PUT").length, 1)
})

test("failed save retries ciphertext but never refreshes again or reads stats", async () => {
  const h = harness([reply(200, saved({...original, expires_at: "2026-10-14T00:00:00Z"})),
    reply(200, original), reply(503), reply(200, saved(original)), reply(503), reply(200, saved(original)),
    reply(503), reply(200, saved(original))])
  await assert.rejects(prepareOAuth(env, h), /OAuth state save failed/)
  assert.equal(h.calls.filter(call => call.url.endsWith("/oauth/token")).length, 1)
  assert.equal(h.calls.filter(call => call.method === "PUT").length, 3)
  assert.equal(h.calls.filter(call => call.url.includes("/stats/")).length, 0)
  assert.equal(new Set(h.calls.filter(call => call.method === "PUT").map(call => call.body)).size, 1)
})

test("concurrent state writes and corrupt state fail without bootstrap fallback", async () => {
  const h = harness([reply(404), reply(409), reply(200, {sha: "other-sha", content: "e30="})])
  await assert.rejects(prepareOAuth({...env, WAKATIME_OAUTH_INITIAL_TOKEN: JSON.stringify(original)}, h), /concurrently/)
  const corrupt = harness([reply(200, {sha: "bad", content: "e30="})])
  await assert.rejects(prepareOAuth({...env, WAKATIME_OAUTH_INITIAL_TOKEN: JSON.stringify(original)}, corrupt), /Cannot decrypt/)
  assert.equal(corrupt.calls.length, 1)
})

test("missing credentials fail before any network request", async () => {
  const h = harness([])
  await assert.rejects(prepareOAuth({}, h), /Missing GITHUB_TOKEN/)
  await assert.rejects(prepareOAuth({...env, WAKATIME_STATE_KEY: "invalid"}, h), /32-byte/)
  await assert.rejects(prepareOAuth({...env, GITHUB_REPOSITORY: "other/repo"}, h), /restricted/)
  assert.equal(h.calls.length, 0)
})

test("revocation, forbidden stats and pending stats fail without disclosing service responses", async () => {
  for (const status of [202, 403, 429, 500]) {
    const h = harness([reply(200, saved(original)), reply(status, {error: "fake-secret-detail"})])
    await assert.rejects(prepareOAuth(env, h), error => error.message.includes(`HTTP ${status}`) && !error.message.includes("fake-secret-detail"))
  }
  const revoked = harness([reply(200, saved(original)), reply(401), reply(400, {error: "fake-secret-detail"})])
  await assert.rejects(prepareOAuth(env, revoked), /refresh failed \(HTTP 400\)/)
  const incomplete = harness([reply(200, saved(original)), reply(200, {data: {total_seconds: 3600}})])
  await assert.rejects(prepareOAuth(env, incomplete), /incomplete/)
})

test("invalid refresh JSON is redacted and omitted refresh tokens retain the previous one", async () => {
  const h = harness([reply(200, saved({...original, expires_at: "2026-10-14T00:00:00Z"})),
    new Response("fake-secret-detail", {status: 200})])
  await assert.rejects(prepareOAuth(env, h), /returned invalid JSON/)
  assert.equal(tokenState({access_token: "new", expires_in: 31536000}, now, original).refresh_token, original.refresh_token)
  assert.throws(() => tokenState({...original, scope: "email"}), /missing.*scopes/)
  assert.throws(() => tokenState({access_token: "missing-refresh", expires_in: 31536000}), /Invalid OAuth/)
})
