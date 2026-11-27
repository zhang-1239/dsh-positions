import { writeFileSync } from 'node:fs'

const r = await fetch('https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/contents/scripts/probe-npm.mjs', {
  headers: { 'user-agent': 'check', accept: 'application/vnd.github+json' }
})
const j = await r.json()
const text = Buffer.from(j.content, 'base64').toString('utf8')
writeFileSync('D:\\PositionsWorkbench\\probe-npm.mjs', text, 'utf8')
console.log('chars:', text.length)

const lines = text.split(/\r?\n/)
lines.forEach((line, i) => {
  if (/repository|npmjs|search|package\.json|registry|match|dist-tags/i.test(line)) {
    console.log(String(i + 1).padStart(4), line.trim().slice(0, 160))
  }
})
