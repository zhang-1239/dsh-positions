# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) buildRecords 支持默认方向
old = """    function buildRecords(table, mapping) {
      const required = ['date', 'side', 'price', 'qty']
      if (required.some((key) => mapping[key] === undefined || mapping[key] < 0)) return []
      return table.rows.map((cells) => {
        const get = (key) => {
          const index = mapping[key]
          if (index === undefined || index < 0) return ''
          return cells[index] === undefined ? '' : cells[index]
        }
        return {
          date: normalizeDate(get('date')),
          side: normSide(get('side')),
          price: get('price'),
          qty: get('qty'),
          fee: get('fee'),
          name: get('name')
        }
      }).filter((r) => r.side && Number(r.price) > 0 && Number(r.qty) > 0)
    }"""
new = """    function buildRecords(table, mapping, defaults) {
      const options = defaults || {}
      const required = ['price', 'qty']
      if (required.some((key) => mapping[key] === undefined || mapping[key] < 0)) return []
      return table.rows.map((cells) => {
        const get = (key) => {
          const index = mapping[key]
          if (index === undefined || index < 0) return ''
          return cells[index] === undefined ? '' : cells[index]
        }
        return {
          date: normalizeDate(get('date') || options.date || today()),
          side: normSide(get('side')) || (mapping.side === undefined ? (options.side || '') : ''),
          price: get('price'),
          qty: get('qty'),
          fee: get('fee'),
          name: get('name')
        }
      }).filter((r) => r.side && Number(r.price) > 0 && Number(r.qty) > 0)
    }"""
assert old in s
s = s.replace(old, new)

# 2) applyTable：名称下填 + 新股票标记 + 分组
old2 = """      const applyTable = (table, useMapping) => {
        const mapping = useMapping || {}
        const known = new Set(stocks.map((s) => s.name))
        const parsed = buildRecords(table, mapping).map((r) => {
          if (r.name) {
            return Object.assign({}, r, { name: r.name, auto: false, isNew: !known.has(r.name) })
          }
          const auto = matchByPrice(stocks, r.price)
          return Object.assign({}, r, { auto: !!auto, isNew: false })
        })"""
new2 = """      const applyTable = (table, useMapping) => {
        const mapping = useMapping || {}
        const known = new Set(stocks.map((s) => s.name))
        let last = ''
        const filled = buildRecords(table, mapping, { side: defaultSide, date: form.date }).map((r) => {
          if (r.name) { last = r.name; return r }
          if (last) return Object.assign({}, r, { name: last, inherited: true })
          return r
        })
        const parsed = filled.map((r) => {
          if (r.name) {
            return Object.assign({}, r, { auto: false, isNew: !known.has(r.name) && !r.inherited })
          }
          const auto = matchByPrice(stocks, r.price)
          return Object.assign({}, r, { auto: !!auto, isNew: false })
        })"""
assert old2 in s
s = s.replace(old2, new2)

# 3) 列映射面板：模型识别 + 默认方向 + 多余列提示
old3 = """        showMap && table.header.length
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginTop: 8 } },
              h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 8 } }, '指定每一列是什么；文件里没有的字段可以留空（费用、股票）。'),"""
new3 = """        showMap && table.header.length
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginTop: 8 } },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
                h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '指定每一列是什么；没有的字段可以留空（费用、股票）。多出来的列会被忽略。'),
                enabled ? h('button', {
                  className: 'pos-mini', style: { marginLeft: 'auto' },
                  onClick: async () => {
                    try {
                      const res = await fetch(API + '/map-columns', {
                        method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ header: table.header, sample: table.rows.slice(0, 3) })
                      })
                      const json = await res.json()
                      if (!json.ok) { setNote('模型识别失败：' + (json.error || '未知原因')); return }
                      const merged = Object.assign({}, mapping, json.mapping)
                      setMapping(merged)
                      applyTable(table, merged)
                      setNote('模型建议的列映射已填入，请核对')
                    } catch (err) {
                      setNote('模型识别失败：' + String(err.message || err))
                    }
                  }
                }, '用模型识别列') : null
              ),"""
assert old3 in s
s = s.replace(old3, new3)

# 默认方向选择（方向列不存在时）
old4 = """                  )
                ))
              )
            )
          : null,"""
new4 = """                  )
                )),
                mapping.side === undefined
                  ? h('div', { className: 'pos-fee-field', style: { marginTop: 8, maxWidth: 220 } },
                      h('label', null, '文件里没有方向列时，默认按'),
                      h('select', {
                        className: 'pos-import-select', value: defaultSide,
                        onChange: (e) => { setDefaultSide(e.target.value); applyTable(table, mapping) }
                      },
                        h('option', { value: '买入' }, '买入'),
                        h('option', { value: '卖出' }, '卖出'))
                    )
                  : null
              )
            )
          : null,"""
assert old4 in s
s = s.replace(old4, new4)

# 4) 状态：defaultSide
old5 = """      const [table, setTable] = useState({ header: [], rows: [], mapping: {} })"""
new5 = """      const [table, setTable] = useState({ header: [], rows: [], mapping: {} })
      const [defaultSide, setDefaultSide] = useState('买入')"""
assert old5 in s
s = s.replace(old5, new5)

# 5) 预览按股票分块
old6 = """              h('tbody', null, rows.map((r, i) => h('tr', { key: i, className: r.name ? '' : 'unmatched' },"""
new6 = """              h('tbody', null, (() => {
                const blocks = []
                rows.forEach((r, index) => {
                  const key = r.name || ''
                  if (!blocks.length || blocks[blocks.length - 1].key !== key) blocks.push({ key, items: [] })
                  blocks[blocks.length - 1].items.push({ row: r, index })
                })
                const nodes = []
                blocks.forEach((block, bi) => {
                  if (block.key) {
                    const first = block.items[0].row
                    nodes.push(h('tr', { key: 'b' + bi, className: 'pos-import-group' },
                      h('td', { colSpan: 7 },
                        h('strong', null, block.key),
                        h('span', { className: 'pos-muted', style: { marginLeft: 8, fontSize: 12 } }, block.items.length + ' 条'),
                        first.isNew ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginLeft: 8, background: '#eef4ff', borderColor: '#c7d2fe', color: '#2457d6' } }, '新建') : null,
                        h('span', { className: 'pos-muted', style: { marginLeft: 8, fontSize: 11 } }, first.isNew ? '导入后自动创建，归入未分组' : '')
                      )))
                  }
                  block.items.forEach(({ row: r, index: i }) => nodes.push(h('tr', { key: i, className: r.name ? '' : 'unmatched' },"""
assert old6 in s
s = s.replace(old6, new6)

# 关闭块渲染：找到该 map 的结尾
old7 = """                h('td', null, h('button', { className: 'pos-link danger', onClick: () => setRows((prev) => prev.filter((_, idx) => idx !== i)) }, '删除'))
              )))
            )
          : null,"""
new7 = """                h('td', null, h('button', { className: 'pos-link danger', onClick: () => setRows((prev) => prev.filter((_, idx) => idx !== i)) }, '删除'))
              )))
                })
                return nodes
              })())
            )
          : null,"""
assert old7 in s
s = s.replace(old7, new7)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("blocks + defaults patched")
