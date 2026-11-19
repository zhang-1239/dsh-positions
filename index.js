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
  const side = raw.side === '卖出' ? '卖出' : raw.side === '买入' ? '买入' : null
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
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []
  }
}

function normalizeState(raw) {
  const state = isObject(raw) ? raw : {}
  const stocks = Array.isArray(state.stocks) ? state.stocks.map(normalizeStock).filter(Boolean) : []
  return {
    version: 1,
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
