/**
 * 持仓成本台 · 服务端
 *
 * 只做三件事：
 *   1. 把 state.json 读写到本机磁盘（自动持久化，重启还在）
 *   2. 提供 GET  /positions/state   读取全部数据
 *   3. 提供 POST /positions/action  修改数据并落盘
 *
 * 没有联网、没有行情、没有遥测。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import seed from './seed.js'

const ROUTE = '/positions'
const MAX_BODY_BYTES = 256 * 1024
const HERE = dirname(fileURLToPath(import.meta.url))

export const inject = ['webServer']

/* ------------------------------------------------------------------ 数据目录 */

function resolveDataDir(config) {
  const explicit = typeof config?.dataDir === 'string' ? config.dataDir.trim() : ''
  if (explicit) return resolve(explicit)

  const env = typeof process.env.DSH_POSITIONS_DATA === 'string' ? process.env.DSH_POSITIONS_DATA.trim() : ''
  if (env) return resolve(env)

  // 仓库内 data/ 只给开发时用；装进 node_modules 后绝不写那里
  const repoData = join(HERE, 'data')
  if (!HERE.includes('node_modules') && existsSync(join(repoData, 'state.json'))) return repoData

  const base = process.env.LOCALAPPDATA || join(homedir(), '.local', 'share')
  return join(base, 'dsh-positions')
}

/* -------------------------------------------------------------------- 规范化 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback)
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

function normalizeRecord(raw) {
  if (!isObject(raw)) return null
  const date = str(raw.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const side = raw.side === '卖出' ? '卖出' : raw.side === '买入' ? '买入' : raw.side === '分红' ? '分红' : null
  const price = num(raw.price)
  const qty = num(raw.qty)
  if (!side || price <= 0 || qty <= 0) return null
  const record = { date, side, price, qty }
  if (raw.feeOverride !== undefined && raw.feeOverride !== null && raw.feeOverride !== '') {
    const fee = num(raw.feeOverride, NaN)
    if (Number.isFinite(fee) && fee >= 0) record.feeOverride = fee
  }
  return record
}

function normalizeStock(raw) {
  if (!isObject(raw) || !str(raw.name).trim()) return null
  return {
    name: str(raw.name).trim(),
    group: str(raw.group).trim(),
    price: Math.max(0, num(raw.price)),
    dayPnl: num(raw.dayPnl),
    archived: raw.archived === true,
    fields: isObject(raw.fields)
      ? Object.keys(raw.fields).reduce((acc, k) => { acc[k] = str(raw.fields[k]).slice(0, 200); return acc }, {})
      : {},
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []
  }
}

const DEFAULT_COLUMNS = [
  { key: 'stock', label: '股票', builtin: true },
  { key: 'date', label: '日期', builtin: true },
  { key: 'side', label: '方向', builtin: true },
  { key: 'price', label: '价格', builtin: true },
  { key: 'qty', label: '数量', builtin: true },
  { key: 'fee', label: '费用', builtin: true },
  { key: 'net', label: '当次含费用投入', builtin: true },
  { key: 'cumQty', label: '累计数量', builtin: true },
  { key: 'cumInvest', label: '累计投入', builtin: true },
  { key: 'cost', label: '累计成本', builtin: true }
]

function normalizeColumn(raw) {
  if (!isObject(raw)) return null
  const key = str(raw.key).trim()
  const label = str(raw.label).trim()
  if (!key || !label) return null
  return { key, label: label.slice(0, 20), builtin: raw.builtin === true }
}

function clampRate(value, fallback) {
  const n = num(value, fallback)
  return n >= 0 && n <= 0.05 ? n : fallback
}

function normalizeRule(raw) {
  if (!isObject(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null
  return {
    id: str(raw.id).trim() || 'rule-' + name,
    name,
    commissionRate: clampRate(raw.commissionRate, 0.00025),
    minCommission: Math.max(0, num(raw.minCommission, 5)),
    stampDutyRate: clampRate(raw.stampDutyRate, 0.0005),
    transferFeeRate: clampRate(raw.transferFeeRate, 0.00001),
    otherFixed: Math.max(0, num(raw.otherFixed, 0)),
    note: str(raw.note).slice(0, 200),
    image: str(raw.image).slice(0, 400000)
  }
}

function normalizeState(raw) {
  const state = isObject(raw) ? raw : {}
  const stocks = Array.isArray(state.stocks) ? state.stocks.map(normalizeStock).filter(Boolean) : []
  let rules = Array.isArray(state.feeRules) ? state.feeRules.map(normalizeRule).filter(Boolean) : []
  if (rules.length === 0) rules = seed.feeRules.map(normalizeRule).filter(Boolean)
  const activeFeeRule = rules.some((r) => r.id === state.activeFeeRule) ? state.activeFeeRule : rules[0].id
  let columns = Array.isArray(state.columns) ? state.columns.map(normalizeColumn).filter(Boolean) : []
  if (columns.length === 0) columns = DEFAULT_COLUMNS.map((c) => Object.assign({}, c))
  return {
    version: 1,
    columns,
    feeRules: rules,
    activeFeeRule,
    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,
    tags: Array.isArray(state.tags) ? state.tags.map((t) => str(t).trim()).filter(Boolean) : seed.tags.slice(),
    activeTags: Array.isArray(state.activeTags) ? state.activeTags.map((t) => str(t).trim()).filter(Boolean) : [],
    calc: isObject(state.calc) ? state.calc : {},
    stocks
  }
}

/* -------------------------------------------------------------------- 动作 */

