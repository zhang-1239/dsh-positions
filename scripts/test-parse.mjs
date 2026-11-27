import { readFileSync } from 'node:fs'

const src = readFileSync('D:/PositionsWorkbench/plugin/client.js', 'utf8')

function slice(startMarker, endMarker) {
  const i = src.indexOf(startMarker)
  const j = src.indexOf(endMarker, i)
  if (i < 0 || j < 0) throw new Error('slice failed: ' + startMarker)
  return src.slice(i, j)
}

const code = [
  slice('function normSide', 'const COLUMN_ALIASES'),
  slice('const COLUMN_ALIASES', 'function parseImport'),
  'function today() { return "2027-01-01" }'
].join('\n')

const fn = new Function(code + '\nreturn { parseTable, buildRecords, normalizeDate, normSide };')
const api = fn()

const csv = [
  '方向,时间,数量,单价,费用',
  '(隐藏)',
  '(-),股票',
  '买,45896,2500,20.23,11.91,三七互娱',
  '卖,45897,600,20.23,5,贵州茅台'
].join('\n')

const table = api.parseTable(csv)
console.log('header:', JSON.stringify(table.header))
console.log('mapping:', JSON.stringify(table.mapping))
const rows = api.buildRecords(table, table.mapping)
console.log('rows:', JSON.stringify(rows, null, 0))

// 正常表头乱序
const csv2 = '股票名称,数量,日期,价格,方向\n宁德时代,300,2027-02-18,21.5,买'
const t2 = api.parseTable(csv2)
console.log('mapping2:', JSON.stringify(t2.mapping), 'rows2:', JSON.stringify(api.buildRecords(t2, t2.mapping)))

// 无表头
const t3 = api.parseTable('2027-03-01,买入,10.5,200')
console.log('headerless mapping:', JSON.stringify(t3.mapping), JSON.stringify(api.buildRecords(t3, t3.mapping)))
