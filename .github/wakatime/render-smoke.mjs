import {readFile, writeFile} from "node:fs/promises"

// Test-container only: upstream's fixture recognizes api_key=MOCKED_TOKEN.
// Match the migrated Bearer header instead, preserving its generated stats.
const file = "/metrics/tests/mocks/api/axios/get/wakatime.mjs"
const source = await readFile(file, "utf8")
const original = "if (/api_key=MOCKED_TOKEN/.test(url))"
if (source.split(original).length !== 2) throw new Error("Unexpected upstream WakaTime mock")
await writeFile(file, source.replace(original, 'if (options?.headers?.Authorization === "Bearer fake-access")'))
await import("/metrics/source/app/action/index.mjs")
