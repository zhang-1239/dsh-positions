import { writeFileSync } from 'node:fs'

const reg = await (await fetch('https://registry.npmjs.org/@zhangxij/dsh-positions/0.3.0')).json()
console.log('npm 0.3.0 | repository:', reg.repository.url)
const tgz = Buffer.from(await (await fetch(reg.dist.tarball)).arrayBuffer())
writeFileSync('D:\\PositionsWorkbench\\pkg-030.tgz', tgz)
console.log('tarball bytes:', tgz.length)

const readme = await (await fetch('https://api.github.com/repos/zhang-1239/dsh-positions/contents/README.md', { headers: { 'user-agent': 'check' } })).json()
const text = Buffer.from(readme.content, 'base64').toString('utf8')
console.log('GitHub README bytes:', readme.size, '| 含「表头管理」:', text.includes('表头管理'), '| 含「查看归档持仓」:', text.includes('查看归档持仓'))

const pkg = await (await fetch('https://api.github.com/repos/zhang-1239/dsh-positions/contents/package.json', { headers: { 'user-agent': 'check' } })).json()
const pkgText = Buffer.from(pkg.content, 'base64').toString('utf8')
console.log('GitHub package.json version:', JSON.parse(pkgText).version)
