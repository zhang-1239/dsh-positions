const base = 'http://127.0.0.1:59714'
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() } }
const act = async (type, payload) => {
  const r = await fetch(base + '/positions/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload })
  })
  return { status: r.status, body: await r.json() }
}

const s = await get('/positions/state')
console.log('columns:', s.body.state.columns.map((c) => c.label).join(','))
const set = await act('setNote', { name: '示例股票A', note: '测试备注：回踩 9.8 加仓' })
console.log('setNote:', set.status, '|', set.body.state.stocks.find((x) => x.name === '示例股票A').note)
const clear = await act('setNote', { name: '示例股票A', note: '' })
console.log('clear:', clear.status, '|', JSON.stringify(clear.body.state.stocks.find((x) => x.name === '示例股票A').note))