function findStock(state, name) {
  return state.stocks.find((s) => s.name === name) || null
}

const actions = {
  addTrade(state, payload) {
    const name = str(payload?.name).trim()
    const record = normalizeRecord(payload)
    if (!name) throw bad('缺少股票名称')
    if (!record) throw bad('成交记录不完整（日期/方向/价格/数量）')
    let stock = findStock(state, name)
    if (!stock) {
      stock = { name, group: str(payload?.group).trim(), price: 0, dayPnl: 0, records: [] }
      state.stocks.push(stock)
    }
    stock.records.push(record)
    if (payload?.price !== undefined && !stock.price) stock.price = record.price
    return state
  },

  addColumn(state, payload) {
    const label = str(payload?.label).trim()
    if (!label) throw bad('列名不能为空')
    if (state.columns.filter((c) => !c.builtin).length >= 10) throw bad('自定义列最多 10 个')
    state.columns.push({ key: 'c' + Date.now(), label: label.slice(0, 20), builtin: false })
    return state
  },

  deleteColumn(state, payload) {
    const key = str(payload?.key).trim()
    const column = state.columns.find((c) => c.key === key)
    if (!column) throw bad('找不到这列')
    if (column.builtin) throw bad('内置列不能删除')
    state.columns = state.columns.filter((c) => c.key !== key)
    state.stocks.forEach((s) => { if (s.fields) delete s.fields[key] })
    return state
  },

  moveColumn(state, payload) {
    const key = str(payload?.key).trim()
    const dir = num(payload?.dir, 0) > 0 ? 1 : -1
    const index = state.columns.findIndex((c) => c.key === key)
    const next = index + dir
    if (index < 0 || next < 0 || next >= state.columns.length) return state
    const list = state.columns.slice()
    const tmp = list[index]
    list[index] = list[next]
    list[next] = tmp
    state.columns = list
    return state
  },

  setField(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    const key = str(payload?.key).trim()
    if (!stock) throw bad('找不到这只股票')
    if (!state.columns.some((c) => c.key === key && !c.builtin)) throw bad('找不到这列')
    stock.fields = stock.fields || {}
    stock.fields[key] = str(payload?.value).slice(0, 200)
    return state
  },

  archiveStock(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.archived = true
    return state
  },

  unarchiveStock(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.archived = false
    return state
  },

  saveFeeRule(state, payload) {
    const rule = normalizeRule(payload?.rule)
    if (!rule) throw bad('费率规则不完整')
    const index = state.feeRules.findIndex((r) => r.id === rule.id)
    if (index >= 0) state.feeRules[index] = rule
    else state.feeRules.push(rule)
    if (!state.feeRules.some((r) => r.id === state.activeFeeRule)) state.activeFeeRule = rule.id
    return state
  },

  deleteFeeRule(state, payload) {
    const id = str(payload?.id).trim()
    if (state.feeRules.length <= 1) throw bad('至少保留一条费率规则')
    state.feeRules = state.feeRules.filter((r) => r.id !== id)
    if (!state.feeRules.some((r) => r.id === state.activeFeeRule)) state.activeFeeRule = state.feeRules[0].id
    return state
  },

  setActiveFeeRule(state, payload) {
    const id = str(payload?.id).trim()
    if (!state.feeRules.some((r) => r.id === id)) throw bad('找不到这条费率规则')
    state.activeFeeRule = id
    return state
  },

  deleteStock(state, payload) {
    const name = str(payload?.name).trim()
    state.stocks = state.stocks.filter((s) => s.name !== name)
    delete state.calc[name]
    return state
  },

  deleteRecord(state, payload) {
    const name = str(payload?.name).trim()
    const stock = findStock(state, name)
    if (!stock) throw bad('找不到这只股票')

    let index = num(payload?.index, -1)
    const match = payload?.match
    if (isObject(match)) {
      index = stock.records.findIndex(
        (r) =>
          r.date === match.date &&
          r.side === match.side &&
          Number(r.price) === Number(match.price) &&
          Number(r.qty) === Number(match.qty)
      )
    }
    if (index < 0 || index >= stock.records.length) throw bad('找不到这条成交')
    stock.records.splice(index, 1)
    return state
  },

  setGroup(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.group = str(payload?.group).trim()
    return state
  },

  setPrice(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    const price = num(payload?.price)
    if (price < 0) throw bad('价格不能为负')
    stock.price = price
    return state
  },

  setDayPnl(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.dayPnl = num(payload?.dayPnl)
    return state
  },

  setFeeRate(state, payload) {
    const rate = num(payload?.feeRate)
    if (!(rate >= 0 && rate <= 0.01)) throw bad('费率应在 0 ~ 0.01 之间')
    state.feeRate = rate
    return state
  },

  addTag(state, payload) {
    const label = str(payload?.label).trim()
    if (!label) throw bad('标签不能为空')
    if (!state.tags.includes(label)) state.tags.push(label)
    return state
  },

  removeTag(state, payload) {
    const label = str(payload?.label).trim()
    state.tags = state.tags.filter((t) => t !== label)
    state.activeTags = state.activeTags.filter((t) => t !== label)
    return state
  },

  toggleTag(state, payload) {
    const label = str(payload?.label).trim()
    if (!state.tags.includes(label)) return state
    state.activeTags = state.activeTags.includes(label)
      ? state.activeTags.filter((t) => t !== label)
      : state.activeTags.concat(label)
    return state
  },

  saveCalc(state, payload) {
    const name = str(payload?.name).trim()
    if (!name) throw bad('缺少股票名称')
    const rows = Array.isArray(payload?.rows) ? payload.rows : []
    state.calc[name] = rows.slice(0, 20).map((row) => ({
      side: row?.side === '卖出' ? '卖出' : '买入',
      price: row?.price === '' || row?.price === undefined ? '' : num(row.price),
      qty: row?.qty === '' || row?.qty === undefined ? '' : num(row.qty),
      saved: row?.saved === true
    }))
    return state
  }
}

