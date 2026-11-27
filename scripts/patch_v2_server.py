# -*- coding: utf-8 -*-
import re

p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# 1) 记录允许「分红」
old = """  const side = raw.side === '卖出' ? '卖出' : raw.side === '买入' ? '买入' : null
  const price = num(raw.price)
  const qty = num(raw.qty)
  if (!side || price <= 0 || qty <= 0) return null
  const record = { date, side, price, qty }"""
new = """  const side = raw.side === '卖出' ? '卖出' : raw.side === '买入' ? '买入' : raw.side === '分红' ? '分红' : null
  const price = num(raw.price)
  const qty = num(raw.qty)
  if (!side || price <= 0 || qty <= 0) return null
  const record = { date, side, price, qty }"""
assert old in s
s = s.replace(old, new)

# 2) 股票增加 archived
old = """    price: Math.max(0, num(raw.price)),
    dayPnl: num(raw.dayPnl),
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []
  }"""
new = """    price: Math.max(0, num(raw.price)),
    dayPnl: num(raw.dayPnl),
    archived: raw.archived === true,
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter(Boolean) : []
  }"""
assert old in s
s = s.replace(old, new)

# 3) 费率规则：规范化 + 状态字段
old = """function normalizeState(raw) {
  const state = isObject(raw) ? raw : {}
  const stocks = Array.isArray(state.stocks) ? state.stocks.map(normalizeStock).filter(Boolean) : []
  return {
    version: 1,
    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,"""
new = """function clampRate(value, fallback) {
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
  return {
    version: 1,
    feeRules: rules,
    activeFeeRule,
    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,"""
assert old in s
s = s.replace(old, new)

# 4) 新动作：归档 / 恢复 / 费率规则
old = """  deleteStock(state, payload) {"""
new = """  archiveStock(state, payload) {
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

  deleteStock(state, payload) {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("server patched")
