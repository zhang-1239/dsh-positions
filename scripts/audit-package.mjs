import { writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const reg = await (await fetch('https://registry.npmjs.org/@zhangxij/dsh-positions')).json()
const latest = reg['dist-tags'].latest
const tarball = reg.versions[latest].dist.tarball
const buf = Buffer.from(await (await fetch(tarball)).arrayBuffer())
writeFileSync('D:\\PositionsWorkbench\\audit-latest.tgz', buf)
console.log('npm latest:', latest, '| tarball', buf.length, 'bytes')

const list = execFileSync('tar', ['-tzf', 'D:\\PositionsWorkbench\\audit-latest.tgz'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean)
console.log('文件数:', list.length)
console.log(list.join('\n'))

execFileSync('tar', ['-xzf', 'D:\\PositionsWorkbench\\audit-latest.tgz', '-C', 'D:\\PositionsWorkbench\\audit-latest'])
console.log('\n--- 文本文件里搜个人痕迹 ---')
const markers = ['C:\\\\Users\\\\lenovo', 'AppData', '三七互娱', '贵州茅台', '186', 'token', 'apiKey', 'secret']
const textFiles = ['package/client.js', 'package/index.js', 'package/seed.js', 'package/README.md', 'package/package.json', 'package/cordis.patch.yml']
for (const file of textFiles) {
  let text = ''
  try { text = readFileSync('D:\\PositionsWorkbench\\audit-latest\\' + file, 'utf8') } catch { continue }
  const hits = markers.filter((m) => text.includes(m))
  console.log(file, hits.length ? '命中: ' + hits.join(', ') : '干净')
}
