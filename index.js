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
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import seed from './seed.js'

const ROUTE = '/positions'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const HERE = dirname(fileURLToPath(import.meta.url))

export const inject = ['webServer', 'llm', 'agentDefaultModel']

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
    note: str(raw.note).slice(0, 500),
    variant: str(raw.variant).slice(0, 40),
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

function normalizeCategory(raw, fallbackName) {
  if (!isObject(raw)) return null
  const name = str(raw.name).trim() || fallbackName
  if (!name) return null
  return {
    id: str(raw.id).trim() || 'cat-' + name,
    name: name.slice(0, 20),
    commissionRate: clampRate(raw.commissionRate, 0.00025),
    minCommission: Math.max(0, num(raw.minCommission, 5)),
    stampDutyRate: clampRate(raw.stampDutyRate, 0.0005),
    transferFeeRate: clampRate(raw.transferFeeRate, 0.00001),
    otherFixed: Math.max(0, num(raw.otherFixed, 0)),
    note: str(raw.note).slice(0, 200)
  }
}

function normalizeRule(raw) {
  if (!isObject(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null
  let categories = Array.isArray(raw.categories) ? raw.categories.map((c) => normalizeCategory(c, '品种')).filter(Boolean) : []
  if (categories.length === 0) {
    categories = [
      normalizeCategory({
        name: 'A股',
        commissionRate: raw.commissionRate,
        minCommission: raw.minCommission,
        stampDutyRate: raw.stampDutyRate,
        transferFeeRate: raw.transferFeeRate,
        otherFixed: raw.otherFixed
      }, 'A股'),
      normalizeCategory({
        id: 'cat-etf',
        name: 'ETF',
        commissionRate: raw.commissionRate === undefined ? 0.00025 : raw.commissionRate,
        minCommission: raw.minCommission === undefined ? 5 : raw.minCommission,
        stampDutyRate: 0,
        transferFeeRate: 0,
        otherFixed: 0
      }, 'ETF')
    ]
  }
  const unique = []
  const seen = new Set()
  for (const category of categories) {
    if (seen.has(category.id)) continue
    seen.add(category.id)
    unique.push(category)
  }
  return {
    id: str(raw.id).trim() || 'rule-' + name,
    name,
    categories: unique,
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
  if (!columns.some((c) => c.key === 'note')) {
    const costIndex = columns.findIndex((c) => c.key === 'cost')
    const noteColumn = { key: 'note', label: '备注', builtin: true }
    if (costIndex >= 0) columns.splice(costIndex + 1, 0, noteColumn)
    else columns.push(noteColumn)
  }
  const charts = {}
  if (isObject(state.charts)) {
    for (const key of Object.keys(state.charts)) {
      const value = state.charts[key]
      if (!isObject(value)) continue
      charts[str(key).slice(0, 40)] = {
        primary: ['cost', 'cumInvest', 'cumQty', 'net'].includes(value.primary) ? value.primary : 'cost',
        compare: ['none', 'cost', 'cumInvest', 'cumQty', 'net', 'imported'].includes(value.compare) ? value.compare : 'none',
        type: ['line', 'bar', 'area'].includes(value.type) ? value.type : 'line'
      }
    }
  }
  return {
    version: 1,
    charts,
    columns,
    feeRules: rules,
    activeFeeRule,
    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,
    vision: {
      enabled: state.vision?.enabled === true,
      baseUrl: str(state.vision?.baseUrl).slice(0, 300),
      apiKey: str(state.vision?.apiKey).slice(0, 300),
      model: str(state.vision?.model).slice(0, 100)
    },
    tags: Array.isArray(state.tags) ? state.tags.map((t) => str(t).trim()).filter(Boolean) : seed.tags.slice(),
    activeTags: Array.isArray(state.activeTags) ? state.activeTags.map((t) => str(t).trim()).filter(Boolean) : [],
    calc: isObject(state.calc) ? state.calc : {},
    stocks
  }
}

/* ------------------------------------------------------------------ xlsx */

function unzipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw bad('不是有效的 xlsx 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const files = {}
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const csize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + csize)
    files[name] = method === 0 ? raw : inflateRawSync(raw)
    off += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function xmlText(xml) {
  return String(xml)
    .replace(/<\/?t[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

function colIndex(ref) {
  const letters = (String(ref).match(/^[A-Z]+/) || ['A'])[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseXlsx(buf) {
  const files = unzipEntries(buf)
  const sheetName = Object.keys(files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) || Object.keys(files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n))
  if (!sheetName) throw bad('xlsx 里找不到工作表')
  const sharedXml = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : ''
  const shared = []
  for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(xmlText(m[1]))

  const sheetXml = files[sheetName].toString('utf8')
  const lines = []
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const c of rowMatch[1].matchAll(/<c\s+([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const body = c[3] || ''
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || ''
      const ref = (attrs.match(/\br="([^"]+)"/) || [])[1] || ''
      const rawValue = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
      let value = ''
      if (type === 's') value = shared[Number(rawValue)] ?? ''
      else if (type === 'inlineStr') value = xmlText((body.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || '')
      else if (rawValue !== undefined) value = xmlText(rawValue)
      const index = ref ? colIndex(ref) : cells.length
      cells[index] = String(value).trim()
    }
    const line = cells.map((v) => v ?? '').join(',').replace(/,+$/, '')
    if (line.trim()) lines.push(line)
  }
  return lines
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

  setVision(state, payload) {
    state.vision = {
      enabled: payload?.enabled === true,
      baseUrl: str(payload?.baseUrl).slice(0, 300),
      apiKey: str(payload?.apiKey).slice(0, 300),
      model: str(payload?.model).slice(0, 100)
    }
    return state
  },

  setChart(state, payload) {
    const name = str(payload?.name).trim()
    if (!name) throw bad('缺少股票名称')
    const chart = isObject(payload?.chart) ? payload.chart : {}
    state.charts[name] = {
      primary: ['cost', 'cumInvest', 'cumQty', 'net'].includes(chart.primary) ? chart.primary : 'cost',
      compare: ['none', 'cost', 'cumInvest', 'cumQty', 'net', 'imported'].includes(chart.compare) ? chart.compare : 'none',
      type: ['line', 'bar', 'area'].includes(chart.type) ? chart.type : 'line'
    }
    return state
  },

  setNote(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.note = str(payload?.note).slice(0, 500)
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

  setVariant(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.variant = str(payload?.variant).slice(0, 40)
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

async function askHarnessText(ctx, prompt) {
  const llm = ctx.llm
  if (!llm || typeof llm.stream !== 'function') return { ok: false, error: '当前 Harness 没有可用的模型服务' }
  const sel = ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function'
    ? ctx.agentDefaultModel.currentSelection()
    : null
  if (!sel || !sel.provider || !sel.model) return { ok: false, error: '当前会话没有默认模型' }
  const result = await llm.stream({
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-positions',
    temperature: 0,
    messages: [{
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: prompt }]
    }]
  })
  let text = ''
  if (typeof result === 'string') text = result
  else if (result && typeof result.text === 'string') text = result.text
  else if (result && typeof result[Symbol.asyncIterator] === 'function') {
    for await (const chunk of result) {
      if (typeof chunk === 'string') text += chunk
      else if (chunk && typeof chunk.text === 'string') text += chunk.text
      else if (chunk && typeof chunk.delta === 'string') text += chunk.delta
    }
  } else if (result && result.content) {
    const parts = Array.isArray(result.content) ? result.content : [result.content]
    text = parts.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
  }
  return { ok: true, text }
}

async function recognizeViaHarness(ctx, dataUrl, prompt) {
  const llm = ctx.llm
  if (!llm || typeof llm.stream !== 'function') return { ok: false, error: '当前 Harness 没有可用的模型服务' }
  const sel = ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function'
    ? ctx.agentDefaultModel.currentSelection()
    : null
  if (!sel || !sel.provider || !sel.model) return { ok: false, error: '当前会话没有默认模型' }
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (!m) return { ok: false, error: '图片格式不对' }
  const messages = [{
    role: 'user',
    source: { kind: 'user' },
    content: [
      { type: 'text', text: prompt },
      { type: 'image', attachment: { mediaType: m[1], data: m[2] } }
    ]
  }]
  const result = await llm.stream({
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-positions',
    temperature: 0,
    messages
  })
  let text = ''
  if (typeof result === 'string') text = result
  else if (result && typeof result.text === 'string') text = result.text
  else if (result && typeof result[Symbol.asyncIterator] === 'function') {
    const seen = []
    for await (const chunk of result) {
      if (typeof chunk === 'string') text += chunk
      else if (chunk) {
        if (typeof chunk.text === 'string') text += chunk.text
        else if (typeof chunk.delta === 'string' && String(chunk.type || '').includes('text')) text += chunk.delta
        if (seen.length < 8) seen.push(String(chunk.type || (chunk.constructor && chunk.constructor.name) || '?'))
      }
    }
    if (!text) text = 'DEBUG_CHUNKS:' + seen.join(',')
  } else if (result && result.content) {
    const parts = Array.isArray(result.content) ? result.content : [result.content]
    text = parts.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
  }
  return { ok: true, text }
}

const SIDE_TO_MINI = { '买入': '转入', '卖出': '转出', '分红': '收益' }
const SIDE_FROM_MINI = { '转入': '买入', '转出': '卖出', '收益': '分红' }

function lastQty(records) {
  let n = 0
  for (const r of records) {
    if (r.side === '买入' || r.side === '转入') n += Number(r.qty)
    else if (r.side === '卖出' || r.side === '转出') n -= Number(r.qty)
  }
  return n
}

function toMiniPayload(state) {
  const sids = new Map()
  const stocks = state.stocks.map((s, i) => {
    const sid = s.sid || 's' + (i + 1)
    sids.set(s.name, sid)
    const records = (s.records || []).map((r) => {
      const out = { date: r.date, side: SIDE_TO_MINI[r.side] || r.side, price: Number(r.price), qty: Number(r.qty) }
      if (r.feeOverride !== undefined && r.feeOverride !== null) out.fee = Number(r.feeOverride)
      return out
    })
    const qty = lastQty(records)
    return {
      name: s.name,
      sid,
      group: s.group || '',
      marketValue: Number(((Number(s.price) || 0) * qty).toFixed(2)),
      dayPnl: Number(s.dayPnl) || 0,
      variant: s.variant || '',
      fields: s.fields && typeof s.fields === 'object' ? s.fields : {},
      records
    }
  })
  const notes = {}
  const archived = {}
  const calc = {}
  state.stocks.forEach((s) => {
    const sid = sids.get(s.name)
    if (s.note) notes[sid] = s.note
    if (s.archived) archived[sid] = true
    if (state.calc && state.calc[s.name]) calc[sid] = state.calc[s.name]
  })
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    holdings: {
      meta: { version: 1, updatedAt: new Date().toISOString().slice(0, 10), note: '持仓成本台导出' },
      feeRate: state.feeRate,
      stocks
    },
    theory: [],
    calc,
    notes,
    archived,
    feeRules: {
      list: (state.feeRules || []).map((r) => ({
        id: r.id,
        name: r.name,
        categories: (r.categories || []).map((c) => ({
          key: c.id,
          label: c.name,
          commissionRate: c.commissionRate,
          minCommission: c.minCommission,
          stampDutyRate: c.stampDutyRate,
          transferFeeRate: c.transferFeeRate,
          otherFixed: c.otherFixed
        }))
      })),
      activeId: state.activeFeeRule
    },
    columns: (state.columns || []).filter((c) => !c.builtin).map((c) => ({ key: c.key, label: c.label })),
    groups: Array.from(new Set(state.stocks.map((s) => s.group).filter(Boolean)))
  }
}

function fromMiniPayload(payload) {
  const stocks = payload.holdings.stocks.map((s, i) => {
    const records = (s.records || []).map((r) => {
      const out = {
        date: r.date,
        side: SIDE_FROM_MINI[r.side] || r.side,
        price: Number(r.price),
        qty: Number(r.qty)
      }
      if (r.fee !== undefined) out.feeOverride = Number(r.fee)
      return out
    })
    const qty = lastQty(records)
    const price = qty > 0 ? Number(s.marketValue || 0) / qty : 0
    const sid = s.sid || 's' + (i + 1)
    return {
      raw: {
        name: s.name,
        group: s.group || '',
        price,
        dayPnl: Number(s.dayPnl) || 0,
        archived: !!(payload.archived && payload.archived[sid]),
        note: (payload.notes && payload.notes[sid]) || '',
        variant: s.variant || '',
        fields: s.fields && typeof s.fields === 'object' ? s.fields : {},
        records
      },
      sid
    }
  })
  const calc = {}
  for (const item of stocks) {
    if (payload.calc && payload.calc[item.sid]) calc[item.raw.name] = payload.calc[item.sid]
  }
  const feeRules = payload.feeRules && Array.isArray(payload.feeRules.list)
    ? payload.feeRules.list.map((r) => ({
        id: r.id,
        name: r.name,
        categories: (r.categories || []).map((c) => ({
          id: c.key || c.id,
          name: c.label || c.name,
          commissionRate: c.commissionRate,
          minCommission: c.minCommission,
          stampDutyRate: c.stampDutyRate,
          transferFeeRate: c.transferFeeRate,
          otherFixed: c.otherFixed
        }))
      }))
    : null
  const customColumns = Array.isArray(payload.columns)
    ? payload.columns.map((c) => ({ key: c.key, label: c.label, builtin: false }))
    : []
  return {
    stocks: stocks.map((item) => item.raw),
    feeRules,
    activeFeeRule: payload.feeRules ? payload.feeRules.activeId : undefined,
    customColumns,
    calc
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

      if (req.method === 'GET' && suffix === '/export-json') {
        send(res, 200, { ok: true, payload: toMiniPayload(state) })
        return
      }

      if (req.method === 'POST' && suffix === '/import-json') {
        const body = await readJson(req)
        const payload = body && body.data
        if (!isObject(payload)) { send(res, 400, { ok: false, error: '内容不是合法 JSON 对象' }); return }

        let converted
        if (isObject(payload.holdings) && Array.isArray(payload.holdings.stocks)) {
          converted = fromMiniPayload(payload)
        } else if (Array.isArray(payload.stocks)) {
          const normalized = normalizeState(Object.assign({}, state, payload))
          converted = {
            stocks: normalized.stocks,
            feeRules: normalized.feeRules,
            activeFeeRule: normalized.activeFeeRule,
            customColumns: normalized.columns.filter((c) => !c.builtin),
            calc: normalized.calc
          }
        } else {
          send(res, 400, { ok: false, error: '认不出这个 JSON：既不是小程序导出，也不是插件备份' })
          return
        }

        try {
          writeFileSync(stateFile + '.backup-' + Date.now() + '.json', JSON.stringify(state, null, 2), 'utf8')
        } catch { /* 备份失败不阻塞 */ }

        const next = normalizeState({
          feeRate: state.feeRate,
          tags: state.tags,
          activeTags: state.activeTags,
          charts: state.charts,
          vision: state.vision,
          columns: state.columns.filter((c) => c.builtin).concat(converted.customColumns || []),
          feeRules: converted.feeRules || state.feeRules,
          activeFeeRule: converted.activeFeeRule,
          calc: converted.calc || {},
          stocks: converted.stocks
        })
        state = next
        persist(state)
        send(res, 200, { ok: true, state })
        return
      }

      if (req.method === 'POST' && suffix === '/parse-xlsx') {
        const body = await readJson(req)
        const data = str(body?.data)
        if (!data) { send(res, 400, { ok: false, error: '缺少文件内容' }); return }
        const buf = Buffer.from(data, 'base64')
        if (buf.length > 8 * 1024 * 1024) { send(res, 413, { ok: false, error: '文件过大（上限 8MB）' }); return }
        const lines = parseXlsx(buf)
        send(res, 200, { ok: true, lines })
        return
      }

      if (req.method === 'POST' && suffix === '/recognize') {
        const body = await readJson(req)
        const vision = state.vision || {}
        if (vision.enabled !== true) {
          send(res, 400, { ok: false, error: '截图识别需要联网，请先打开「联网识别」开关' })
          return
        }
        const image = str(body?.image)
        if (!image.startsWith('data:image/')) { send(res, 400, { ok: false, error: '图片格式不对' }); return }
        if (image.length > 6 * 1024 * 1024) { send(res, 413, { ok: false, error: '图片过大（上限 6MB）' }); return }

        const prompt = [
          '你是股票成交记录提取器。从图片中提取所有成交记录，输出严格 JSON 数组，不要任何解释。',
          '每项字段：date（YYYY-MM-DD）、side（买入/卖出/分红）、price（数字）、qty（数字）、name（股票名称，没有就空字符串）。',
          '如果图片里没有日期，date 用今天。无法识别的行直接跳过。'
        ].join('\n')

        let rows = []
        let source = 'harness'
        let harnessError = ''
        let harnessText = ''
        try {
          const viaHarness = await recognizeViaHarness(ctx, image, prompt)
          if (viaHarness.ok) {
            harnessText = String(viaHarness.text || '')
            const match = harnessText.match(/\[[\s\S]*\]/)
            if (match) {
              try { rows = JSON.parse(match[0]) } catch { rows = [] }
            }
            if (!Array.isArray(rows)) rows = []
          } else {
            harnessError = viaHarness.error || 'Harness 模型不可用'
          }
        } catch (error) {
          harnessError = error?.message || String(error)
        }

        if (rows.length === 0 && vision.apiKey && vision.baseUrl && vision.model) {
          const endpoint = vision.baseUrl.replace(/\/+$/, '') + '/chat/completions'
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + vision.apiKey },
            body: JSON.stringify({
              model: vision.model,
              temperature: 0,
              messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: [
                  { type: 'text', text: '提取这些成交记录' },
                  { type: 'image_url', image_url: { url: image } }
                ] }
              ]
            })
          })
          const text = await response.text()
          if (response.ok) {
            try {
              const json = JSON.parse(text)
              const content = json.choices?.[0]?.message?.content ?? ''
              const match = String(content).match(/\[[\s\S]*\]/)
              if (match) rows = JSON.parse(match[0])
              if (!Array.isArray(rows)) rows = []
              source = 'endpoint'
            } catch {
              send(res, 502, { ok: false, error: '接口返回的不是 JSON' })
              return
            }
          } else {
            send(res, 502, { ok: false, error: '视觉接口返回 ' + response.status + '：' + text.slice(0, 160) })
            return
          }
        }

        if (rows.length === 0) {
          send(res, 200, {
            ok: false,
            error: harnessError
              ? '识别失败：' + harnessError + '（可在「视觉接口设置」里指定一个支持图片的模型）'
              : '没有识别出成交记录，换一张更清晰的截图试试',
            raw: harnessText.slice(0, 400)
          })
          return
        }
        send(res, 200, { ok: true, source, rows: rows.slice(0, 200) })
        return
      }

      if (req.method === 'POST' && suffix === '/map-columns') {
        const body = await readJson(req)
        if (state.vision?.enabled !== true) {
          send(res, 400, { ok: false, error: '需要先打开「联网识别」开关' })
          return
        }
        const header = Array.isArray(body?.header) ? body.header.slice(0, 30).map((x) => String(x)) : []
        const sample = Array.isArray(body?.sample) ? body.sample.slice(0, 3).map((r) => (Array.isArray(r) ? r.slice(0, 30).map((x) => String(x)) : [])) : []
        if (!header.length) { send(res, 400, { ok: false, error: '缺少表头' }); return }
        const prompt = [
          '你在帮用户把成交表格的列对应到固定字段。',
          '字段有：date(日期)、side(买入/卖出/分红)、price(成交价)、qty(成交数量)、fee(费用)、name(股票名称)。',
          '只输出一个 JSON 对象，键是字段名，值是该字段所在的列序号（从 0 开始），没有的字段输出 null。不要解释。',
          '表头：' + JSON.stringify(header),
          '样例行：' + JSON.stringify(sample)
        ].join('\n')
        try {
          const result = await askHarnessText(ctx, prompt)
          if (!result.ok) { send(res, 200, { ok: false, error: result.error || '模型不可用' }); return }
          const match = String(result.text || '').match(/\{[\s\S]*\}/)
          if (!match) { send(res, 200, { ok: false, error: '模型没有返回可用的列映射' }); return }
          let mapping = {}
          try { mapping = JSON.parse(match[0]) } catch { mapping = {} }
          const clean = {}
          for (const key of ['date', 'side', 'price', 'qty', 'fee', 'name']) {
            const value = mapping[key]
            if (Number.isInteger(value) && value >= 0 && value < header.length) clean[key] = value
          }
          send(res, 200, { ok: true, mapping: clean })
        } catch (error) {
          send(res, 200, { ok: false, error: error?.message || String(error) })
        }
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
