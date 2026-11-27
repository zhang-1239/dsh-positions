# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# 1) 品种规范化
old = """function normalizeRule(raw) {
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
}"""
new = """function normalizeCategory(raw, fallbackName) {
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
    categories = [normalizeCategory({
      name: 'A股',
      commissionRate: raw.commissionRate,
      minCommission: raw.minCommission,
      stampDutyRate: raw.stampDutyRate,
      transferFeeRate: raw.transferFeeRate,
      otherFixed: raw.otherFixed
    }, 'A股')]
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
}"""
assert old in s
s = s.replace(old, new)

# 2) stock.variant
old2 = """    note: str(raw.note).slice(0, 500),"""
new2 = """    note: str(raw.note).slice(0, 500),
    variant: str(raw.variant).slice(0, 40),"""
assert old2 in s
s = s.replace(old2, new2)

# 3) setVariant 动作
old3 = """  setGroup(state, payload) {"""
new3 = """  setVariant(state, payload) {
    const stock = findStock(state, str(payload?.name).trim())
    if (!stock) throw bad('找不到这只股票')
    stock.variant = str(payload?.variant).slice(0, 40)
    return state
  },

  setGroup(state, payload) {"""
assert old3 in s
s = s.replace(old3, new3)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("categories server patched")
