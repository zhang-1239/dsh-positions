# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

start = s.find("    function parseImport(text) {")
end = s.find("    function matchByPrice(stocks, price) {")
assert start > 0 and end > start

new_parse = '''    const COLUMN_ALIASES = {
      date: ['日期', 'date', '成交日期', '交易日期', '发生日期', '时间', '成交时间'],
      side: ['方向', 'side', '买卖', '买卖方向', '操作', '业务名称', '交易类型', '买卖标志', '交易类别'],
      price: ['价格', 'price', '成交价', '成交价格', '均价', '单价', '成交均价'],
      qty: ['数量', 'qty', '成交量', '成交数量', '股数', '成交股数', '买卖数量', '实际数量'],
      fee: ['费用', 'fee', '手续费', '佣金', '总费用', '税费', '手续费及佣金'],
      name: ['股票', '名称', 'name', 'stock', '股票名称', '证券名称', '证券代码', '代码', '股东代码', '证券']
    }
    const COLUMN_LABELS = { date: '日期', side: '方向', price: '价格', qty: '数量', fee: '费用', name: '股票' }

    function normHeader(value) {
      return String(value || '').toLowerCase().replace(/[\\s()（）:：\\-_/]/g, '')
    }

    function matchHeader(cell, key) {
      const value = normHeader(cell)
      if (!value) return false
      return COLUMN_ALIASES[key].some((alias) => value === normHeader(alias) || value.includes(normHeader(alias)))
    }

    function parseTable(text) {
      const lines = String(text || '').split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean)
      if (!lines.length) return { header: [], rows: [], mapping: {} }
      const first = lines[0].split(',').map((cell) => cell.trim())
      const looksLikeHeader = first.some((cell) => Object.keys(COLUMN_ALIASES).some((key) => matchHeader(cell, key)))
      const header = looksLikeHeader ? first : first.map((_, i) => '第' + (i + 1) + '列')
      const body = looksLikeHeader ? lines.slice(1) : lines
      const rows = body.map((line) => line.split(',').map((cell) => cell.trim()))
      const mapping = {}
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
      return { header, rows, mapping }
    }

    function buildRecords(table, mapping) {
      const required = ['date', 'side', 'price', 'qty']
      if (required.some((key) => mapping[key] === undefined || mapping[key] < 0)) return []
      return table.rows.map((cells) => {
        const get = (key) => {
          const index = mapping[key]
          if (index === undefined || index < 0) return ''
          return cells[index] === undefined ? '' : cells[index]
        }
        return {
          date: get('date') || today(),
          side: normSide(get('side')),
          price: get('price'),
          qty: get('qty'),
          fee: get('fee'),
          name: get('name')
        }
      }).filter((r) => r.side && Number(r.price) > 0 && Number(r.qty) > 0)
    }

    function parseImport(text) {
      const table = parseTable(text)
      return buildRecords(table, table.mapping)
    }

'''
s = s[:start] + new_parse + s[end:]

# EntryPanel: parse + mapping state
old = """      const parse = (raw) => {
        const parsed = parseImport(raw).map((r) => {
          const explicit = r.name && stocks.some((s) => s.name === r.name)
          const auto = !explicit && !r.name ? matchByPrice(stocks, r.price) : ''
          return Object.assign({}, r, { name: explicit ? r.name : (r.name || auto), auto: !explicit && !!auto })
        })
        const autoCount = parsed.filter((r) => r.auto).length
        setRows(parsed)
        setNote(parsed.length
          ? '解析到 ' + parsed.length + ' 条' + (autoCount ? '，其中 ' + autoCount + ' 条没写股票名，已按价格自动匹配' : '') + '，请核对后再导入'
          : '没有解析到有效行。格式：日期,方向,价格,数量,费用(可空),股票名称(可空)')
      }"""
new = """      const applyTable = (table, useMapping) => {
        const mapping = useMapping || {}
        const parsed = buildRecords(table, mapping).map((r) => {
          const explicit = r.name && stocks.some((s) => s.name === r.name)
          const auto = !explicit && !r.name ? matchByPrice(stocks, r.price) : ''
          return Object.assign({}, r, { name: explicit ? r.name : (r.name || auto), auto: !explicit && !!auto })
        })
        const autoCount = parsed.filter((r) => r.auto).length
        setRows(parsed)
        if (!parsed.length) {
          setNote('没有解析到有效行：文件里一行数据都没有，或列映射没对上（点「列映射」手动指定）')
        } else {
          setNote('解析到 ' + parsed.length + ' 条' + (autoCount ? '，其中 ' + autoCount + ' 条没写股票名，已按价格自动匹配' : '') + '，请核对后再导入')
        }
      }

      const parse = (raw) => {
        const table = parseTable(raw)
        setTable(table)
        setMapping(table.mapping)
        const missing = ['date', 'side', 'price', 'qty'].filter((key) => table.mapping[key] === undefined)
        if (missing.length) {
          setRows([])
          setShowMap(true)
          setNote('识别到 ' + table.header.length + ' 列，但缺少：' + missing.map((k) => COLUMN_LABELS[k]).join('、') + '。请在下方「列映射」里指定。')
          return
        }
        applyTable(table, table.mapping)
      }"""
assert old in s
s = s.replace(old, new)

# state
old2 = """      const [text, setText] = useState('')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [hot, setHot] = useState(false)"""
new2 = """      const [text, setText] = useState('')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [hot, setHot] = useState(false)
      const [table, setTable] = useState({ header: [], rows: [], mapping: {} })
      const [mapping, setMapping] = useState({})
      const [showMap, setShowMap] = useState(false)"""
assert old2 in s
s = s.replace(old2, new2)

# 列映射 UI：放在「解析文本」按钮后
old3 = """        h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { className: 'pos-mini', onClick: () => parse(text) }, '解析文本')
        ),"""
new3 = """        h('div', { style: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' } },
          h('button', { className: 'pos-mini', onClick: () => parse(text) }, '解析文本'),
          table.header.length ? h('button', { className: 'pos-mini', onClick: () => setShowMap(!showMap) }, showMap ? '收起列映射' : '列映射') : null
        ),

        showMap && table.header.length
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginTop: 8 } },
              h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 8 } }, '指定每一列是什么；文件里没有的字段可以留空（费用、股票）。'),
              h('div', { className: 'pos-fee-grid' },
                ['date', 'side', 'price', 'qty', 'fee', 'name'].map((key) => h('div', { key, className: 'pos-fee-field' },
                  h('label', null, COLUMN_LABELS[key]),
                  h('select', {
                    className: 'pos-import-select', style: { maxWidth: '100%' },
                    value: mapping[key] === undefined ? '' : String(mapping[key]),
                    onChange: (e) => {
                      const next = Object.assign({}, mapping)
                      if (e.target.value === '') delete next[key]
                      else next[key] = Number(e.target.value)
                      setMapping(next)
                      applyTable(table, next)
                    }
                  },
                    h('option', { value: '' }, '— 不映射 —'),
                    table.header.map((cell, i) => h('option', { key: i, value: String(i) }, (cell || '第' + (i + 1) + '列') + '（第' + (i + 1) + '列）'))
                  )
                ))
              )
            )
          : null,"""
assert old3 in s
s = s.replace(old3, new3)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("import mapping patched")
