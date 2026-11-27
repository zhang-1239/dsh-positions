const r = await fetch('https://awesome-dsh-plugin.com/plugins.json')
const j = await r.json()
const hit = j.plugins.filter((p) => JSON.stringify(p).includes('dsh-positions'))
console.log('命中条目数:', hit.length, '| 目录 updated:', j.updated, '| 总数:', j.count)
for (const p of hit) {
  console.log(JSON.stringify({
    name: p.name,
    owner: p.owner,
    npm: p.npm,
    version: p.version,
    category: p.category,
    install: p.install,
    page: p.page,
    screenshots: p.screenshots ? p.screenshots.length : 0,
    icon: p.icon ? 'yes' : 'no',
    added: p.added
  }, null, 2))
}
