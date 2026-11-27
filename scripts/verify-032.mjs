const url = 'https://registry.npmjs.org/@zhangxij/dsh-positions'
let latest = ''
for (let i = 1; i <= 12; i++) {
  const j = await (await fetch(url)).json()
  latest = j['dist-tags'].latest
  if (latest === '0.3.2') {
    const t = await fetch(j.versions['0.3.2'].dist.tarball)
    console.log('npm latest: 0.3.2 | tarball', t.status, t.ok ? (await t.arrayBuffer()).byteLength + ' bytes' : '')
    break
  }
  console.log('try', i, 'latest=', latest)
  await new Promise((s) => setTimeout(s, 25000))
}

const img = await fetch('https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/01-main.jpg')
console.log('unpkg 01-main:', img.status, (await img.arrayBuffer()).byteLength, 'bytes')

const gh = await (await fetch('https://api.github.com/repos/zhang-1239/dsh-positions/contents/docs/screenshots', { headers: { 'user-agent': 'check' } })).json()
console.log('GitHub screenshots:', gh.map((f) => f.name).join(', '))

const readme = await (await fetch('https://api.github.com/repos/zhang-1239/dsh-positions/contents/README.md', { headers: { 'user-agent': 'check' } })).json()
const text = Buffer.from(readme.content, 'base64').toString('utf8')
console.log('GitHub README 01-main:', text.includes('01-main.jpg'), '| 旧引用:', text.includes('01-overview.jpg'))
