import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OWNER = 'zhang-1239'
const REPO = 'dsh-positions'
const API = 'https://api.github.com'
const ROOT = 'D:\\PositionsWorkbench\\plugin'
const TOKEN = readFileSync('D:\\PositionsWorkbench\\secret\\token.txt', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('github=')).slice('github='.length).trim()

const headers = {
  authorization: `Bearer ${TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-positions-publisher',
  'x-github-api-version': '2022-11-28'
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${json?.message || text.slice(0, 160)}`)
    err.status = res.status
    throw err
  }
  return json
}

const FILES = ['package.json', 'README.md', 'screenshots.json', 'docs/screenshots/01-main.jpg']
const REMOVE = ['docs/screenshots/01-overview.jpg']

const repo = await api('GET', `/repos/${OWNER}/${REPO}`)
const branch = repo.default_branch || 'main'

for (const rel of FILES) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) { console.log('skip', rel); continue }
  const buf = readFileSync(file)
  let existing = null
  try {
    existing = await api('GET', `/repos/${OWNER}/${REPO}/contents/${rel}?ref=${branch}`)
  } catch (err) {
    if (err.status !== 404) throw err
  }
  await api('PUT', `/repos/${OWNER}/${REPO}/contents/${rel}`, {
    message: `release: v0.3.2 ${rel}`,
    content: buf.toString('base64'),
    branch,
    ...(existing?.sha ? { sha: existing.sha } : {})
  })
  console.log('put', rel, buf.length, 'bytes')
}

for (const rel of REMOVE) {
  try {
    const existing = await api('GET', `/repos/${OWNER}/${REPO}/contents/${rel}?ref=${branch}`)
    await api('DELETE', `/repos/${OWNER}/${REPO}/contents/${rel}`, {
      message: `release: drop stale ${rel}`,
      sha: existing.sha,
      branch
    })
    console.log('deleted', rel)
  } catch (err) {
    if (err.status === 404) console.log('already gone', rel)
    else throw err
  }
}
console.log('done')
