import {readFile, writeFile} from "node:fs/promises"
import {pathToFileURL} from "node:url"

// Keep upstream formatting and rendering; change only authentication and errors.
export function patchMetrics(source) {
  const request = 'await imports.axios.get(`${url}/api/v1/users/${user}/stats/${range}?api_key=${token}`)'
  const replacement = 'await imports.axios.get(`${url}/api/v1/users/${user}/stats/${range}`, {headers: {Authorization: `Bearer ${token}`}, timeout: 30000, maxRedirects: 0})'
  const error = 'throw imports.format.error(error)'
  if (source.split(request).length !== 2 || source.split(error).length !== 2)
    throw new Error("Unexpected upstream WakaTime plugin; review the compatibility patch")
  return source.replace(request, replacement).replace(error,
    'throw new Error(`WakaTime stats failed (HTTP ${error.response?.status ?? "network"}); check OAuth configuration`)')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  await writeFile(file, patchMetrics(await readFile(file, "utf8")))
}
