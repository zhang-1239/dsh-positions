const base = 'http://127.0.0.1:62757'

const exp = await (await fetch(base + '/positions/export-json')).json()
const payload = exp.payload
console.log('导出: version', payload.version, '| stocks', payload.holdings.stocks.length,
  '| feeRules', payload.feeRules.list.length, '| notes', Object.keys(payload.notes).length,
  '| categories', payload.feeRules.list[0].categories.map((c) => c.label).join('/'))

const sample = payload.holdings.stocks[0]
console.log('样例:', sample.name, '| side', sample.records[0].side, '| marketValue', sample.marketValue,
  '| variant', sample.variant, '| fields keys', Object.keys(sample.fields || {}).length)

const before = await (await fetch(base + '/positions/state')).json()
const imp = await (await fetch(base + '/positions/import-json', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: payload })
})).json()
console.log('导入(小程序格式):', imp.ok, '| stocks', imp.state.stocks.length,
  '| 第一条 side', imp.state.stocks[0].records[0].side,
  '| note 保留', imp.state.stocks.some((s) => s.note))

const after = await (await fetch(base + '/positions/state')).json()
console.log('导入前后股票数:', before.state.stocks.length, '->', after.state.stocks.length,
  '| calc keys:', Object.keys(after.state.calc).length,
  '| columns:', after.state.columns.length)
