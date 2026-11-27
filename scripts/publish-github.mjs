import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const OWNER = 'zhang-1239'
const REPO = 'dsh-positions'
const ROOT = 'D:\\PositionsWorkbench\\plugin'
const API = 'https://api.github.com'

const tokenLine = readFileSync('D:\\PositionsWorkbench\\secrets\\tokens.txt', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('github='))
const TOKEN = tokenLine.slice('github='.length).trim()

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
    const msg = json && json.message ? json.message : text.slice(0, 200)
    const err = new Error(`${method} ${path} -> ${res.status}: ${msg}`)
    err.status = res.status
    throw err
  }
  return json
}

const SKIP = new Set(['node_modules', '.git', 'data', 'scripts', '.npm-cache', 'secrets'])
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

;(async () => {
  const me = await api('GET', '/user')
  console.log('auth ok:', me.login)

  try {
    await api('GET', `/repos/${OWNER}/${REPO}`)
    console.log('repo exists')
  } catch (err) {
    if (err.status !== 404) throw err
    await api('POST', '/user/repos', {
      name: REPO,
      description: 'DSH plugin: cost-basis workbench for your own positions (no quotes)',
      private: false,
      has_issues: true,
      auto_init: false
    })
    console.log('repo created')
  }

  const repo = await api('GET', `/repos/${OWNER}/${REPO}`)
  const branch = repo.default_branch || 'main'
  console.log('branch:', branch)

  const files = walk(ROOT)
  console.log('files:', files.length)

  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/')
    const buf = readFileSync(file)
    let existing = null
    try {
      existing = await api('GET', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}?ref=${branch}`)
    } catch (err) {
      if (err.status !== 404) throw err
    }
    await api('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}`, {
      message: `chore: add ${rel}`,
      content: buf.toString('base64'),
      branch,
      ...(existing && existing.sha ? { sha: existing.sha } : {})
    })
    console.log('put', rel, buf.length, 'bytes')
  }

  const repo2 = await api('GET', `/repos/${OWNER}/${REPO}`)
  console.log('done:', repo2.html_url, '| default:', repo2.default_branch)
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1) })