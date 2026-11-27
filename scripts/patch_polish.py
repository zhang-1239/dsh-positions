# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) 历史表居中
old = ".pos-list th, .pos-list td { padding:7px 10px; text-align:left; border-bottom:1px solid #eef1f6; }"
new = ".pos-list th, .pos-list td { padding:7px 10px; text-align:center; border-bottom:1px solid #eef1f6; }"
assert old in s
s = s.replace(old, new)

# 2) 星号说明
old2 = "        h('p', { className: 'pos-note' }, '测算只用于比较，不写入历史；保存后留在本机。')"
new2 = "        h('p', { className: 'pos-note' }, '测算只用于比较，不写入历史；保存后留在本机。费用带 * 表示用的是导入文件里自带的费用，不是按费率算的。')"
assert old2 in s
s = s.replace(old2, new2)

# 3) 图表：点显示数值 + 无重合提示
old3 = """          h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 2 }),
          pts.map((pt, i) => h('circle', { key: i, cx: pt[0], cy: pt[1], r: 2.4, fill: color }))"""
new3 = """          h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 2 }),
          pts.map((pt, i) => h('circle', { key: i, cx: pt[0], cy: pt[1], r: 2.4, fill: color },
            h('title', null, points[i] ? points[i].date + '  ' + Number(valuesArr[i]).toFixed(2) : '')))"""
assert old3 in s
s = s.replace(old3, new3)

old4 = """          return h('g', { key }, valuesArr.map((v, i) => (v === null ? null : h('rect', {
            key: i, x: x(i) - barW / 2, y: yFn(v), width: barW, height: Math.max(1, H - P.b - yFn(v)), fill: color, opacity: 0.85
          }))))"""
new4 = """          return h('g', { key }, valuesArr.map((v, i) => (v === null ? null : h('rect', {
            key: i, x: x(i) - barW / 2, y: yFn(v), width: barW, height: Math.max(1, H - P.b - yFn(v)), fill: color, opacity: 0.85
          }, h('title', null, (points[i] ? points[i].date : '') + '  ' + Number(v).toFixed(2))))))"""
assert old4 in s
s = s.replace(old4, new4)

old5 = """      if (points.length < 2) {
        return h('div', { className: 'pos-empty', style: { padding: 32 } }, '数据不足以画图（至少需要 2 个数据点）')
      }"""
new5 = """      if (compare === 'imported' && importedMap.size && points.length < 2) {
        const importedDates = Array.from(importedMap.keys()).sort()
        return h('div', { className: 'pos-empty', style: { padding: 32 } },
          '对比数据与成交日期没有重合，所以画不出来。',
          h('div', { className: 'pos-sub', style: { marginTop: 8 } },
            '成交范围：' + ((records[0] && records[0].date) || '—') + ' ~ ' + ((records[records.length - 1] && records[records.length - 1].date) || '—')
            + '；导入数据范围：' + importedDates[0] + ' ~ ' + importedDates[importedDates.length - 1]))
      }
      if (points.length < 2) {
        return h('div', { className: 'pos-empty', style: { padding: 32 } }, '数据不足以画图（至少需要 2 个数据点）')
      }"""
assert old5 in s
s = s.replace(old5, new5)

# 4) 重复检测
old6 = """        const known = new Set(stocks.map((s) => s.name))"""
new6 = """        const known = new Set(stocks.map((s) => s.name))
        const existingKeys = new Map()
        stocks.forEach((s) => {
          const set = new Set()
          ;(s.records || []).forEach((r) => {
            set.add([String(r.date), String(r.side), Number(r.price), Number(r.qty)].join('|'))
          })
          existingKeys.set(s.name, set)
        })"""
assert old6 in s
s = s.replace(old6, new6)

old7 = """        const parsed = filled.map((r) => {
          if (r.name) {
            return Object.assign({}, r, { auto: false, isNew: !known.has(r.name) && !r.inherited })
          }
          const auto = matchByPrice(stocks, r.price)
          return Object.assign({}, r, { auto: !!auto, isNew: false })
        })"""
new7 = """        const parsed = filled.map((r) => {
          const base = r.name
            ? Object.assign({}, r, { auto: false, isNew: !known.has(r.name) && !r.inherited })
            : Object.assign({}, r, { auto: !!matchByPrice(stocks, r.price), isNew: false })
          const key = [String(base.date), String(base.side), Number(base.price), Number(base.qty)].join('|')
          const duplicate = !!(base.name && existingKeys.get(base.name) && existingKeys.get(base.name).has(key))
          return Object.assign({}, base, { duplicate })
        })"""
assert old7 in s
s = s.replace(old7, new7)

# 提示加重复条数
old8 = """        const newCount = parsed.filter((r) => r.isNew).length"""
new8 = """        const newCount = parsed.filter((r) => r.isNew).length
        const dupCount = parsed.filter((r) => r.duplicate).length
        const allDup = parsed.length > 0 && dupCount === parsed.length"""
assert old8 in s
s = s.replace(old8, new8)

old9 = """          setNote('解析到 ' + parsed.length + ' 条'
            + (autoCount ? '，' + autoCount + ' 条没写股票名、已按价格匹配' : '')
            + (newCount ? '，' + newCount + ' 条是新股票（导入后自动新建，归入「未分组」）' : '')
            + '，请核对后再导入')"""
new9 = """          setNote('解析到 ' + parsed.length + ' 条'
            + (autoCount ? '，' + autoCount + ' 条没写股票名、已按价格匹配' : '')
            + (newCount ? '，' + newCount + ' 条是新股票（导入后自动新建，归入「未分组」）' : '')
            + (dupCount ? '，' + dupCount + ' 条与已有记录重复（日期+方向+价格+数量一致），导入时会跳过' : '')
            + '，请核对后再导入')
          if (allDup) setError('这一批和已有记录完全重复，可能是重复导入同一个文件，请确认后再操作。')"""
assert old9 in s
s = s.replace(old9, new9)

# 预览行加重复标记
old10 = """                  r.isNew ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#eef4ff', borderColor: '#c7d2fe', color: '#2457d6' } }, '新建') : null,"""
new10 = """                  r.isNew ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#eef4ff', borderColor: '#c7d2fe', color: '#2457d6' } }, '新建') : null,
                  r.duplicate ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fef3f2', borderColor: '#fecdca', color: '#b42318' } }, '重复，跳过') : null,"""
assert old10 in s
s = s.replace(old10, new10)

# 导入时跳过重复
old11 = """          onImport: async (rows) => {
            for (const r of rows) {"""
new11 = """          onImport: async (rows) => {
            for (const r of rows.filter((row) => !row.duplicate)) {"""
assert old11 in s
s = s.replace(old11, new11)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("center + star legend + tooltip + duplicate detection")
