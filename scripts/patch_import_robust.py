# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) 日期归一 + 名称启发式
old = """    function parseTable(text) {"""
new = """    function normalizeDate(value) {
      const v = String(value || '').trim()
      if (/^\\d{5}(\\.\\d+)?$/.test(v)) {
        const n = Math.round(Number(v))
        if (n >= 20000 && n <= 80000) {
          const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
          return d.toISOString().slice(0, 10)
        }
      }
      if (/^\\d{8}$/.test(v)) return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8)
      const m = v.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})/)
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
      return v || today()
    }

    function looksLikeName(cell) {
      const v = String(cell || '').trim()
      if (!v) return false
      if (Number.isFinite(Number(v))) return false
      if (normSide(v)) return false
      if (/^\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}$/.test(v)) return false
      if (/^\\d{5,8}$/.test(v)) return false
      return true
    }

    function parseTable(text) {"""
assert old in s
s = s.replace(old, new)

# 2) parseTable：列数补齐 + 名称/日期启发式
old2 = """      const mapping = {}
      if (looksLikeHeader) {
        for (const key of Object.keys(COLUMN_ALIASES)) {
          const index = header.findIndex((cell) => matchHeader(cell, key))
          if (index >= 0 && mapping[key] === undefined) mapping[key] = index
        }
      } else {
        mapping.date = 0
        mapping.side = 1
        mapping.price = 2
        mapping.qty = 3
      }
      return { header, rows, mapping }"""
new2 = """      const mapping = {}
      if (looksLikeHeader) {
        for (const key of Object.keys(COLUMN_ALIASES)) {
          const index = header.findIndex((cell) => matchHeader(cell, key))
          if (index >= 0 && mapping[key] === undefined) mapping[key] = index
        }
        const widest = rows.reduce((max, r) => Math.max(max, r.length), header.length)
        while (header.length < widest) header.push('第' + (header.length + 1) + '列')
        const used = new Set(Object.values(mapping))
        if (mapping.name === undefined) {
          let best = -1
          let bestScore = 0
          for (let c = 0; c < widest; c++) {
            if (used.has(c)) continue
            const score = rows.length ? rows.filter((r) => looksLikeName(r[c])).length / rows.length : 0
            if (score > bestScore) { bestScore = score; best = c }
          }
          if (best >= 0 && bestScore >= 0.6) mapping.name = best
        }
        if (mapping.date === undefined) {
          const index = rows.length
            ? header.findIndex((_, c) => rows.filter((r) => /^\\d{5,8}$/.test(String(r[c] || '').trim()) || /^\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}$/.test(String(r[c] || '').trim())).length / rows.length >= 0.6)
            : -1
          if (index >= 0) mapping.date = index
        }
      } else {
        mapping.date = 0
        mapping.side = 1
        mapping.price = 2
        mapping.qty = 3
      }
      return { header, rows, mapping }"""
assert old2 in s
s = s.replace(old2, new2)

# 3) buildRecords 用 normalizeDate
old3 = """        return {
          date: get('date') || today(),
          side: normSide(get('side')),"""
new3 = """        return {
          date: normalizeDate(get('date')),
          side: normSide(get('side')),"""
assert old3 in s
s = s.replace(old3, new3)

# 4) 新股票名称不丢：标记 isNew
old4 = """        const parsed = buildRecords(table, mapping).map((r) => {
          const explicit = r.name && stocks.some((s) => s.name === r.name)
          const auto = !explicit && !r.name ? matchByPrice(stocks, r.price) : ''
          return Object.assign({}, r, { name: explicit ? r.name : (r.name || auto), auto: !explicit && !!auto })
        })"""
new4 = """        const known = new Set(stocks.map((s) => s.name))
        const parsed = buildRecords(table, mapping).map((r) => {
          if (r.name) {
            return Object.assign({}, r, { name: r.name, auto: false, isNew: !known.has(r.name) })
          }
          const auto = matchByPrice(stocks, r.price)
          return Object.assign({}, r, { auto: !!auto, isNew: false })
        })"""
assert old4 in s
s = s.replace(old4, new4)

# 5) 提示文案
old5 = """        if (!parsed.length) {
          setNote('没有解析到有效行：文件里一行数据都没有，或列映射没对上（点「列映射」手动指定）')
        } else {
          setNote('解析到 ' + parsed.length + ' 条' + (autoCount ? '，其中 ' + autoCount + ' 条没写股票名，已按价格自动匹配' : '') + '，请核对后再导入')
        }"""
new5 = """        const newCount = parsed.filter((r) => r.isNew).length
        if (!parsed.length) {
          setNote('没有解析到有效行：文件里一行数据都没有，或列映射没对上（点「列映射」手动指定）')
        } else {
          setNote('解析到 ' + parsed.length + ' 条'
            + (autoCount ? '，' + autoCount + ' 条没写股票名、已按价格匹配' : '')
            + (newCount ? '，' + newCount + ' 条是新股票（导入后自动新建，归入「未分组」）' : '')
            + '，请核对后再导入')
        }"""
assert old5 in s
s = s.replace(old5, new5)

# 6) 预览下拉：已知股票 + 新名称选项
old6 = """                h('td', null, r.auto ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '按价格匹配') : null,
                  h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, { name: e.target.value }) },
                    h('option', { value: '' }, '— 请选择 —'),
                    stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
                  )),"""
new6 = """                h('td', null,
                  r.auto ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '按价格匹配') : null,
                  r.isNew ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#eef4ff', borderColor: '#c7d2fe', color: '#2457d6' } }, '新建') : null,
                  h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, { name: e.target.value }) },
                    h('option', { value: '' }, '— 请选择 —'),
                    r.isNew ? h('option', { key: '__new', value: r.name }, '新建：' + r.name) : null,
                    stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
                  )),"""
assert old6 in s
s = s.replace(old6, new6)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("import robustness patched")
