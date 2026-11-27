import http from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert'
import { apply } from '../index.js'

const dir = mkdtempSync(join(tmpdir(), 'positions-test-'))
let registered = null
const ctx = {
  effect: (fn) => fn(),
  logger: { info: () => {}, warn: () => {} },
  webServer: { register: (route) => { registered = route } }
}

apply(ctx, { dataDir: dir })
assert.ok(registered, 'webServer.register 未被调用')
assert.strictEqual(registered.path, '/positions')
assert.strictEqual(registered.kind, 'prefix')

const server = http.createServer((req, res) => registered.handler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const get = async (path) => {
  const res = await fetch(base + path)
  return { status: res.status, body: await res.json() }
}
const post = async (path, body, headers = {}) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: JSON.stringify(body)
  })
  return { status: res.status, body: await res.json() }
}

try {
  // 1. 首次启动自举示例数据
  const first = await get('/positions/state')
  assert.strictEqual(first.status, 200)
  assert.ok(first.body.ok)
  assert.strictEqual(first.body.state.stocks.length, 5, '示例数据应有 5 只')
  assert.strictEqual(first.body.state.feeRate, 0.0003)
  assert.ok(existsSync(join(dir, 'state.json')), 'state.json 应已落盘')
  console.log('OK 首次启动自举：5 只示例，state.json 已写入')

  // 2. 记一笔（已有股票）
  const before = first.body.state.stocks.find((s) => s.name === '示例股票A').records.length
  const add = await post('/positions/action', {
    type: 'addTrade',
    payload: { name: '示例股票A', date: '2027-04-20', side: '买入', price: 10.5, qty: 200, feeOverride: 0.63 }
  })
  assert.strictEqual(add.status, 200)
  const after = add.body.state.stocks.find((s) => s.name === '示例股票A').records.length
  assert.strictEqual(after, before + 1)
  console.log('OK 记一笔：示例股票A 成交', before, '→', after)

  // 3. 新股票 + 分组 + 现价
  await post('/positions/action', { type: 'addTrade', payload: { name: '测试股票Z', date: '2027-04-20', side: '买入', price: 8, qty: 100 } })
  await post('/positions/action', { type: 'setGroup', payload: { name: '测试股票Z', group: '观察' } })
  const priced = await post('/positions/action', { type: 'setPrice', payload: { name: '测试股票Z', price: 9.2 } })
  const z = priced.body.state.stocks.find((s) => s.name === '测试股票Z')
  assert.strictEqual(z.group, '观察')
  assert.strictEqual(z.price, 9.2)
  console.log('OK 新股票/分组/现价：', z.name, z.group, z.price)

  // 4. 测算保存
  const saved = await post('/positions/action', {
    type: 'saveCalc',
    payload: { name: '示例股票A', rows: [{ side: '买入', price: 10.5, qty: 200 }, { side: '卖出', price: '', qty: '' }] }
  })
  assert.strictEqual(saved.body.state.calc['示例股票A'].length, 2)
  console.log('OK 测算保存：2 组')

  // 5. 筛选标签
  await post('/positions/action', { type: 'addTag', payload: { label: '自定义维度' } })
  const toggled = await post('/positions/action', { type: 'toggleTag', payload: { label: '自定义维度' } })
  assert.ok(toggled.body.state.activeTags.includes('自定义维度'))
  console.log('OK 标签：新增并激活')

  // 6. 落盘内容可读回
  const disk = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
  assert.ok(disk.stocks.some((s) => s.name === '测试股票Z'))
  assert.strictEqual(disk.calc['示例股票A'].length, 2)
  console.log('OK 落盘：磁盘上有', disk.stocks.length, '只股票')

  // 7. 错误处理
  const badAction = await post('/positions/action', { type: 'nope' })
  assert.strictEqual(badAction.status, 400)
  const badTrade = await post('/positions/action', { type: 'addTrade', payload: { name: 'X', date: 'bad', side: '买入', price: 1, qty: 1 } })
  assert.strictEqual(badTrade.status, 400)
  const badJson = await fetch(base + '/positions/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' })
  assert.strictEqual(badJson.status, 400)
  const crossSite = await post('/positions/action', { type: 'setFeeRate', payload: { feeRate: 0.001 } }, { origin: 'https://evil.example' })
  assert.strictEqual(crossSite.status, 403)
  const notFound = await get('/positions/nope')
  assert.strictEqual(notFound.status, 404)
  console.log('OK 错误处理：未知操作 400 / 非法成交 400 / 坏 JSON 400 / 跨站 403 / 404')

  // 8. 重启后数据还在
  const reloaded = await get('/positions/state')
  assert.ok(reloaded.body.state.stocks.some((s) => s.name === '测试股票Z'))
  console.log('OK 重新读取：数据仍在', reloaded.body.state.stocks.length, '只')

  // 9. 归档 / 恢复
  const archived = await post('/positions/action', { type: 'archiveStock', payload: { name: '示例股票E' } })
  assert.strictEqual(archived.status, 200)
  assert.strictEqual(archived.body.state.stocks.find((s) => s.name === '示例股票E').archived, true)
  const restored = await post('/positions/action', { type: 'unarchiveStock', payload: { name: '示例股票E' } })
  assert.strictEqual(restored.body.state.stocks.find((s) => s.name === '示例股票E').archived, false)
  console.log('OK 归档 / 恢复')

  // 10. 费率规则
  const feeState = await post('/positions/action', {
    type: 'saveFeeRule',
    payload: { rule: { id: 'test-broker', name: '测试券商', commissionRate: 0.0001, minCommission: 1, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: 'x', image: '' } }
  })
  assert.strictEqual(feeState.status, 200)
  assert.strictEqual(feeState.body.state.feeRules.length, 2)
  const activated = await post('/positions/action', { type: 'setActiveFeeRule', payload: { id: 'test-broker' } })
  assert.strictEqual(activated.body.state.activeFeeRule, 'test-broker')
  const removed = await post('/positions/action', { type: 'deleteFeeRule', payload: { id: 'test-broker' } })
  assert.strictEqual(removed.body.state.feeRules.length, 1)
  assert.strictEqual(removed.body.state.activeFeeRule, 'eastmoney')
  console.log('OK 费率规则：新增 / 切换 / 删除 / 至少保留一条')

  // 11. 分红记录
  const dividend = await post('/positions/action', {
    type: 'addTrade',
    payload: { name: '示例股票A', date: '2027-06-01', side: '分红', price: 0.25, qty: 1200 }
  })
  assert.strictEqual(dividend.status, 200)
  const lastRecord = dividend.body.state.stocks.find((s) => s.name === '示例股票A').records.slice(-1)[0]
  assert.strictEqual(lastRecord.side, '分红')
  console.log('OK 分红记录：每股 0.25 × 1200 股')

  console.log('\nALL PASS')
} finally {
  server.close()
  rmSync(dir, { recursive: true, force: true })
}
