import { readFileSync } from 'node:fs'

const b64 = readFileSync('D:/PositionsWorkbench/plugin-design/test-import.xlsx').toString('base64')
const r = await fetch('http://127.0.0.1:59714/positions/parse-xlsx', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: b64 })
})
console.log('parse-xlsx:', r.status, JSON.stringify(await r.json()))

const r2 = await fetch('http://127.0.0.1:59714/positions/recognize', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ image: 'data:image/png;base64,AAA' })
})
console.log('recognize(未配置):', r2.status, JSON.stringify(await r2.json()))
