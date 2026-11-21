/**
 * 持仓成本台 · 浏览器端
 *
 * v0.3：表头可管理（自定义列/排序/删除）、归档持仓查看、费率规则、分红。
 */
window.__ModuleLoader__.load({
  id: '@zhangxij/dsh-positions',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const API = '/positions'
    const PANEL_ID = 'positions'
    const DEFAULT_RULE = {
      commissionRate: 0.00025,
      minCommission: 5,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
      otherFixed: 0
    }

    /* ------------------------------------------------------------ 计算 */

    function feeOf(rule, side, turnover) {
      const r = rule || DEFAULT_RULE
      const commission = Math.max(turnover * r.commissionRate, r.minCommission)
      const stamp = side === '卖出' ? turnover * r.stampDutyRate : 0
      const transfer = turnover * r.transferFeeRate
      return commission + stamp + transfer + (r.otherFixed || 0)
    }

    function dividendTaxRate(records, date) {
      const buys = (records || [])
        .filter((r) => r.side === '买入' && String(r.date) <= String(date))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      if (!buys.length) return 0.2
      const days = Math.floor((new Date(date).getTime() - new Date(buys[0].date).getTime()) / 86400000)
      if (days <= 30) return 0.2
      if (days <= 365) return 0.1
      return 0
    }

    function calcRecords(records, rule) {
      let cumQty = 0
      let cumInvest = 0
      const source = records || []
      return source
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => {
          const turnover = Number(r.price) * Number(r.qty)
          if (r.side === '分红') {
            const taxRate = r.taxRate != null ? Number(r.taxRate) : dividendTaxRate(source, r.date)
            const tax = turnover * taxRate
            const net = turnover - tax
            cumInvest -= net
            return {
              date: r.date, side: '分红', price: Number(r.price), qty: Number(r.qty),
              fee: tax, net, cumQty, cumInvest,
              cost: cumQty > 0 ? cumInvest / cumQty : null, taxRate, feeFromImport: false
            }
          }
          const fee = r.feeOverride !== undefined && r.feeOverride !== null ? Number(r.feeOverride) : feeOf(rule, r.side, turnover)
          const net = r.side === '买入' ? turnover + fee : turnover - fee
          if (r.side === '买入') { cumQty += Number(r.qty); cumInvest += net }
          else { cumQty -= Number(r.qty); cumInvest -= net }
          return {
            date: r.date, side: r.side, price: Number(r.price), qty: Number(r.qty),
            fee, net, cumQty, cumInvest,
            cost: cumQty > 0 ? cumInvest / cumQty : null,
            feeFromImport: r.feeOverride !== undefined
          }
        })
    }

    function previewCalc(base, row, rule) {
      const price = Number(row.price)
      const qty = Number(row.qty)
      if (!(price > 0) || !(qty > 0)) return { fee: '—', net: '—', cumQty: '—', cumInvest: '—', cost: '—', error: '' }
      const turnover = price * qty
      const fee = feeOf(rule, row.side, turnover)
      const net = row.side === '卖出' ? turnover - fee : turnover + fee
      if (row.side === '卖出' && qty > base.cumQty) return { fee: '—', net: '—', cumQty: '—', cumInvest: '—', cost: '超量', error: '超量' }
      const q = row.side === '买入' ? base.cumQty + qty : base.cumQty - qty
      const invest = row.side === '买入' ? base.cumInvest + net : base.cumInvest - net
      return {
        fee: fee.toFixed(2), net: net.toFixed(2), cumQty: q, cumInvest: invest.toFixed(2),
        cost: q > 0 ? (invest / q).toFixed(3) : '—', error: ''
      }
    }

    const money = (v) => '¥' + Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const signed = (v) => {
      const n = Number(v || 0)
      return (n >= 0 ? '+' : '-') + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    const today = () => new Date().toISOString().slice(0, 10)
    const rawIndexOf = (state, name, row) => {
      const stock = state.stocks.find((s) => s.name === name)
      if (!stock) return -1
      return stock.records.findIndex(
        (r) => r.date === row.date && r.side === row.side && Number(r.price) === Number(row.price) && Number(r.qty) === Number(row.qty)
      )
    }

    function cellValue(s, key) {
      switch (key) {
        case 'stock': return s.name
        case 'date': return s.last ? s.last.date : '—'
        case 'side': return s.last ? s.last.side : '—'
        case 'price': return s.last ? s.last.price.toFixed(2) : '—'
        case 'qty': return s.last ? s.last.qty : '—'
        case 'fee': return s.last ? s.last.fee.toFixed(2) : '—'
        case 'net': return s.last ? s.last.net.toFixed(2) : '—'
        case 'cumQty': return s.cumQty
        case 'cumInvest': return s.cumInvest.toFixed(2)
        case 'cost': return s.last && s.last.cost !== null ? s.last.cost.toFixed(3) : '—'
        default: return (s.fields && s.fields[key]) || '—'
      }
    }

    /* -------------------------------------------------------------- CSS */

    const CSS = `
.pos-root { display:flex; flex-direction:column; height:100%; min-height:0; overflow:auto;
  background:#f5f7fb; color:#1f2937; font-size:13px; line-height:1.55; }
.pos-root * { box-sizing:border-box; }
.pos-wrap { max-width:1320px; width:100%; margin:0 auto; padding:18px 24px 48px; }
.pos-title { margin:0; font-size:20px; font-weight:600; color:#1f2937; }
.pos-sub { margin:4px 0 0; font-size:12px; color:#667085; }
.pos-head { display:flex; align-items:flex-start; gap:16px; margin-bottom:12px; }
.pos-head-actions { margin-left:auto; display:flex; gap:8px; }
.pos-btn { height:32px; padding:0 12px; border-radius:8px; font-size:12px; cursor:pointer;
  border:1px solid #dde3ee; background:#fff; color:#1f2937; }
.pos-btn:hover { border-color:#2457d6; color:#2457d6; }
.pos-btn.primary { background:#2457d6; border-color:#2457d6; color:#fff; }
.pos-btn.primary:hover { background:#1d4ac0; color:#fff; }
.pos-btn:disabled { opacity:.5; cursor:default; }
.pos-card { background:#fff; border:1px solid #dde3ee; border-radius:12px; }
.pos-form { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 12px; margin-bottom:12px; }
.pos-input, .pos-select { height:30px; border-radius:8px; border:1px solid #dde3ee; background:#fff; color:#1f2937; padding:0 8px; font-size:12px; }
.pos-input.num { width:100px; text-align:right; }
.pos-filters { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.pos-filter { flex:1 1 320px; padding:10px 12px; }
.pos-filter-head { display:flex; align-items:center; justify-content:space-between; font-weight:600; font-size:13px; margin-bottom:8px; gap:8px; }
.pos-chips { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.pos-chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:999px;
  border:1px solid #dde3ee; background:#fff; font-size:12px; color:#344054; }
.pos-chip .n { color:#667085; font-size:11px; }
.pos-chip.ok { background:#e8f7f0; border-color:#b7e4cf; color:#047857; }
.pos-mini { font-size:12px; padding:0 10px; height:26px; border-radius:8px; cursor:pointer; border:1px solid #dde3ee; background:#fff; color:#1f2937; }
.pos-mini:hover { border-color:#2457d6; color:#2457d6; }
.pos-mini:disabled { opacity:.4; cursor:default; }
.pos-link { border:none; background:none; color:#2457d6; cursor:pointer; font-size:12px; padding:0 4px; }
.pos-link:hover { text-decoration:underline; }
.pos-link.danger { color:#b42318; }
.pos-table-wrap { overflow:auto; background:#fff; border:1px solid #dde3ee; border-radius:12px; }
.pos-table { width:100%; border-collapse:collapse; font-size:13px; white-space:nowrap; }
.pos-table th, .pos-table td { padding:8px 10px; text-align:left; border-bottom:1px solid #eef1f6; }
.pos-table th { background:#f8fafc; font-weight:600; color:#344054; }
.pos-table tr:last-child td { border-bottom:none; }
.pos-group td { background:#f8fafc; }
.pos-group-inner { display:flex; align-items:center; gap:18px; flex-wrap:wrap; font-size:12px; color:#475467; }
.pos-tag { display:inline-block; padding:2px 10px; border-radius:6px; border:1px solid; font-size:12px; font-weight:600; }
.pos-muted { color:#667085; }
.pos-up { color:#b42318; }
.pos-down { color:#047857; }
.pos-row { cursor:pointer; }
.pos-row:hover td { background:#f8faff; }
.pos-row.archived td { color:#98a2b3; }
.pos-detail td { background:#f8fafc; padding:0 !important; }
.pos-detail-box { padding:14px 16px 18px; }
.pos-list { width:100%; border-collapse:collapse; font-size:12px; background:#fff; border:1px solid #eef1f6; border-radius:10px; overflow:hidden; }
.pos-list th, .pos-list td { padding:7px 10px; text-align:left; border-bottom:1px solid #eef1f6; }
.pos-list th { background:#f8fafc; font-weight:600; color:#475467; }
.pos-list tr:last-child td { border-bottom:none; }
.pos-calc-tr td { background:#eef4ff; }
.pos-calc-tr.pending td { background:#f8fafc; color:#667085; }
.pos-calc-tr.error td { background:#feeceb; }
.pos-calc-tr.saved td { background:#e8f7f0; }
.pos-cell-input { width:100%; min-width:70px; border:1px solid #dde3ee; border-radius:6px; background:#fff; color:#1f2937; padding:4px 6px; font-size:12px; }
.pos-calc-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
.pos-note { font-size:11px; color:#98a2b3; margin:8px 0 0; }
.pos-empty { padding:48px; text-align:center; color:#667085; }
.pos-error { color:#b42318; font-size:12px; margin-bottom:8px; }
.pos-mask { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:60; display:flex; align-items:center; justify-content:center; padding:24px; }
.pos-modal { width:100%; max-width:1120px; max-height:88vh; overflow:auto; background:#fff; border-radius:14px;
  box-shadow:0 24px 60px rgba(0,0,0,.28); color:#1f2937; }
.pos-modal-head { position:sticky; top:0; display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 16px; background:#fff; border-bottom:1px solid #dde3ee; }
.pos-modal-head strong { font-size:15px; }
.pos-modal-body { padding:14px 16px 20px; }
.pos-grow { display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid #eef1f6; }
.pos-grow:last-child { border-bottom:none; }
.pos-grow .name { min-width:110px; font-weight:600; }
.pos-grow .pos-input { width:120px; }
.pos-col-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eef1f6; }
.pos-col-row:last-child { border-bottom:none; }
.pos-col-row .label { flex:1; font-weight:600; }
.pos-fee-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 16px; }
.pos-fee-field { display:flex; flex-direction:column; gap:4px; }
.pos-fee-field label { font-size:11px; color:#667085; }
.pos-fee-field .unit { font-size:11px; color:#98a2b3; margin-left:4px; }
.pos-fee-preview { margin-top:6px; border:1px solid #dde3ee; border-radius:8px; padding:8px; background:#fbfcff; }
.pos-fee-preview img { max-width:100%; max-height:180px; border-radius:6px; display:block; }
`

    /* ------------------------------------------------------------ 图标 */

    function Icon(props) {
      const size = props?.size || 16
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M5 7.2h6M5 9.8h4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
      )
    }

    function Modal(props) {
      return h('div', { className: 'pos-mask', onClick: (e) => { if (e.target === e.currentTarget) props.onClose() } },
        h('div', { className: 'pos-modal', style: props.maxWidth ? { maxWidth: props.maxWidth } : undefined },
          h('div', { className: 'pos-modal-head' },
            h('strong', null, props.title),
            h('button', { className: 'pos-btn', onClick: props.onClose }, '关闭')
          ),
          h('div', { className: 'pos-modal-body' }, props.children)
        )
      )
    }

    /* --------------------------------------------------- 历史 + 测算表 */

    function Ledger(props) {
      const { stock, rule, savedRows, onSave, onDeleteRecord, customColumns, onSetField } = props
      const [rows, setRows] = useState(() => (savedRows || []).map((r) => Object.assign({}, r)))
      const [dirty, setDirty] = useState(false)
      const base = { cumQty: stock.cumQty, cumInvest: stock.cumInvest }

      const update = (i, field, value) => {
        setRows((prev) => prev.map((row, idx) => (idx === i ? Object.assign({}, row, { [field]: value, saved: false }) : row)))
        setDirty(true)
      }
      const persist = async (next) => { setRows(next); setDirty(false); await onSave(next) }
      const saveRow = async (i) => {
        const row = rows[i]
        if (!(Number(row.price) > 0) || !(Number(row.qty) > 0)) return
        await persist(rows.map((r, idx) => (idx === i ? Object.assign({}, r, { saved: true }) : r)))
      }
      const saveAll = async () => {
        await persist(rows.map((r) => (Number(r.price) > 0 && Number(r.qty) > 0 ? Object.assign({}, r, { saved: true }) : r)))
      }

      return h('div', null,
        customColumns && customColumns.length
          ? h('div', { className: 'pos-calc-row', style: { marginBottom: 10 } },
              customColumns.map((col) => h('label', { key: col.key, style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 } },
                h('span', { className: 'pos-muted' }, col.label),
                h('input', {
                  className: 'pos-input', style: { width: 160 }, defaultValue: (stock.fields && stock.fields[col.key]) || '',
                  onBlur: (e) => onSetField && onSetField(stock.name, col.key, e.target.value)
                })
              ))
            )
          : null,

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
                h('span', { className: 'pos-chip', style: { height: 22, fontSize: 11 } },
                  r.side === '分红' ? '分红 ' + Math.round((r.taxRate || 0) * 100) + '% 税' : '实际成交'),
                h('button', { className: 'pos-link danger', style: { marginLeft: 6 }, onClick: () => onDeleteRecord(stock.name, r) }, '删除')
              )
            )),

            rows.map((row, i) => {
              const p = previewCalc(base, row, rule)
              const valid = Number(row.price) > 0 && Number(row.qty) > 0
              let cls = 'pos-calc-tr'
              if (row.saved) cls += ' saved'
              else if (!valid) cls += ' pending'
              else if (p.error) cls += ' error'
              return h('tr', { key: 'c' + i, className: cls },
                h('td', null, h('span', { className: 'pos-chip', style: { height: 22, fontSize: 11, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '测算 ' + (i + 1))),
                h('td', null, h('select', { className: 'pos-cell-input', value: row.side, onChange: (e) => update(i, 'side', e.target.value) },
                  h('option', { value: '买入' }, '买入'), h('option', { value: '卖出' }, '卖出'))),
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

    /* -------------------------------------------------------- 分组弹窗 */

    function GroupModal(props) {
      const { stocks, onClose, onSave } = props
      const [draft, setDraft] = useState(() => {
        const map = {}
        stocks.forEach((s) => { map[s.name] = { group: s.group || '', price: s.price ?? '', dayPnl: s.dayPnl ?? '' } })
        return map
      })

      return h(Modal, { title: '股票分组管理', onClose, maxWidth: 760 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } },
          '给股票输入组名，例如「红」「双底」；留空表示不分组。相同组名在表格中合并为同一分组行。'),
        h('datalist', { id: 'pos-group-options' },
          Array.from(new Set(stocks.map((s) => s.group).filter(Boolean))).map((g) => h('option', { key: g, value: g }))
        ),
        stocks.map((s) => h('div', { key: s.name, className: 'pos-grow' },
          h('span', { className: 'name' }, s.name),
          h('input', { className: 'pos-input', list: 'pos-group-options', placeholder: '组名（可空）', value: draft[s.name].group,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { group: e.target.value }) })) }),
          h('span', { className: 'pos-muted' }, '现价'),
          h('input', { className: 'pos-input num', type: 'number', step: '0.01', value: draft[s.name].price,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { price: e.target.value }) })) }),
          h('span', { className: 'pos-muted' }, '当日盈亏'),
          h('input', { className: 'pos-input num', type: 'number', step: '0.01', value: draft[s.name].dayPnl,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { dayPnl: e.target.value }) })) })
        )),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', onClick: () => onSave(draft) }, '保存分组')
        )
      )
    }

    /* -------------------------------------------------------- 表头管理 */

    function HeaderModal(props) {
      const { state, onClose, onPatch } = props
      const [label, setLabel] = useState('')

      return h(Modal, { title: '表头管理', onClose, maxWidth: 640 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } },
          '可以新增自定义列（例如「股票代码」「备注」），调整顺序；内置列不能删除。'),
        state.columns.map((col, index) => h('div', { key: col.key, className: 'pos-col-row' },
          h('span', { className: 'label' }, col.label, col.builtin ? h('span', { className: 'pos-muted', style: { marginLeft: 6, fontSize: 11 } }, '内置') : h('span', { className: 'pos-muted', style: { marginLeft: 6, fontSize: 11 } }, '自定义')),
          h('button', { className: 'pos-mini', disabled: index === 0, onClick: () => onPatch('moveColumn', { key: col.key, dir: -1 }) }, '↑'),
          h('button', { className: 'pos-mini', disabled: index === state.columns.length - 1, onClick: () => onPatch('moveColumn', { key: col.key, dir: 1 }) }, '↓'),
          col.builtin ? null : h('button', { className: 'pos-link danger', onClick: () => onPatch('deleteColumn', { key: col.key }) }, '删除')
        )),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
          h('input', { className: 'pos-input', style: { flex: 1 }, placeholder: '新列名称，例如：股票代码', value: label, onChange: (e) => setLabel(e.target.value) }),
          h('button', { className: 'pos-btn primary', onClick: async () => { if (!label.trim()) return; await onPatch('addColumn', { label: label.trim() }); setLabel('') } }, '添加列')
        )
      )
    }

    /* -------------------------------------------------------- 归档弹窗 */

    function ArchiveModal(props) {
      const { stocks, rule, state, onClose, onAct, onSetField, customColumns } = props
      const [selected, setSelected] = useState(stocks[0] ? stocks[0].name : '')
      const stock = stocks.find((s) => s.name === selected)

      return h(Modal, { title: '归档持仓（数据保留，不参与统计）', onClose, maxWidth: 1000 },
        stocks.length === 0
          ? h('div', { className: 'pos-empty' }, '还没有归档的股票。')
          : h('div', null,
              h('div', { className: 'pos-chips', style: { marginBottom: 12 } },
                stocks.map((s) => h('button', {
                  key: s.name,
                  className: 'pos-chip',
                  'data-on': s.name === selected ? 'true' : 'false',
                  style: s.name === selected ? { borderColor: '#2457d6', color: '#2457d6' } : undefined,
                  onClick: () => setSelected(s.name)
                }, s.name))
              ),
              stock
                ? h('div', null,
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 } },
                      h('strong', null, stock.name),
                      h('span', { className: 'pos-muted' }, (stock.group || '未分组') + ' · ' + stock.records.length + ' 笔成交 · 成本 ' + (stock.last && stock.last.cost !== null ? stock.last.cost.toFixed(3) : '—')),
                      h('button', { className: 'pos-btn', style: { marginLeft: 'auto' }, onClick: () => onAct('unarchiveStock', { name: stock.name }) }, '恢复'),
                      h('button', { className: 'pos-btn', style: { color: '#b42318', borderColor: '#fecdca' }, onClick: () => { if (window.confirm('删除「' + stock.name + '」及其全部成交？')) onAct('deleteStock', { name: stock.name }) } }, '删除')
                    ),
                    h(Ledger, {
                      stock, rule,
                      savedRows: state.calc[stock.name],
                      onSave: (rows) => onAct('saveCalc', { name: stock.name, rows }),
                      onDeleteRecord: (name, row) => onAct('deleteRecord', { name, index: rawIndexOf(state, name, row), match: { date: row.date, side: row.side, price: row.price, qty: row.qty } }),
                      customColumns,
                      onSetField
                    })
                  )
                : null
            )
      )
    }

    /* -------------------------------------------------------- 费率弹窗 */

    const pct = (v, digits) => (Number(v) * 100).toFixed(digits)
    const toDraft = (rule) => ({
      id: rule.id, name: rule.name,
      commission: pct(rule.commissionRate, 4), min: String(rule.minCommission),
      stamp: pct(rule.stampDutyRate, 3), transfer: pct(rule.transferFeeRate, 4),
      other: String(rule.otherFixed), note: rule.note || '', image: rule.image || ''
    })

    function FeeModal(props) {
      const { state, onClose, onPatch } = props
      const active = state.feeRules.find((r) => r.id === state.activeFeeRule) || state.feeRules[0]
      const [draft, setDraft] = useState(() => toDraft(active))
      const [saved, setSaved] = useState(false)
      const set = (key, value) => { setDraft(Object.assign({}, draft, { [key]: value })); setSaved(false) }

      const save = async () => {
        await onPatch('saveFeeRule', {
          rule: {
            id: draft.id, name: draft.name.trim() || '未命名券商',
            commissionRate: Number(draft.commission) / 100, minCommission: Number(draft.min),
            stampDutyRate: Number(draft.stamp) / 100, transferFeeRate: Number(draft.transfer) / 100,
            otherFixed: Number(draft.other), note: draft.note, image: draft.image
          }
        })
        setSaved(true)
      }
      const createRule = async () => {
        const rule = { id: 'rule-' + Date.now(), name: '新券商', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: '', image: '' }
        await onPatch('saveFeeRule', { rule })
        await onPatch('setActiveFeeRule', { id: rule.id })
        setDraft(toDraft(rule)); setSaved(false)
      }
      const removeRule = async () => {
        if (state.feeRules.length <= 1) return
        await onPatch('deleteFeeRule', { id: draft.id })
        const next = state.feeRules.find((r) => r.id !== draft.id)
        if (next) { setDraft(toDraft(next)); setSaved(false) }
      }
      const pickRule = async (id) => {
        await onPatch('setActiveFeeRule', { id })
        const rule = state.feeRules.find((r) => r.id === id)
        if (rule) { setDraft(toDraft(rule)); setSaved(false) }
      }
      const upload = (file) => {
        if (!file) return
        if (file.size > 300 * 1024) { window.alert('图片请小于 300KB，作为参考即可'); return }
        const reader = new FileReader()
        reader.onload = () => set('image', String(reader.result || ''))
        reader.readAsDataURL(file)
      }
      const field = (label, key, unit) => h('div', { className: 'pos-fee-field' },
        h('label', null, label, unit ? h('span', { className: 'unit' }, unit) : null),
        h('input', { className: 'pos-input', value: draft[key], onChange: (e) => set(key, e.target.value) })
      )

      return h(Modal, { title: '费率规则', onClose, maxWidth: 720 },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 } },
          h('span', { className: 'pos-muted' }, '当前使用：'),
          h('select', { className: 'pos-select', value: draft.id, onChange: (e) => pickRule(e.target.value) },
            state.feeRules.map((r) => h('option', { key: r.id, value: r.id }, r.name))),
          h('button', { className: 'pos-mini', onClick: createRule }, '+ 新建规则'),
          h('button', { className: 'pos-mini', onClick: removeRule, disabled: state.feeRules.length <= 1 }, '删除此规则')
        ),
        h('div', { className: 'pos-fee-grid' },
          field('规则名称', 'name'),
          field('佣金率', 'commission', '%'),
          field('最低佣金（元）', 'min'),
          field('印花税率（仅卖出）', 'stamp', '%'),
          field('过户费率', 'transfer', '%'),
          field('其他固定费用（元/笔）', 'other')
        ),
        h('div', { className: 'pos-fee-field', style: { marginTop: 10 } },
          h('label', null, '备注'),
          h('input', { className: 'pos-input', value: draft.note, onChange: (e) => set('note', e.target.value) })
        ),
        h('div', { style: { marginTop: 12 } },
          h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 6 } }, '券商费率截图（可选，仅作参考，数值请手填）'),
          h('input', { type: 'file', accept: 'image/*', onChange: (e) => upload(e.target.files && e.target.files[0]) }),
          draft.image ? h('div', { className: 'pos-fee-preview' }, h('img', { src: draft.image, alt: '券商费率截图' })) : null
        ),
        h('p', { className: 'pos-note' },
          '买入：佣金（不低于最低佣金）+ 过户费；卖出再加印花税；分红：按持股期自动估红利税（≤1 月 20%、≤1 年 10%、>1 年 0）。默认按东方财富标准。'),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          saved ? h('span', { className: 'pos-chip ok', style: { height: 26 } }, '已保存') : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '关闭'),
          h('button', { className: 'pos-btn primary', onClick: save }, '保存费率')
        )
      )
    }

    /* -------------------------------------------------------------- 页面 */

    function Page() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [expanded, setExpanded] = useState('')
      const [calcFor, setCalcFor] = useState('')
      const [groupOpen, setGroupOpen] = useState(false)
      const [feeOpen, setFeeOpen] = useState(false)
      const [headerOpen, setHeaderOpen] = useState(false)
      const [archiveOpen, setArchiveOpen] = useState(false)
      const [busy, setBusy] = useState(false)
      const [form, setForm] = useState({ name: '', date: today(), side: '买入', price: '', qty: '', fee: '' })

      const load = () => {
        fetch(API + '/state', { cache: 'no-store' })
          .then((res) => res.json())
          .then((json) => {
            if (!json.ok) throw new Error(json.error || '读取失败')
            setData(json)
            setError('')
          })
          .catch((err) => setError(String(err.message || err)))
      }

      useEffect(() => { load() }, [])

      const act = async (type, payload) => {
        setBusy(true)
        try {
          const res = await fetch(API + '/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type, payload })
          })
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || '操作失败')
          setData((prev) => Object.assign({}, prev, { state: json.state }))
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const state = data && data.state
      const rule = state ? state.feeRules.find((r) => r.id === state.activeFeeRule) || state.feeRules[0] : DEFAULT_RULE

      const view = useMemo(() => {
        if (!state) return null
        const stocks = state.stocks.map((s) => {
          const records = calcRecords(s.records, rule)
          const last = records.length ? records[records.length - 1] : null
          const cumQty = last ? last.cumQty : 0
          const cumInvest = last ? last.cumInvest : 0
          const mv = Number(s.price || 0) * cumQty
          return Object.assign({}, s, { records, cumQty, cumInvest, last, mv })
        })
        const visible = stocks.filter((s) => !s.archived)
        const totalMv = visible.reduce((sum, s) => sum + s.mv, 0)
        const groups = []
        const index = new Map()
        visible.forEach((s) => {
          const name = s.group || '未分组'
          if (!index.has(name)) { index.set(name, { name, stocks: [], mv: 0, pnl: 0 }); groups.push(index.get(name)) }
          const group = index.get(name)
          group.stocks.push(s)
          group.mv += s.mv
          group.pnl += Number(s.dayPnl || 0)
        })
        groups.forEach((g) => { g.pos = totalMv > 0 ? (g.mv / totalMv) * 100 : null })
        return { stocks, visible, archived: stocks.filter((s) => s.archived), groups, totalMv, names: stocks }
      }, [state, rule])

      if (error && !data) {
        return h('div', { className: 'pos-root' }, h('style', null, CSS),
          h('div', { className: 'pos-empty' }, h('p', null, '读取失败：' + error), h('button', { className: 'pos-btn', onClick: load }, '重试')))
      }
      if (!data || !view) {
        return h('div', { className: 'pos-root' }, h('style', null, CSS), h('div', { className: 'pos-empty' }, '加载中…'))
      }

      const columns = state.columns
      const colSpan = columns.length + 1
      const customColumns = columns.filter((c) => !c.builtin)
      const calcStock = calcFor ? view.stocks.find((s) => s.name === calcFor) : null

      const addTrade = async () => {
        if (!form.name.trim() || !form.price || !form.qty) return
        const payload = { name: form.name.trim(), date: form.date || today(), side: form.side, price: form.price, qty: form.qty }
        if (form.side !== '分红' && form.fee !== '') payload.feeOverride = form.fee
        await act('addTrade', payload)
        setForm(Object.assign({}, form, { price: '', qty: '', fee: '' }))
      }

      const saveGroups = async (draft) => {
        for (const name of Object.keys(draft)) {
          const stock = state.stocks.find((s) => s.name === name)
          if (!stock) continue
          const next = draft[name]
          if ((stock.group || '') !== (next.group || '').trim()) await act('setGroup', { name, group: next.group })
          if (String(stock.price ?? '') !== String(next.price)) await act('setPrice', { name, price: next.price })
          if (String(stock.dayPnl ?? '') !== String(next.dayPnl)) await act('setDayPnl', { name, dayPnl: next.dayPnl })
        }
        setGroupOpen(false)
      }

      const removeStock = (name) => {
        if (!window.confirm('删除「' + name + '」及其全部成交记录？此操作不可恢复。')) return
        act('deleteStock', { name })
      }

      const ledgerProps = (s) => ({
        stock: s,
        rule,
        savedRows: state.calc[s.name],
        customColumns,
        onSetField: (name, key, value) => act('setField', { name, key, value }),
        onSave: (rows) => act('saveCalc', { name: s.name, rows }),
        onDeleteRecord: (name, row) => act('deleteRecord', { name, index: rawIndexOf(state, name, row), match: { date: row.date, side: row.side, price: row.price, qty: row.qty } })
      })

      const opsCell = (s) => h('td', null,
        s.archived
          ? h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); setArchiveOpen(true) } }, '查看')
          : h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); setCalcFor(s.name) } }, '测算'),
        s.archived ? null : h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); setExpanded(expanded === s.name ? '' : s.name) } }, expanded === s.name ? '收起' : '展开'),
        s.archived ? null : h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); act('archiveStock', { name: s.name }) } }, '归档'),
        h('button', { className: 'pos-link danger', onClick: (e) => { e.stopPropagation(); removeStock(s.name) } }, '删除')
      )

      return h('div', { className: 'pos-root' },
        h('style', null, CSS),
        h('div', { className: 'pos-wrap' },

          h('div', { className: 'pos-head' },
            h('div', null,
              h('h1', { className: 'pos-title' }, '持仓成本台'),
              h('p', { className: 'pos-sub' }, '只记你自己的持仓与成交，不含行情 · 数据目录 ' + (data.dataDir || ''))
            ),
            h('div', { className: 'pos-head-actions' },
              h('button', { className: 'pos-btn', onClick: () => setFeeOpen(true) }, '费率'),
              h('button', { className: 'pos-btn', onClick: load, disabled: busy }, '刷新')
            )
          ),

          error ? h('div', { className: 'pos-error' }, error) : null,

          h('div', { className: 'pos-card pos-form' },
            h('span', { className: 'pos-muted' }, '记一笔'),
            h('input', { className: 'pos-input', placeholder: '股票名称', value: form.name, list: 'pos-names',
              onChange: (e) => setForm(Object.assign({}, form, { name: e.target.value })) }),
            h('datalist', { id: 'pos-names' }, view.names.map((s) => h('option', { key: s.name, value: s.name }))),
            h('input', { className: 'pos-input', type: 'date', value: form.date,
              onChange: (e) => setForm(Object.assign({}, form, { date: e.target.value })) }),
            h('select', { className: 'pos-select', value: form.side,
              onChange: (e) => setForm(Object.assign({}, form, { side: e.target.value })) },
              h('option', { value: '买入' }, '买入'), h('option', { value: '卖出' }, '卖出'), h('option', { value: '分红' }, '分红')),
            h('input', { className: 'pos-input num', type: 'number', step: '0.01', placeholder: form.side === '分红' ? '每股分红' : '价格', value: form.price,
              onChange: (e) => setForm(Object.assign({}, form, { price: e.target.value })) }),
            h('input', { className: 'pos-input num', type: 'number', step: '1', placeholder: form.side === '分红' ? '股数' : '数量', value: form.qty,
              onChange: (e) => setForm(Object.assign({}, form, { qty: e.target.value })) }),
            form.side === '分红'
              ? h('span', { className: 'pos-muted', style: { fontSize: 11 } }, '红利税按持股期自动估算')
              : h('input', { className: 'pos-input num', type: 'number', step: '0.01', placeholder: '费用(可空)', value: form.fee,
                  onChange: (e) => setForm(Object.assign({}, form, { fee: e.target.value })) }),
            h('button', { className: 'pos-btn primary', onClick: addTrade, disabled: busy }, '新增'),
            h('button', { className: 'pos-btn', onClick: () => setArchiveOpen(true) }, '查看归档持仓' + (view.archived.length ? '（' + view.archived.length + '）' : ''))
          ),

          h('div', { className: 'pos-filters' },
            h('div', { className: 'pos-card pos-filter' },
              h('div', { className: 'pos-filter-head' },
                h('span', null, '分组管理'),
                h('button', { className: 'pos-mini', onClick: () => setGroupOpen(true) }, '编辑分组')
              ),
              h('div', { className: 'pos-chips' },
                view.groups.map((g) => h('span', { key: g.name, className: 'pos-chip' },
                  g.name, h('span', { className: 'n' }, String(g.stocks.length))))
              )
            ),
            h('div', { className: 'pos-card pos-filter' },
              h('div', { className: 'pos-filter-head' },
                h('span', null, '表头管理'),
                h('button', { className: 'pos-mini', onClick: () => setHeaderOpen(true) }, '管理表头')
              ),
              h('div', { className: 'pos-chips' },
                columns.map((col) => h('span', { key: col.key, className: 'pos-chip' },
                  col.label, col.builtin ? null : h('span', { className: 'n' }, '自定义')))
              )
            )
          ),

          h('div', { className: 'pos-table-wrap' },
            h('table', { className: 'pos-table' },
              h('thead', null, h('tr', null,
                columns.map((col) => h('th', { key: col.key }, col.label)),
                h('th', null, '操作')
              )),
              h('tbody', null,
                view.groups.map((group) => [
                  h('tr', { key: 'g-' + group.name, className: 'pos-group' },
                    h('td', { colSpan: colSpan },
                      h('div', { className: 'pos-group-inner' },
                        h('span', { className: 'pos-tag', style: { color: '#b42318', borderColor: '#fecdca' } }, group.name || '未分组'),
                        h('span', null, '市值 ' + money(group.mv)),
                        h('span', { className: group.pnl >= 0 ? 'pos-up' : 'pos-down' }, signed(group.pnl)),
                        h('span', null, '仓位 ' + (group.pos === null ? '—' : group.pos.toFixed(2) + '%')),
                        h('span', { className: 'pos-muted' }, group.stocks.length + ' 只')
                      )
                    )
                  ),
                  ...group.stocks.map((s) => {
                    const isOpen = expanded === s.name
                    const rows = []
                    rows.push(h('tr', { key: 's-' + s.name, className: 'pos-row', onClick: () => setExpanded(isOpen ? '' : s.name) },
                      columns.map((col) => h('td', { key: col.key }, cellValue(s, col.key))),
                      opsCell(s)
                    ))
                    if (isOpen && !s.archived) {
                      rows.push(h('tr', { key: 'd-' + s.name, className: 'pos-detail' },
                        h('td', { colSpan: colSpan }, h('div', { className: 'pos-detail-box' }, h(Ledger, ledgerProps(s))))
                      ))
                    }
                    return rows
                  })
                ]),

                view.archived.length
                  ? h('tr', { key: 'archived-head', className: 'pos-group' },
                      h('td', { colSpan: colSpan },
                        h('div', { className: 'pos-group-inner' },
                          h('span', { className: 'pos-tag', style: { color: '#667085', borderColor: '#d0d5dd' } }, '已归档 ' + view.archived.length + ' 只'),
                          h('button', { className: 'pos-mini', onClick: () => setArchiveOpen(true) }, '查看归档持仓')
                        )))
                  : null
              )
            )
          ),

          view.visible.length === 0 ? h('div', { className: 'pos-empty' }, '还没有持仓，用上方的「记一笔」开始。') : null,

          h('p', { className: 'pos-note' },
            '费用按「费率」里的规则计算（默认东方财富：佣金万 2.5、最低 5 元；卖出印花税 0.05%；过户费 0.001%）。历史里写了费用就优先用记录值（* 号标注）。')
        ),

        groupOpen ? h(GroupModal, { stocks: view.stocks, onClose: () => setGroupOpen(false), onSave: saveGroups }) : null,
        headerOpen ? h(HeaderModal, { state, onClose: () => setHeaderOpen(false), onPatch: act }) : null,
        feeOpen ? h(FeeModal, { state, onClose: () => setFeeOpen(false), onPatch: act }) : null,
        archiveOpen ? h(ArchiveModal, {
          stocks: view.archived,
          rule,
          state,
          customColumns,
          onSetField: (name, key, value) => act('setField', { name, key, value }),
          onClose: () => setArchiveOpen(false),
          onAct: act
        }) : null,

        calcStock ? h(Modal, { title: calcStock.name + ' · 历史记录与测算', onClose: () => setCalcFor('') },
          h(Ledger, ledgerProps(calcStock))
        ) : null
      )
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 8, label: () => '持仓成本台' }, Icon)
      )
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(Page))
      )
    }

    return { inject: ['slots'], apply }
  }
})
