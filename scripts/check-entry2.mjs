const r = await fetch('https://awesome-dsh-plugin.com/plugins.json')
const j = await r.json()
const hit = j.plugins.filter((p) => p.name === 'dsh-positions' && p.owner === 'zhang-1239')
console.log('catalog updated:', j.updated, '| total:', j.count)
for (const p of hit) {
  console.log(JSON.stringify({
    name: p.name, npm: p.npm, version: p.version, install: p.install,
    screenshots: p.screenshots ? p.screenshots.length : 0, added: p.added
  }, null, 2))
}
