const base = 'http://127.0.0.1:56217'
const get = async (p) => (await fetch(base + p)).json()
const act = async (type, payload) => {
  const r = await fetch(base + '/positions/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload })
  })
  return { status: r.status, body: await r.json() }
}

const before = await get('/positions/state')
console.log('charts before:', JSON.stringify(before.state.charts))

const save = await act('setChart', { name: '示例股票A', chart: { primary: 'cumInvest', compare: 'imported', type: 'area' } })
console.log('setChart:', save.status, JSON.stringify(save.body.state.charts['示例股票A']))

const bad = await act('setChart', { name: '示例股票A', chart: { primary: 'hack', compare: 'evil', type: 'pie' } })
console.log('非法值被规范化:', JSON.stringify(bad.body.state.charts['示例股票A']))

const reset = await act('setChart', { name: '示例股票A', chart: { primary: 'cost', compare: 'none', type: 'line' } })
console.log('reset:', JSON.stringify(reset.body.state.charts['示例股票A']))
