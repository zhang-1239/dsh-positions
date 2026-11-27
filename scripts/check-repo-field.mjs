const packages = ['@anonyjcy/dsh-j-space', '@benrong/dsh-prompt-polish', '@zhangxij/dsh-positions']
for (const name of packages) {
  const r = await fetch('https://registry.npmjs.org/' + name.replace('/', '%2F'))
  const j = await r.json()
  const v = j['dist-tags'] && j['dist-tags'].latest
  const repo = j.versions && j.versions[v] ? j.versions[v].repository : null
  console.log(name, '|', v, '|', JSON.stringify(repo))
}
