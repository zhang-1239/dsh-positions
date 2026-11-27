const url = 'https://registry.npmjs.org/@zhangxij/dsh-positions'
for (let i = 1; i <= 12; i++) {
  const r = await fetch(url)
  const j = await r.json()
  const latest = j['dist-tags'] && j['dist-tags'].latest
  if (latest === '0.3.0') {
    const t = await fetch(j.versions['0.3.0'].dist.tarball)
    const size = t.ok ? (await t.arrayBuffer()).byteLength : 0
    console.log('latest=0.3.0 | tarball', t.status, size, 'bytes')
    if (t.ok) break
  } else {
    console.log('try', i, 'latest=', latest)
  }
  await new Promise((s) => setTimeout(s, 25000))
}
