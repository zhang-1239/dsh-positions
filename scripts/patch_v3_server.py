# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# 1) 列定义默认值 + 规范化
old = """function clampRate(value, fallback) {"""
new = """const DEFAULT_COLUMNS = [
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

function clampRate(value, fallback) {"""
assert old in s
s = s.replace(old, new, 1)

# 2) stock 增加 fields
old = """    archived: raw.archived === true,
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []"""
new = """    archived: raw.archived === true,
    fields: isObject(raw.fields)
      ? Object.keys(raw.fields).reduce((acc, k) => { acc[k] = str(raw.fields[k]).slice(0, 200); return acc }, {})
      : {},
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []"""
assert old in s
s = s.replace(old, new)

# 3) state 增加 columns
old = """  return {
    version: 1,
    feeRules: rules,"""
new = """  let columns = Array.isArray(state.columns) ? state.columns.map(normalizeColumn).filter(Boolean) : []
  if (columns.length === 0) columns = DEFAULT_COLUMNS.map((c) => Object.assign({}, c))
  return {
    version: 1,
    columns,
    feeRules: rules,"""
assert old in s
s = s.replace(old, new)

# 4) 新动作：列管理 + 字段
old = """  archiveStock(state, payload) {"""
new = """  addColumn(state, payload) {
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

  archiveStock(state, payload) {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("server v3 patched")