function bad(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

/* -------------------------------------------------------------------- HTTP */

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  })
  res.end(body)
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function readJson(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('请求体过大')
        error.status = 413
        rejectPromise(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        const error = new Error('请求体不是合法 JSON')
        error.status = 400
        rejectPromise(error)
      }
    })
    req.on('error', rejectPromise)
  })
}

export function apply(ctx, config) {
  const dataDir = resolveDataDir(config)
  const stateFile = join(dataDir, 'state.json')
  mkdirSync(dataDir, { recursive: true })

  function load() {
    try {
      return normalizeState(JSON.parse(readFileSync(stateFile, 'utf8')))
    } catch {
      const initial = normalizeState(seed)
      persist(initial)
      return initial
    }
  }

  function persist(state) {
    const tmp = stateFile + '.tmp'
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, stateFile)
  }

  let state = load()

  async function handler(req, res) {
    if (!sameOrigin(req)) {
      send(res, 403, { ok: false, error: '跨站请求被拒绝' })
      return
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const suffix = url.pathname.slice(ROUTE.length) || '/'

    try {
      if (req.method === 'GET' && (suffix === '/state' || suffix === '/')) {
        send(res, 200, { ok: true, dataDir, state })
        return
      }

      if (req.method === 'POST' && suffix === '/action') {
        const body = await readJson(req)
        const type = str(body?.type)
        const action = actions[type]
        if (!action) {
          send(res, 400, { ok: false, error: '未知操作：' + type })
          return
        }
        state = action(state, isObject(body.payload) ? body.payload : {})
        persist(state)
        send(res, 200, { ok: true, state })
        return
      }

      send(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 500
      if (status >= 500) ctx.logger?.warn?.('positions: ' + (error?.message ?? String(error)))
      send(res, status, { ok: false, error: error?.message ?? 'internal error' })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }))
  ctx.logger?.info?.(`positions: data dir ${dataDir}`)
}
