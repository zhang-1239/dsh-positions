import re
p_client = r"D:\PositionsWorkbench\plugin\client.js"
c = open(p_client, encoding="utf-8").read()
# ---------- 客户端：Ledger 重写 ----------
p_client = r"D:\PositionsWorkbench\plugin\client.js"
c = open(p_client, encoding="utf-8").read()

start = c.index("    function Ledger(props) {")
end = c.index("    /* -------------------------------------------------------- 分组弹窗 */")

ledger = '''    function Ledger(props) {
      const { stock, feeRate, savedRows, onSave, onDeleteRecord } = props
      const [rows, setRows] = useState(() => (savedRows || []).map((r) => Object.assign({}, r)))
      const [dirty, setDirty] = useState(false)
      const base = { cumQty: stock.cumQty, cumInvest: stock.cumInvest }

      const update = (i, field, value) => {
        setRows((prev) => prev.map((row, idx) => (idx === i ? Object.assign({}, row, { [field]: value, saved: false }) : row)))
        setDirty(true)
      }

      const persist = async (next) => {
        setRows(next)
        setDirty(false)
        await onSave(next)
      }

      const saveRow = async (i) => {
        const row = rows[i]
        if (!(Number(row.price) > 0) || !(Number(row.qty) > 0)) return
        await persist(rows.map((r, idx) => (idx === i ? Object.assign({}, r, { saved: true }) : r)))
      }

      const saveAll = async () => {
        const next = rows.map((r) => (Number(r.price) > 0 && Number(r.qty) > 0 ? Object.assign({}, r, { saved: true }) : r))
        await persist(next)
      }

      return h('div', null,
        h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 8 } }, '历史记录 + 测算'),

        h('table', { className: 'pos-list' },
          h('thead', null, h('tr', null,
            ['日期', '方向', '价格', '数量', '费用', '当次含费用投入', '累计数量', '累计投入', '累计成本', '类型']
              .map((t, i) => h('th', { key: i }, t))
          )),
          h('tbody', null,
            stock.records.map((r, i) => h('tr', { key: 'h' + i },
              h('td', null, r.date),
              h('td', null, r.side),
              h('td', null, r.price.toFixed(2)),
              h('td', null, r.qty),
              h('td', null, r.feeFromImport ? r.fee.toFixed(2) + '*' : r.fee.toFixed(2)),
              h('td', null, r.net.toFixed(2)),
              h('td', null, r.cumQty),
              h('td', null, r.cumInvest.toFixed(2)),
              h('td', null, r.cost === null ? '—' : r.cost.toFixed(3)),
              h('td', null,
                h('span', { className: 'pos-chip', style: { height: 22, fontSize: 11 } }, '实际成交'),
                h('button', { className: 'pos-link danger', style: { marginLeft: 6 }, onClick: () => onDeleteRecord(stock.name, r) }, '删除')
              )
            )),

            rows.map((row, i) => {
              const p = previewCalc(base, row, feeRate)
              const valid = Number(row.price) > 0 && Number(row.qty) > 0
              let cls = 'pos-calc-tr'
              if (row.saved) cls += ' saved'
              else if (!valid) cls += ' pending'
              else if (p.error) cls += ' error'

              return h('tr', { key: 'c' + i, className: cls },
                h('td', null, h('span', { className: 'pos-chip', style: { height: 22, fontSize: 11, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '测算 ' + (i + 1))),
                h('td', null, h('select', {
                  className: 'pos-cell-input', value: row.side,
                  onChange: (e) => update(i, 'side', e.target.value)
                }, h('option', { value: '买入' }, '买入'), h('option', { value: '卖出' }, '卖出'))),
                h('td', null, h('input', { className: 'pos-cell-input', type: 'number', step: '0.01', placeholder: '价格', value: row.price, onChange: (e) => update(i, 'price', e.target.value) })),
                h('td', null, h('input', { className: 'pos-cell-input', type: 'number', step: '1', placeholder: '数量', value: row.qty, onChange: (e) => update(i, 'qty', e.target.value) })),
                h('td', null, p.fee),
                h('td', null, p.net),
                h('td', null, p.cumQty),
                h('td', null, p.cumInvest),
                h('td', null, p.cost),
                h('td', null,
                  row.saved
                    ? h('span', { className: 'pos-chip ok', style: { height: 22, fontSize: 11 } }, '已保存')
                    : h('button', { className: 'pos-link', onClick: () => saveRow(i) }, '保存'),
                  h('button', { className: 'pos-link danger', style: { marginLeft: 4 }, onClick: () => { setRows((prev) => prev.filter((_, idx) => idx !== i)); setDirty(true) } }, '删除')
                )
              )
            })
          )
        ),

        h('div', { className: 'pos-calc-actions' },
          h('button', { className: 'pos-mini', onClick: () => { setRows((prev) => prev.concat([{ side: '买入', price: '', qty: '' }])); setDirty(true) } }, '+ 添加一组测算'),
          h('button', { className: 'pos-btn primary', onClick: saveAll }, '保存全部测算')
        ),

        h('p', { className: 'pos-note' }, '测算只用于比较，不写入历史；保存后留在本机。')
      )
    }

'''
c = c[:start] + ledger + c[end:]

# CSS：补 saved / pending / error / chip.ok
old_css = ".pos-calc-tr td { background:#eef4ff !important; }"
new_css = """.pos-calc-tr td { background:#eef4ff; }
    .pos-calc-tr.pending td { background:#f8fafc; color:#667085; }
    .pos-calc-tr.error td { background:#feeceb; }
    .pos-calc-tr.saved td { background:#e8f7f0; }
    .pos-chip.ok { background:#e8f7f0; border-color:#b7e4cf; color:#047857; }"""

c = c.replace(old_css, new_css)

open(p_client, "w", encoding="utf-8", newline="\n").write(c)
print("patched ok")
