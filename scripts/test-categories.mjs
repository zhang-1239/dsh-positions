const base = 'http://127.0.0.1:62757'
const get = async (p) => (await fetch(base + p)).json()
const act = async (type, payload) => {
  const r = await fetch(base + '/positions/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload })
  })
  return await r.json()
}

const st = await get('/positions/state')
const rule = st.state.feeRules[0]
console.log('券商:', rule.name, '| 品种:', (rule.categories || []).map((c) => c.name + '(' + c.stampDutyRate + ')').join(', '))

const v = await act('setVariant', { name: '示例股票A', variant: 'cat-etf' })
console.log('setVariant:', v.ok, v.state.stocks.find((s) => s.name === '示例股票A').variant)

const saved = await act('saveFeeRule', {
  rule: {
    id: 'eastmoney', name: '东方财富（默认）',
    categories: [
      { id: 'cat-a', name: 'A股', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: '' },
      { id: 'cat-etf', name: 'ETF', commissionRate: 0.0002, minCommission: 1, stampDutyRate: 0, transferFeeRate: 0, otherFixed: 0, note: '' },
      { id: 'cat-b', name: 'B股', commissionRate: 0.0003, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0, otherFixed: 0, note: '' }
    ],
    note: 'x', image: ''
  }
})
console.log('saveFeeRule 品种数:', saved.state.feeRules[0].categories.length)

await act('saveFeeRule', {
  rule: { id: 'eastmoney', name: '东方财富（默认）', categories: [
    { id: 'cat-a', name: 'A股', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: '' },
    { id: 'cat-etf', name: 'ETF', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0, transferFeeRate: 0, otherFixed: 0, note: '' }
  ], note: '东方财富默认标准', image: '' }
})
await act('setVariant', { name: '示例股票A', variant: '' })
console.log('已恢复默认品种')
