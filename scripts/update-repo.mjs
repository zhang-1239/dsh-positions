import { readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const OWNER = 'zhang-1239'
const REPO = 'dsh-positions'
const API = 'https://api.github.com'
const ROOT = 'D:\\PositionsWorkbench\\plugin'

const TOKEN = readFileSync('D:\\PositionsWorkbench\\secrets\\tokens.txt', 'utf8')
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

const UPLOAD = [
  'package.json',
  'README.md',
  'screenshots.json',
  'docs/screenshots/01-overview.jpg',
  'docs/screenshots/02-calc.jpg',
  'docs/screenshots/03-modal.jpg',
  'docs/screenshots/04-groups.jpg',
  'docs/prompt.md'
]

const REMOVE = [
  'docs/screenshots/03-plans.jpg',
  'docs/screenshots/04-history.jpg',
  'docs/screenshots/05-settings.jpg'
]

;(async () => {
  const repo = await api('GET', `/repos/${OWNER}/${REPO}`)
  const branch = repo.default_branch || 'main'
  console.log('auth ok, branch:', branch)

  for (const rel of UPLOAD) {
    const file = join(ROOT, rel)
    if (!existsSync(file)) { console.log('skip missing', rel); continue }
    const buf = readFileSync(file)
    let existing = null
    try {
      existing = await api('GET', `/repos/${OWNER}/${REPO}/contents/${rel}?ref=${branch}`)
    } catch (err) {
      if (err.status !== 404) throw err
    }
    await api('PUT', `/repos/${OWNER}/${REPO}/contents/${rel}`, {
      message: `chore: update ${rel}`,
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
        message: `chore: remove stale mockup ${rel}`,
        sha: existing.sha,
        branch
      })
      console.log('deleted', rel)
    } catch (err) {
      if (err.status === 404) console.log('already gone', rel)
      else throw err
    }
  }

  const readme = await (await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/README.md`, { headers })).json()
  const text = Buffer.from(readme.content, 'base64').toString('utf8')
  console.log('README 截图数:', (text.match(/docs\/screenshots\//g) || []).length)
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1) })
