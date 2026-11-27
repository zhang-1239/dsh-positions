# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) feeOf 接受品种
old = """    function feeOf(rule, side, turnover) {
      const r = rule || DEFAULT_RULE"""
new = """    function feeOf(rule, side, turnover) {
      const r = rule || DEFAULT_RULE
"""
assert old in s
s = s.replace(old, new)

# 2) calcRecords 参数改为品种 + resolveCategory
old2 = """    function calcRecords(records, rule) {"""
new2 = """    function resolveCategory(rule, stock) {
      const categories = rule && Array.isArray(rule.categories) ? rule.categories : []
      if (!categories.length) return DEFAULT_RULE
      if (stock && stock.variant) {
        const hit = categories.find((c) => c.id === stock.variant)
        if (hit) return hit
      }
      return categories[0]
    }

    function calcRecords(records, category) {"""
assert old2 in s
s = s.replace(old2, new2)

old3 = "          const fee = r.feeOverride !== undefined && r.feeOverride !== null ? Number(r.feeOverride) : feeOf(rule, r.side, turnover)"
new3 = "          const fee = r.feeOverride !== undefined && r.feeOverride !== null ? Number(r.feeOverride) : feeOf(category, r.side, turnover)"
assert old3 in s
s = s.replace(old3, new3)

# 3) previewCalc 用品种
old4 = """    function previewCalc(base, row, rule) {"""
new4 = """    function previewCalc(base, row, category) {"""
assert old4 in s
s = s.replace(old4, new4)

old5 = """      const fee = feeOf(rule, row.side, turnover)"""
new5 = """      const fee = feeOf(category, row.side, turnover)"""
assert old5 in s
s = s.replace(old5, new5)

# 4) Ledger 用 category
old6 = """      const { stock, rule, savedRows, onSave, onDeleteRecord, customColumns, onSetField, onChart } = props"""
new6 = """      const { stock, category, savedRows, onSave, onDeleteRecord, customColumns, onSetField, onChart } = props"""
assert old6 in s
s = s.replace(old6, new6)

old7 = """              const p = previewCalc(base, row, rule)"""
new7 = """              const p = previewCalc(base, row, category)"""
assert old7 in s
s = s.replace(old7, new7)

# 5) view 计算按股票品种
old8 = """        const stocks = state.stocks.map((s) => {
          const records = calcRecords(s.records, rule)"""
new8 = """        const stocks = state.stocks.map((s) => {
          const category = resolveCategory(rule, s)
          const records = calcRecords(s.records, category)"""
assert old8 in s
s = s.replace(old8, new8)

old9 = """          return Object.assign({}, s, { records, cumQty, cumInvest, last, mv })"""
new9 = """          return Object.assign({}, s, { records, cumQty, cumInvest, last, mv, category })"""
assert old9 in s
s = s.replace(old9, new9)

# 6) ledgerProps 传 category
old10 = """      const ledgerProps = (s) => ({
        stock: s,
        rule,"""
new10 = """      const ledgerProps = (s) => ({
        stock: s,
        category: s.category,"""
assert old10 in s
s = s.replace(old10, new10)

# 7) 分组弹窗加「品种」
old11 = """        stocks.map((s) => h('div', { key: s.name, className: 'pos-grow' },
          h('span', { className: 'name' }, s.name),"""
new11 = """        stocks.map((s) => h('div', { key: s.name, className: 'pos-grow' },
          h('span', { className: 'name' }, s.name),
          h('select', {
            className: 'pos-input', style: { width: 110 },
            value: s.variant || '',
            onChange: (e) => onVariant(s.name, e.target.value)
          },
            h('option', { value: '' }, '默认品种'),
            (categories || []).map((c) => h('option', { key: c.id, value: c.id }, c.name))
          ),"""
assert old11 in s
s = s.replace(old11, new11)

old12 = """    function GroupModal(props) {
      const { stocks, onClose, onSave } = props"""
new12 = """    function GroupModal(props) {
      const { stocks, onClose, onSave, categories, onVariant } = props"""
assert old12 in s
s = s.replace(old12, new12)

# 8) 打开分组弹窗传参
old13 = """        groupOpen ? h(GroupModal, { stocks: view.stocks, onClose: () => setGroupOpen(false), onSave: saveGroups }) : null,"""
new13 = """        groupOpen ? h(GroupModal, {
          stocks: view.stocks,
          categories: rule.categories || [],
          onVariant: (name, variant) => act('setVariant', { name, variant }),
          onClose: () => setGroupOpen(false),
          onSave: saveGroups
        }) : null,"""
assert old13 in s
s = s.replace(old13, new13)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("client categories part1")
