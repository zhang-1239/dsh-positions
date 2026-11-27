# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# stock.note
old = """    archived: raw.archived === true,
    fields: isObject(raw.fields)"""
new = """    archived: raw.archived === true,
    note: str(raw.note).slice(0, 500),
    fields: isObject(raw.fields)"""
assert old in s
s = s.replace(old, new)

# 迁移：确保有「备注」内置列（放在累计成本之后）
old = """  let columns = Array.isArray(state.columns) ? state.columns.map(normalizeColumn).filter(Boolean) : []
  if (columns.length === 0) columns = DEFAULT_COLUMNS.map((c) => Object.assign({}, c))"""
new = """  let columns = Array.isArray(state.columns) ? state.columns.map(normalizeColumn).filter(Boolean) : []
  if (columns.length === 0) columns = DEFAULT_COLUMNS.map((c) => Object.assign({}, c))
  if (!columns.some((c) => c.key === 'note')) {
    const costIndex = columns.findIndex((c) => c.key === 'cost')
    const noteColumn = { key: 'note', label: '备注', builtin: true }
    if (costIndex >= 0) columns.splice(costIndex + 1, 0, noteColumn)
    else columns.push(noteColumn)
  }"""
assert old in s
s = s.replace(old, new)

# action setNote
old = """  setField(state, payload) {"""
new = """  setNote(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.note = str(payload?.note).slice(0, 500)
    return state
  },

  setField(state, payload) {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("server note patched")
