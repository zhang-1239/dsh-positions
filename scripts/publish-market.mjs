import { readFileSync } from 'node:fs'

const OWNER = 'zhang-1239'
const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin'
const API = 'https://api.github.com'

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const YML = `url: https://github.com/zhang-1239/dsh-positions
name: zhang-1239/dsh-positions
category: tools
description:
  en: "Cost-basis workbench for your own positions: log buys/sells, then preview how a trade would change cost, position size and break-even before you place it. Local-only, no quotes, no network."
  zh: "持仓成本台：记录自己的买卖，并在下单前预览这笔交易会把成本、仓位、保本价变成多少。只在本机读写，不含行情、不联网。"
icon: https://raw.githubusercontent.com/zhang-1239/dsh-positions/main/icon-512.png
`

;(async () => {
  const me = await api('GET', '/user')
  console.log('auth:', me.login)

  // 1. fork
  try {
    await api('GET', `/repos/${OWNER}/awesome-dsh-plugin`)
    console.log('fork already exists')
  } catch (err) {
    if (err.status !== 404) throw err
    await api('POST', `/repos/${UPSTREAM}/forks`, { default_branch_only: true })
    console.log('fork requested')
    for (let i = 0; i < 30; i++) {
      await sleep(3000)
      try {
        const f = await api('GET', `/repos/${OWNER}/awesome-dsh-plugin`)
        if (f && f.default_branch) { console.log('fork ready:', f.default_branch); break }
      } catch { /* keep waiting */ }
    }
  }

  const fork = await api('GET', `/repos/${OWNER}/awesome-dsh-plugin`)
  const branch = fork.default_branch || 'main'
  console.log('fork branch:', branch)

  // 2. 写入条目
  const path = 'data/plugins/zhang-1239__dsh-positions.yml'
  let existing = null
  try {
    existing = await api('GET', `/repos/${OWNER}/awesome-dsh-plugin/contents/${path}?ref=${branch}`)
  } catch (err) {
    if (err.status !== 404) throw err
  }
  await api('PUT', `/repos/${OWNER}/awesome-dsh-plugin/contents/${path}`, {
    message: 'Add dsh-positions plugin entry',
    content: Buffer.from(YML, 'utf8').toString('base64'),
    branch,
    ...(existing?.sha ? { sha: existing.sha } : {})
  })
  console.log('entry committed:', path)

  // 3. 提 PR
  const body = `Adds **dsh-positions**, a local-only cost-basis workbench for DSH.

- npm: \`@zhangxij/dsh-positions@0.1.0\`
- repo: https://github.com/zhang-1239/dsh-positions
- entry: \`${path}\`

**What it does**

Log your own buys/sells and, before you place a trade, see how it would change
your average cost, position size and break-even. No quotes, no market data, no network calls.

**Capabilities**

- \`fs-read\`, \`fs-write\` — only its own data directory
- no network, no telemetry, no credentials

**Notes**

- The sidebar entry is labelled 台账 (ledger), the page itself is 持仓成本台.
- First launch seeds 5 example positions so the panel is not empty.
`

  try {
    const pr = await api('POST', `/repos/${UPSTREAM}/pulls`, {
      title: 'Add dsh-positions: cost-basis workbench',
      head: `${OWNER}:${branch}`,
      base: 'main',
      body
    })
    console.log('PR:', pr.html_url)
  } catch (err) {
    if (err.status === 422) {
      const list = await api('GET', `/repos/${UPSTREAM}/pulls?head=${OWNER}:${branch}&state=open`)
      if (list.length) console.log('PR exists:', list[0].html_url)
      else throw err
    } else {
      throw err
    }
  }
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1) })
