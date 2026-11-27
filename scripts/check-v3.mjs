const base = 'http://127.0.0.1:50326'

async function get(path) {
  const r = await fetch(base + path)
  return { status: r.status, body: await r.json() }
}
async function act(type, payload) {
  const r = await fetch(base + '/positions/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, payload })
  })
  return { status: r.status, body: await r.json() }
}

const s0 = await get('/positions/state')
console.log('state:', s0.status, '| columns:', s0.body.state.columns.length, '| feeRules:', s0.body.state.feeRules.length)
console.log('内置列:', s0.body.state.columns.filter((c) => c.builtin).map((c) => c.label).join(','))

const add = await act('addColumn', { label: '股票代码' })
console.log('addColumn:', add.status, '| columns:', add.body.state.columns.map((c) => c.label).join(','))
const key = add.body.state.columns.find((c) => c.label === '股票代码').key

const set = await act('setField', { name: '示例股票A', key, value: '600000' })
console.log('setField:', set.status, '| value:', set.body.state.stocks.find((s) => s.name === '示例股票A').fields[key])

const move = await act('moveColumn', { key, dir: -1 })
console.log('moveColumn:', move.status, '| order:', move.body.state.columns.map((c) => c.label).join(','))

const del = await act('deleteColumn', { key })
console.log('deleteColumn:', del.status, '| columns:', del.body.state.columns.map((c) => c.label).join(','))

const builtinDel = await act('deleteColumn', { key: 'price' })
console.log('删除内置列应失败:', builtinDel.status, '|', builtinDel.body.error)
