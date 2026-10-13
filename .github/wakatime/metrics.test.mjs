import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {test} from "node:test"
import {patchMetrics} from "./patch-metrics.mjs"

// Point at the public pinned checkout locally; CI reads the actual pinned image.
const file = process.env.METRICS_PLUGIN_SOURCE
if (!file) throw new Error("Set METRICS_PLUGIN_SOURCE to the pinned upstream WakaTime plugin")
const source = await readFile(file, "utf8")
const patched = patchMetrics(source)
const load = async text => (await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`)).default
const originalPlugin = await load(source)
const oauthPlugin = await load(patched)
const data = {total_seconds: 180000, daily_average: 6000, projects: [],
  languages: [{name: "JavaScript", percent: 60, total_seconds: 108000}, {name: "Python", percent: 40, total_seconds: 72000}],
  editors: [{name: "VS Code", percent: 100, total_seconds: 180000}],
  operating_systems: [{name: "Windows", percent: 100, total_seconds: 180000}]}
const args = get => [{login: "okisooo", q: {wakatime: true}, imports: {
  axios: {get}, filters: {text: () => true}, format: {error: error => error},
  metadata: {plugins: {wakatime: {enabled: () => true, inputs: () => ({
    sections: ["time", "languages", "languages-graphs", "editors", "os"], days: "30", limit: 5,
    url: "https://wakatime.com", user: "current", "repositories.visibility": "all",
  })}}},
}}, {enabled: true, token: "fake-access"}]

test("patched plugin uses Bearer auth without api_key and keeps identical display data", async () => {
  const baseline = await originalPlugin(...args(async () => ({data: {data}})))
  const migrated = await oauthPlugin(...args(async (url, options) => {
    assert.equal(url, "https://wakatime.com/api/v1/users/current/stats/last_30_days")
    assert.ok(!url.includes("fake-access") && !url.includes("api_key"))
    assert.equal(options.headers.Authorization, "Bearer fake-access")
    assert.equal(options.maxRedirects, 0)
    assert.equal(options.timeout, 30000)
    return {data: {data}}
  }))
  assert.deepEqual(migrated, baseline)
  assert.equal(migrated.time.total, 50)
  assert.deepEqual(migrated.sections, ["time", "languages", "languages-graphs", "editors", "os"])
})

test("Axios errors cannot expose headers or tokens in logs or generated images", async () => {
  await assert.rejects(oauthPlugin(...args(async () => {
    throw {message: "fake-access", response: {status: 401, data: "fake-access"}, config: {headers: {Authorization: "Bearer fake-access"}}}
  })), error => error.message.includes("HTTP 401") && !JSON.stringify(error).includes("fake-access") && !error.message.includes("fake-access"))
})

test("upstream changes and repeated patching fail closed", () => {
  assert.throws(() => patchMetrics(source.replace("?api_key=", "?unknown=")), /Unexpected upstream/)
  assert.throws(() => patchMetrics(patched), /Unexpected upstream/)
})
