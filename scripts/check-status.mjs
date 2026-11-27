const g = async (u) => {
  const r = await fetch(u, { headers: { 'user-agent': 'check' } })
  return { s: r.status, j: await r.json().catch(() => null) }
}

const up = await g('https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/contents/data/plugins/zhang-1239__dsh-positions.yml')
console.log('上游条目:', up.s, up.j && up.j.size ? up.j.size + ' bytes' : '')

const pr = await g('https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls/16835')
console.log('PR:', pr.j.state, '| merged:', pr.j.merged, '| merged_at:', pr.j.merged_at)

try {
  const r = await fetch('https://awesome-dsh-plugin.com/plugins.json', { headers: { 'user-agent': 'check' } })
  const txt = await r.text()
  console.log('plugins.json:', r.status, txt.length, 'bytes')
  console.log('含 dsh-positions:', txt.includes('dsh-positions'))
  const m = txt.match(/"updated"\s*:\s*"([^"]+)"/)
  console.log('目录 updated:', m ? m[1] : 'n/a')
} catch (e) {
  console.log('plugins.json ERR', e.message)
}
