# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) CSS
anchor = ".pos-fee-preview img { max-width:100%; max-height:180px; border-radius:6px; display:block; }"
add = anchor + """
.pos-note-cell { max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#2457d6; cursor:pointer; }
.pos-note-cell:hover { text-decoration:underline; }
.pos-import-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
.pos-import-table th, .pos-import-table td { padding:6px 8px; text-align:left; border-bottom:1px solid #eef1f6; }
.pos-import-table th { background:#f8fafc; font-weight:600; color:#475467; }
.pos-import-table tr.unmatched td { background:#feeceb; }
.pos-import-select { height:28px; border-radius:6px; border:1px solid #dde3ee; background:#fff; font-size:12px; padding:0 6px; max-width:150px; }
"""
assert anchor in s
s = s.replace(anchor, add)

# 2) cellValue: note
old = """        case 'cost': return s.last && s.last.cost !== null ? s.last.cost.toFixed(3) : '—'
        default: return (s.fields && s.fields[key]) || '—'"""
new = """        case 'cost': return s.last && s.last.cost !== null ? s.last.cost.toFixed(3) : '—'
        case 'note': return s.note || ''
        default: return (s.fields && s.fields[key]) || '—'"""
assert old in s
s = s.replace(old, new)

# 3) 新组件：备注弹窗 + 导入弹窗
anchor2 = "/* -------------------------------------------------------- 归档弹窗 */"
components = """    /* -------------------------------------------------------- 备注弹窗 */

    function NoteModal(props) {
      const { stock, onClose, onSave } = props
      const [text, setText] = useState(stock.note || '')
      return h(Modal, { title: '备注 · ' + stock.name, onClose, maxWidth: 560 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } }, '写下接下来打算怎么操作这只股票，例如「跌破 9.5 减半仓」。备注会显示在持仓表这一行。'),
        h('textarea', {
          className: 'pos-input', style: { width: '100%', height: 120, padding: 8, lineHeight: 1.6 },
          maxLength: 500, placeholder: '例如：等回踩 9.8 附近加仓 200 股', value: text,
          onChange: (e) => setText(e.target.value)
        }),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
          h('button', { className: 'pos-btn', onClick: () => onSave('') }, '清除'),
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', onClick: () => onSave(text.trim()) }, '保存备注')
        )
      )
    }

    /* -------------------------------------------------------- 导入弹窗 */

    function normSide(value) {
      const v = String(value || '').trim().toLowerCase()
      if (v === '买入' || v === '买' || v === 'b' || v === 'buy') return '买入'
      if (v === '卖出' || v === '卖' || v === 's' || v === 'sell') return '卖出'
      if (v === '分红' || v === '红利' || v === 'dividend') return '分红'
      return ''
    }

    function parseImport(text) {
      const lines = String(text || '').split(/\\r?\\n/).map((l) => l.trim()).filter(Boolean)
      if (!lines.length) return []
      const isHeader = /日期|date|方向|side|价格|price/i.test(lines[0])
      const head = lines[0].split(',').map((s) => s.trim().toLowerCase())
      const pick = (...names) => head.findIndex((cell) => names.some((n) => cell === n || cell.includes(n)))
      const idx = isHeader
        ? {
            date: pick('日期', 'date'), side: pick('方向', 'side', '买卖'),
            price: pick('价格', 'price', '成交价'), qty: pick('数量', 'qty', '成交量', '股数'),
            fee: pick('费用', 'fee', '手续费', '佣金'), name: pick('股票', '名称', 'name', 'stock')
          }
        : { date: 0, side: 1, price: 2, qty: 3, fee: 4, name: 5 }

      return (isHeader ? lines.slice(1) : lines).map((line) => {
        const cells = line.split(',').map((s) => s.trim())
        const get = (i) => (i >= 0 && cells[i] !== undefined ? cells[i] : '')
        return {
          date: get(idx.date) || today(),
          side: normSide(get(idx.side)),
          price: get(idx.price),
          qty: get(idx.qty),
          fee: get(idx.fee),
          name: get(idx.name)
        }
      }).filter((r) => r.side && Number(r.price) > 0 && Number(r.qty) > 0)
    }

    function matchByPrice(stocks, price) {
      const p = Number(price)
      if (!(p > 0)) return ''
      const hits = stocks.filter((s) => {
        if (Number(s.price) > 0 && Math.abs(Number(s.price) - p) / p < 0.005) return true
        const last = s.records && s.records.length ? s.records[s.records.length - 1] : null
        return last && Math.abs(Number(last.price) - p) / p < 0.005
      })
      return hits.length === 1 ? hits[0].name : ''
    }

    function ImportModal(props) {
      const { stocks, onClose, onImport } = props
      const [text, setText] = useState('')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')

      const parse = (raw) => {
        const parsed = parseImport(raw).map((r) => Object.assign({}, r, {
          name: r.name && stocks.some((s) => s.name === r.name) ? r.name : (r.name || matchByPrice(stocks, r.price))
        }))
        setRows(parsed)
        setNote(parsed.length ? '解析到 ' + parsed.length + ' 条，请核对股票匹配' : '没有解析到有效行，格式示例：2026-11-20,买入,9.50,500,,贵州茅台')
      }

      const pickFile = (file) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => { const raw = String(reader.result || ''); setText(raw); parse(raw) }
        reader.readAsText(file, 'utf-8')
      }

      const setRow = (i, name) => setRows((prev) => prev.map((r, idx) => (idx === i ? Object.assign({}, r, { name }) : r)))
      const unmatched = rows.filter((r) => !r.name).length

      return h(Modal, { title: '导入成交（CSV / 文本）', onClose, maxWidth: 900 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } },
          '每行格式：日期,方向,价格,数量,费用(可空),股票名称(可空)。' +
          '没写股票名称时，会按价格匹配已有持仓（误差 0.5%）；匹配不上或有多只候选时，请在下面手动选。'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
          h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', onChange: (e) => pickFile(e.target.files && e.target.files[0]) }),
          h('button', { className: 'pos-mini', onClick: () => parse(text) }, '解析预览')
        ),
        h('textarea', {
          className: 'pos-input', style: { width: '100%', height: 110, padding: 8, lineHeight: 1.6 },
          placeholder: '2026-11-20,买入,9.50,500,,\\n2026-11-21,卖出,11.00,300,3.20,贵州茅台',
          value: text, onChange: (e) => setText(e.target.value)
        }),
        note ? h('p', { className: 'pos-note' }, note) : null,
        rows.length
          ? h('table', { className: 'pos-import-table' },
              h('thead', null, h('tr', null, ['日期', '方向', '价格', '数量', '费用', '匹配股票'].map((t, i) => h('th', { key: i }, t)))),
              h('tbody', null, rows.map((r, i) => h('tr', { key: i, className: r.name ? '' : 'unmatched' },
                h('td', null, r.date),
                h('td', null, r.side),
                h('td', null, r.price),
                h('td', null, r.qty),
                h('td', null, r.fee || '—'),
                h('td', null, h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, e.target.value) },
                  h('option', { value: '' }, '— 请选择 —'),
                  stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
                ))
              )))
            )
          : null,
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          unmatched ? h('span', { className: 'pos-error', style: { marginRight: 'auto' } }, '还有 ' + unmatched + ' 行未匹配') : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', disabled: !rows.length || unmatched > 0, onClick: () => onImport(rows) }, '确认导入')
        )
      )
    }

    """ + anchor2
