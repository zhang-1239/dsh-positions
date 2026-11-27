import { writeFileSync } from 'node:fs'

const r = await fetch('https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/contents/contributing.md', {
  headers: { 'user-agent': 'check', accept: 'application/vnd.github+json' }
})
const j = await r.json()
const text = Buffer.from(j.content, 'base64').toString('utf8')
writeFileSync('D:\\PositionsWorkbench\\plugins-contributing.md', text, 'utf8')
console.log('chars:', text.length)

const lines = text.split(/\r?\n/)
const keys = ['npm', 'repository', 'match', 'version']
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (/^npm:|`npm`|repository|match/i.test(line) || /npm\s*:/.test(line)) {
    console.log('--- line', i + 1, '---')
    console.log(lines.slice(Math.max(0, i - 2), i + 3).join('\n'))
  }
}
