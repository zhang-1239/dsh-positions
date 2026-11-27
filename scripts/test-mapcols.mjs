const base = 'http://127.0.0.1:59969'
const act = async (type, payload) => {
  const r = await fetch(base + '/positions/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload })
  })
  return await r.json()
}

await act('setVision', { enabled: true })
const r = await fetch(base + '/positions/map-columns', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    header: ['成交日期', '买卖标志', '成交价', '成交数量', '手续费', '证券名称'],
    sample: [['2026-11-20', '买入', '9.50', '500', '1.2', '三七互娱']]
  })
})
console.log('map-columns:', r.status, JSON.stringify(await r.json()).slice(0, 300))
await act('setVision', { enabled: false })
