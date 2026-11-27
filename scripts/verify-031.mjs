import { writeFileSync } from 'node:fs'

const url = 'https://registry.npmjs.org/@zhangxij/dsh-positions'
let latest = ''
for (let i = 1; i <= 12; i++) {
  const j = await (await fetch(url)).json()
  latest = j['dist-tags'].latest
  if (latest === '0.3.1') {
    const t = await fetch(j.versions['0.3.1'].dist.tarball)
    if (t.ok) {
      const buf = Buffer.from(await t.arrayBuffer())
      writeFileSync('D:\\PositionsWorkbench\\pkg-031.tgz', buf)
      console.log('npm latest:', latest, '| tarball', buf.length, 'bytes')
      break
    }
  }
  console.log('try', i, 'latest=', latest)
  await new Promise((s) => setTimeout(s, 25000))
}

const gh = await (await fetch('https://api.github.com/repos/zhang-1239/dsh-positions/contents/docs/screenshots', { headers: { 'user-agent': 'check' } })).json()
console.log('GitHub screenshots:', gh.map((f) => f.name).join(', '))

const cat = await (await fetch('https://awesome-dsh-plugin.com/plugins.json')).json()
const hit = cat.plugins.find((p) => p.name === 'dsh-positions' && p.owner === 'zhang-1239')
console.log('catalog updated:', cat.updated, '| version:', hit ? hit.version : 'n/a', '| screenshots:', hit && hit.screenshots ? hit.screenshots.length : 0)