assert anchor2 in s
s = s.replace(anchor2, components)

# 4) Page state
old = """      const [form, setForm] = useState({ name: '', date: today(), side: '买入', price: '', qty: '', fee: '' })"""
new = """      const [form, setForm] = useState({ name: '', date: today(), side: '买入', price: '', qty: '', fee: '' })
      const [noteFor, setNoteFor] = useState('')
      const [importOpen, setImportOpen] = useState(false)"""
assert old in s
s = s.replace(old, new)

# 5) 表格单元格：备注列可点
old = """                      columns.map((col) => h('td', { key: col.key }, cellValue(s, col.key))),"""
new = """                      columns.map((col) => {
                        if (col.key === 'note') {
                          return h('td', {
                            key: col.key,
                            className: 'pos-note-cell',
                            title: s.note || '点击添加备注',
                            onClick: (e) => { e.stopPropagation(); setNoteFor(s.name) }
                          }, s.note ? s.note : h('span', { className: 'pos-muted' }, '添加'))
                        }
                        return h('td', { key: col.key }, cellValue(s, col.key))
                      }),"""
assert old in s
s = s.replace(old, new)

# 6) 表单行加「导入」按钮
old = """            h('button', { className: 'pos-btn', onClick: () => setArchiveOpen(true) }, '查看归档持仓' + (view.archived.length ? '（' + view.archived.length + '）' : ''))"""
new = """            h('button', { className: 'pos-btn', onClick: () => setImportOpen(true) }, '导入'),
            h('button', { className: 'pos-btn', onClick: () => setArchiveOpen(true) }, '查看归档持仓' + (view.archived.length ? '（' + view.archived.length + '）' : ''))"""
assert old in s
s = s.replace(old, new)

# 7) 渲染新弹窗
old = """        groupOpen ? h(GroupModal, { stocks: view.stocks, onClose: () => setGroupOpen(false), onSave: saveGroups }) : null,"""
new = """        noteFor ? h(NoteModal, {
          stock: view.stocks.find((s) => s.name === noteFor) || { name: noteFor, note: '' },
          onClose: () => setNoteFor(''),
          onSave: async (note) => { await act('setNote', { name: noteFor, note }); setNoteFor('') }
        }) : null,
        importOpen ? h(ImportModal, {
          stocks: view.stocks.filter((s) => !s.archived),
          onClose: () => setImportOpen(false),
          onImport: async (rows) => {
            for (const r of rows) {
              const payload = { name: r.name, date: r.date, side: r.side, price: r.price, qty: r.qty }
              if (r.fee !== '' && r.side !== '分红') payload.feeOverride = r.fee
              await act('addTrade', payload)
            }
            setImportOpen(false)
            load()
          }
        }) : null,
        groupOpen ? h(GroupModal, { stocks: view.stocks, onClose: () => setGroupOpen(false), onSave: saveGroups }) : null,"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("client note+import patched")
