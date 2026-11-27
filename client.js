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

    function resolveCategory(rule, stock) {
      const categories = rule && Array.isArray(rule.categories) ? rule.categories : []
      if (!categories.length) return DEFAULT_RULE
      if (stock && stock.variant) {
        const hit = categories.find((c) => c.id === stock.variant)
        if (hit) return hit
      }
      return categories[0]
    }

    function calcRecords(records, category) {
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
          const fee = r.feeOverride !== undefined && r.feeOverride !== null ? Number(r.feeOverride) : feeOf(category, r.side, turnover)
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

    function previewCalc(base, row, category) {
      const price = Number(row.price)
      const qty = Number(row.qty)
      if (!(price > 0) || !(qty > 0)) return { fee: '—', net: '—', cumQty: '—', cumInvest: '—', cost: '—', error: '' }
      const turnover = price * qty
      const fee = feeOf(category, row.side, turnover)
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
        case 'note': return s.note || ''
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
.pos-form { display:flex; gap:8px; align-items:center; flex-wrap:nowrap; overflow-x:auto; padding:10px 12px; margin-bottom:12px; }
.pos-input, .pos-select { height:30px; border-radius:8px; border:1px solid #dde3ee; background:#fff; color:#1f2937; padding:0 8px; font-size:12px; }
.pos-input.num { width:84px; text-align:right; }
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
.pos-list th, .pos-list td { padding:7px 10px; text-align:center; border-bottom:1px solid #eef1f6; }
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
.pos-note-cell { max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#2457d6; cursor:pointer; }
.pos-note-cell:hover { text-decoration:underline; }
.pos-import-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
.pos-import-table th, .pos-import-table td { padding:6px 8px; text-align:left; border-bottom:1px solid #eef1f6; }
.pos-import-table th { background:#f8fafc; font-weight:600; color:#475467; }
.pos-import-table tr.unmatched td { background:#feeceb; }
.pos-import-group td { background:#f2f5fa; font-size:12px; }
.pos-import-select { height:28px; border-radius:6px; border:1px solid #dde3ee; background:#fff; font-size:12px; padding:0 6px; max-width:150px; }
.pos-drop { border:2px dashed #c7d2e5; border-radius:12px; padding:18px; text-align:center; color:#667085; font-size:12px;
  background:#fbfcff; margin-bottom:10px; }
.pos-drop.hot { border-color:#2457d6; background:#f2f6ff; color:#2457d6; }
.pos-drop strong { color:#1f2937; font-size:13px; display:block; margin-bottom:4px; }
.pos-quick { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; border:1px solid #b7e4cf;
  background:#e8f7f0; border-radius:10px; margin-top:10px; font-size:12px; }
.pos-netrow { display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:10px;
  border:1px solid #dde3ee; border-radius:10px; background:#fbfcff; font-size:12px; color:#344054; }
.pos-switch { position:relative; width:44px; height:24px; border-radius:999px; background:#d0d5dd;
  cursor:pointer; transition:background .2s; flex:none; border:none; padding:0; }
.pos-switch.on { background:#2457d6; }
.pos-switch::after { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
  background:#fff; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.25); }
.pos-switch.on::after { transform:translateX(20px); }
.pos-netrow .hint { color:#667085; }



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
      const { stock, category, savedRows, onSave, onDeleteRecord, customColumns, onSetField, onChart } = props
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
              const p = previewCalc(base, row, category)
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
          onChart ? h('button', { className: 'pos-mini', style: { marginRight: 'auto' }, onClick: () => onChart(stock.name) }, '生成图表') : null,
          h('button', { className: 'pos-mini', onClick: () => { setRows((prev) => prev.concat([{ side: '买入', price: '', qty: '' }])); setDirty(true) } }, '+ 添加一组测算'),
          h('button', { className: 'pos-btn primary', onClick: saveAll }, '保存全部测算')
        ),

        h('p', { className: 'pos-note' }, '测算只用于比较，不写入历史；保存后留在本机。费用带 * 表示用的是导入文件里自带的费用，不是按费率算的。')
      )
    }

    /* -------------------------------------------------------- 分组弹窗 */

    function GroupModal(props) {
      const { stocks, onClose, onSave, categories, onVariant } = props
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
          h('select', {
            className: 'pos-input', style: { width: 110 },
            value: s.variant || '',
            onChange: (e) => onVariant(s.name, e.target.value)
          },
            h('option', { value: '' }, '默认品种'),
            (categories || []).map((c) => h('option', { key: c.id, value: c.id }, c.name))
          ),
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

        /* -------------------------------------------------------- 备注弹窗 */

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

    const COLUMN_ALIASES = {
      date: ['日期', 'date', '成交日期', '交易日期', '发生日期', '时间', '成交时间'],
      side: ['方向', 'side', '买卖', '买卖方向', '操作', '业务名称', '交易类型', '买卖标志', '交易类别'],
      price: ['价格', 'price', '成交价', '成交价格', '均价', '单价', '成交均价'],
      qty: ['数量', 'qty', '成交量', '成交数量', '股数', '成交股数', '买卖数量', '实际数量'],
      fee: ['费用', 'fee', '手续费', '佣金', '总费用', '税费', '手续费及佣金'],
      name: ['股票', '名称', 'name', 'stock', '股票名称', '证券名称', '证券代码', '代码', '股东代码', '证券']
    }
    const COLUMN_LABELS = { date: '日期', side: '方向', price: '价格', qty: '数量', fee: '费用', name: '股票' }

    function normHeader(value) {
      return String(value || '').toLowerCase().replace(/[\s()（）:：\-_/]/g, '')
    }

    function matchHeader(cell, key) {
      const value = normHeader(cell)
      if (!value) return false
      return COLUMN_ALIASES[key].some((alias) => value === normHeader(alias) || value.includes(normHeader(alias)))
    }

    function normalizeDate(value) {
      const v = String(value || '').trim()
      if (/^\d{5}(\.\d+)?$/.test(v)) {
        const n = Math.round(Number(v))
        if (n >= 20000 && n <= 80000) {
          const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
          return d.toISOString().slice(0, 10)
        }
      }
      if (/^\d{8}$/.test(v)) return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8)
      const m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
      return v || today()
    }

    function looksLikeName(cell) {
      const v = String(cell || '').trim()
      if (!v) return false
      if (Number.isFinite(Number(v))) return false
      if (normSide(v)) return false
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(v)) return false
      if (/^\d{5,8}$/.test(v)) return false
      return true
    }

    function parseTable(text) {
      const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
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
        const widest = rows.reduce((max, r) => Math.max(max, r.length), header.length)
        while (header.length < widest) header.push('第' + (header.length + 1) + '列')
        // 丢掉表头噪音行（比如 '(隐藏)'、'(-),股票' 这种列数明显不足的行）
        const kept = rows.filter((r) => r.length >= widest - 1)
        rows.length = 0
        Array.prototype.push.apply(rows, kept)
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
            ? header.findIndex((_, c) => rows.filter((r) => /^\d{5,8}$/.test(String(r[c] || '').trim()) || /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(String(r[c] || '').trim())).length / rows.length >= 0.6)
            : -1
          if (index >= 0) mapping.date = index
        }
      } else {
        mapping.date = 0
        mapping.side = 1
        mapping.price = 2
        mapping.qty = 3
      }
      return { header, rows, mapping }
    }

    function buildRecords(table, mapping, defaults) {
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
    }

    function parseImport(text) {
      const table = parseTable(text)
      return buildRecords(table, table.mapping)
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

    /* -------------------------------------------------------- 数据互通 */

    function DataModal(props) {
      const { onClose, onImported } = props
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      const exportJson = async () => {
        setBusy(true); setError('')
        try {
          const res = await fetch(API + '/export-json')
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || '导出失败')
          const blob = new Blob([JSON.stringify(json.payload, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = '持仓成本台-' + today() + '.json'
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 2000)
          setNote('已导出。把文件发到手机，在小程序「设置 → 导入 JSON」里选它即可。')
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const importFile = (file) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          setBusy(true); setError(''); setNote('')
          try {
            const payload = JSON.parse(String(reader.result || '{}'))
            const kind = payload.holdings && payload.holdings.stocks ? '小程序数据' : (payload.stocks ? '插件备份' : '未知格式')
            if (!window.confirm('将用这份' + kind + '替换当前全部持仓（会先自动备份一份到数据目录）。确定继续？')) { setBusy(false); return }
            const res = await fetch(API + '/import-json', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ data: payload })
            })
            const json = await res.json()
            if (!json.ok) throw new Error(json.error || '导入失败')
            onImported(json.state)
            setNote('导入完成：' + json.state.stocks.length + ' 只股票')
          } catch (err) {
            setError(String(err.message || err))
          } finally {
            setBusy(false)
          }
        }
        reader.readAsText(file, 'utf-8')
      }

      return h(Modal, { title: '数据互通（JSON）', onClose, maxWidth: 640 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } },
          '导出的 JSON 可以直接在小程序「持仓复盘计算器」里导入；小程序导出的 JSON 也能在这里导入。方向会自动换算（转入=买入、转出=卖出、收益=分红）。'),
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 } },
          h('button', { className: 'pos-btn primary', disabled: busy, onClick: exportJson }, '导出 JSON'),
          h('label', { className: 'pos-btn', style: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer' } },
            '导入 JSON',
            h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: (e) => importFile(e.target.files && e.target.files[0]) })
          )
        ),
        note ? h('p', { className: 'pos-note' }, note) : null,
        error ? h('p', { className: 'pos-error' }, error) : null,
        h('p', { className: 'pos-note' },
          '导入前会自动把当前数据备份成 state.json.backup-<时间戳>.json，放在数据目录里；导错了可以找回。')
      )
    }

    /* -------------------------------------------------------- 图表 */

    const METRICS = [
      { key: 'cost', label: '累计成本', color: '#2457d6' },
      { key: 'cumInvest', label: '累计投入', color: '#047857' },
      { key: 'cumQty', label: '累计数量', color: '#b45309' },
      { key: 'net', label: '当次投入', color: '#6d28d9' }
    ]
    const metricLabel = (key) => {
      const found = METRICS.find((m) => m.key === key)
      return found ? found.label : key
    }
    const metricColor = (key) => {
      const found = METRICS.find((m) => m.key === key)
      return found ? found.color : '#667085'
    }

    function ChartSvg(props) {
      const { records, primary, compare, type, imported } = props
      const W = 760
      const H = 300
      const P = { l: 58, r: 58, t: 18, b: 42 }
      const importedMap = new Map((imported || []).map((p) => [String(p.date), Number(p.value)]))
      let points = (records || []).filter((r) => Number.isFinite(Number(r[primary])))
      if (compare === 'imported' && importedMap.size) points = points.filter((r) => importedMap.has(String(r.date)))
      if (compare === 'imported' && importedMap.size && points.length < 2) {
        const importedDates = Array.from(importedMap.keys()).sort()
        return h('div', { className: 'pos-empty', style: { padding: 32 } },
          '对比数据与成交日期没有重合，所以画不出来。',
          h('div', { className: 'pos-sub', style: { marginTop: 8 } },
            '成交范围：' + ((records[0] && records[0].date) || '—') + ' ~ ' + ((records[records.length - 1] && records[records.length - 1].date) || '—')
            + '；导入数据范围：' + importedDates[0] + ' ~ ' + importedDates[importedDates.length - 1]))
      }
      if (points.length < 2) {
        return h('div', { className: 'pos-empty', style: { padding: 32 } }, '数据不足以画图（至少需要 2 个数据点）')
      }

      const plotW = W - P.l - P.r
      const plotH = H - P.t - P.b
      const values = points.map((r) => Number(r[primary]))
      const minV = Math.min.apply(null, values)
      const maxV = Math.max.apply(null, values)
      const spanV = maxV - minV || 1

      let compareValues = []
      if (compare !== 'none') {
        compareValues = points.map((r) => (compare === 'imported' ? importedMap.get(String(r.date)) : Number(r[compare])))
        compareValues = compareValues.map((v) => (Number.isFinite(v) ? v : null))
      }
      const compareNumbers = compareValues.filter((v) => v !== null)
      const hasCompare = compare !== 'none' && compareNumbers.length === points.length
      const minC = hasCompare ? Math.min.apply(null, compareNumbers) : 0
      const maxC = hasCompare ? Math.max.apply(null, compareNumbers) : 1
      const spanC = maxC - minC || 1

      const x = (i) => P.l + (plotW * i) / (points.length - 1)
      const yMain = (v) => H - P.b - (plotH * (Number(v) - minV)) / spanV
      const yCmp = (v) => H - P.b - (plotH * (Number(v) - minC)) / spanC

      const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = P.t + plotH * ratio
        return h('line', { key: 'g' + ratio, x1: P.l, y1: y, x2: W - P.r, y2: y, stroke: '#eef1f6' })
      })

      const labelDates = [0, Math.floor((points.length - 1) / 2), points.length - 1]
      const xLabels = labelDates.map((i) => h('text', {
        key: 'x' + i, x: x(i), y: H - P.b + 18, textAnchor: 'middle', fontSize: 11, fill: '#667085'
      }, points[i].date))

      const drawSeries = (valuesArr, color, yFn, key) => {
        const pts = valuesArr.map((v, i) => (v === null ? null : [x(i), yFn(v)])).filter(Boolean)
        if (!pts.length) return null
        const line = pts.map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ')
        if (type === 'bar') {
          const barW = Math.max(3, (plotW / points.length) * 0.55)
          return h('g', { key }, valuesArr.map((v, i) => (v === null ? null : h('rect', {
            key: i, x: x(i) - barW / 2, y: yFn(v), width: barW, height: Math.max(1, H - P.b - yFn(v)), fill: color, opacity: 0.85
          }, h('title', null, (points[i] ? points[i].date : '') + '  ' + Number(v).toFixed(2))))))
        }
        const area = type === 'area'
          ? h('path', { key: key + 'a', d: line + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - P.b) + ' L ' + pts[0][0].toFixed(1) + ' ' + (H - P.b) + ' Z', fill: color, opacity: 0.12 })
          : null
        return h('g', { key },
          area,
          h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 2 }),
          pts.map((pt, i) => h('circle', { key: i, cx: pt[0], cy: pt[1], r: 2.4, fill: color },
            h('title', null, points[i] ? points[i].date + '  ' + Number(valuesArr[i]).toFixed(2) : '')))
        )
      }

      return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: { maxWidth: W } },
        grid,
        h('line', { x1: P.l, y1: P.t, x2: P.l, y2: H - P.b, stroke: '#dde3ee' }),
        h('line', { x1: W - P.r, y1: P.t, x2: W - P.r, y2: H - P.b, stroke: '#dde3ee' }),
        h('line', { x1: P.l, y1: H - P.b, x2: W - P.r, y2: H - P.b, stroke: '#dde3ee' }),
        h('text', { x: 6, y: P.t + 10, fontSize: 11, fill: metricColor(primary) }, metricLabel(primary)),
        h('text', { x: W - P.r + 4, y: P.t + 10, fontSize: 11, fill: hasCompare ? (compare === 'imported' ? '#b45309' : metricColor(compare)) : 'transparent' },
          hasCompare ? (compare === 'imported' ? '对比数据' : metricLabel(compare)) : ''),
        h('text', { x: P.l - 8, y: P.t + 10, textAnchor: 'end', fontSize: 10, fill: '#98a2b3' }, maxV.toFixed(2)),
        h('text', { x: P.l - 8, y: H - P.b, textAnchor: 'end', fontSize: 10, fill: '#98a2b3' }, minV.toFixed(2)),
        hasCompare ? h('text', { x: W - P.r + 8, y: P.t + 10, fontSize: 10, fill: '#98a2b3' }, '') : null,
        xLabels,
        drawSeries(values, metricColor(primary), yMain, 'main'),
        hasCompare ? drawSeries(compareValues, compare === 'imported' ? '#b45309' : metricColor(compare), yCmp, 'cmp') : null
      )
    }

    function ChartModal(props) {
      const { stock, state, onClose, onPatch } = props
      const saved = (state.charts && state.charts[stock.name]) || { primary: 'cost', compare: 'none', type: 'line' }
      const [primary, setPrimary] = useState(saved.primary)
      const [compare, setCompare] = useState(saved.compare)
      const [type, setType] = useState(saved.type)
      const [imported, setImported] = useState([])
      const [importText, setImportText] = useState('')
      const [note, setNote] = useState('')

      const parseImported = () => {
        const list = String(importText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
          const cells = line.split(/[,\s]+/).filter(Boolean)
          return { date: cells[0], value: Number(cells[1]) }
        }).filter((p) => /^\d{4}-\d{2}-\d{2}/.test(p.date) && Number.isFinite(p.value))
        setImported(list)
        setNote(list.length ? '对比数据 ' + list.length + ' 个点，将与本次数据按日期取重合部分' : '没有解析到对比数据，格式：日期,数值')
      }

      return h(Modal, { title: stock.name + ' · 图表', onClose, maxWidth: 900 },
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 } },
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '主指标'),
          h('select', { className: 'pos-select', value: primary, onChange: (e) => setPrimary(e.target.value) },
            METRICS.map((m) => h('option', { key: m.key, value: m.key }, m.label))),
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '图表类型'),
          h('select', { className: 'pos-select', value: type, onChange: (e) => setType(e.target.value) },
            h('option', { value: 'line' }, '折线图'), h('option', { value: 'bar' }, '柱状图'), h('option', { value: 'area' }, '面积图')),
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '对比'),
          h('select', { className: 'pos-select', value: compare, onChange: (e) => setCompare(e.target.value) },
            h('option', { value: 'none' }, '不对比'),
            METRICS.filter((m) => m.key !== primary).map((m) => h('option', { key: m.key, value: m.key }, '同股票：' + m.label)),
            h('option', { value: 'imported' }, '导入数据（如大盘）'))
        ),

        compare === 'imported'
          ? h('div', { style: { marginBottom: 10 } },
              h('textarea', {
                className: 'pos-input', style: { width: '100%', height: 70, padding: 8 },
                placeholder: '每行：日期,数值\n2027-01-05,3200.5\n2027-02-10,3180.2',
                value: importText, onChange: (e) => setImportText(e.target.value)
              }),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 6 } },
                h('button', { className: 'pos-mini', onClick: parseImported }, '解析对比数据'),
                h('span', { className: 'pos-muted', style: { fontSize: 12 } }, note)
              )
            )
          : null,

        h(ChartSvg, { records: stock.records, primary, compare, type, imported }),

        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 } },
          note && compare !== 'imported' ? h('span', { className: 'pos-muted', style: { fontSize: 12, marginRight: 'auto' } }, note) : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '关闭'),
          h('button', { className: 'pos-btn primary', onClick: async () => { await onPatch('setChart', { name: stock.name, chart: { primary, compare, type } }); setNote('图表配置已保存') } }, '保存配置')
        )
      )
    }

    /* -------------------------------------------------------- 统一录入 */

    function EntryPanel(props) {
      const { stocks, state, seed, onClose, onImport, onPatch } = props
      const [text, setText] = useState('')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [hot, setHot] = useState(false)
      const [table, setTable] = useState({ header: [], rows: [], mapping: {} })
      const [defaultSide, setDefaultSide] = useState('买入')
      const [mapping, setMapping] = useState({})
      const [showMap, setShowMap] = useState(false)
      const [showVision, setShowVision] = useState(false)
      const vision = state.vision || {}
      const [vdraft, setVdraft] = useState({ baseUrl: vision.baseUrl || '', apiKey: vision.apiKey || '', model: vision.model || '' })
      const configured = !!(vision.apiKey && vision.baseUrl && vision.model)
      const enabled = vision.enabled === true

      const applyTable = (table, useMapping) => {
        const mapping = useMapping || {}
        const known = new Set(stocks.map((s) => s.name))
        const existingKeys = new Map()
        stocks.forEach((s) => {
          const set = new Set()
          ;(s.records || []).forEach((r) => {
            set.add([String(r.date), String(r.side), Number(r.price), Number(r.qty)].join('|'))
          })
          existingKeys.set(s.name, set)
        })
        let last = ''
        const filled = buildRecords(table, mapping, { side: defaultSide, date: today() }).map((r) => {
          if (r.name) { last = r.name; return r }
          if (last) return Object.assign({}, r, { name: last, inherited: true })
          return r
        })
        const parsed = filled.map((r) => {
          const base = r.name
            ? Object.assign({}, r, { auto: false, isNew: !known.has(r.name) && !r.inherited })
            : Object.assign({}, r, { auto: !!matchByPrice(stocks, r.price), isNew: false })
          const key = [String(base.date), String(base.side), Number(base.price), Number(base.qty)].join('|')
          const duplicate = !!(base.name && existingKeys.get(base.name) && existingKeys.get(base.name).has(key))
          return Object.assign({}, base, { duplicate })
        })
        const autoCount = parsed.filter((r) => r.auto).length
        setRows(parsed)
        const newCount = parsed.filter((r) => r.isNew).length
        const dupCount = parsed.filter((r) => r.duplicate).length
        const allDup = parsed.length > 0 && dupCount === parsed.length
        if (!parsed.length) {
          setNote('没有解析到有效行：文件里一行数据都没有，或列映射没对上（点「列映射」手动指定）')
        } else {
          setNote('解析到 ' + parsed.length + ' 条'
            + (autoCount ? '，' + autoCount + ' 条没写股票名、已按价格匹配' : '')
            + (newCount ? '，' + newCount + ' 条是新股票（导入后自动新建，归入「未分组」）' : '')
            + (dupCount ? '，' + dupCount + ' 条与已有记录重复（日期+方向+价格+数量一致），导入时会跳过' : '')
            + '，请核对后再导入')
          if (allDup) setError('这一批和已有记录完全重复，可能是重复导入同一个文件，请确认后再操作。')
          else setError('')
        }
      }

      const askModel = async (tbl, baseMapping) => {
        try {
          setBusy(true)
          setNote('正在让模型识别表头…')
          const res = await fetch(API + '/map-columns', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ header: tbl.header, sample: tbl.rows.slice(0, 3) })
          })
          const json = await res.json()
          if (!json.ok) { setNote('模型识别失败：' + (json.error || '未知原因')); return }
          const merged = Object.assign({}, baseMapping, json.mapping)
          setMapping(merged)
          applyTable(tbl, merged)
          setNote('模型已识别表头并填入映射，请核对')
        } catch (err) {
          setNote('模型识别失败：' + String(err.message || err))
        } finally {
          setBusy(false)
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
          if (enabled) {
            askModel(table, table.mapping)
          } else {
            setNote('识别到 ' + table.header.length + ' 列，但缺少：' + missing.map((k) => COLUMN_LABELS[k]).join('、') + '。请手动指定，或打开「联网智能识别」让模型识别。')
          }
          return
        }
        applyTable(table, table.mapping)
      }

      const fileToDataUrl = (file) => new Promise((resolvePromise, rejectPromise) => {
        const reader = new FileReader()
        reader.onload = () => resolvePromise(String(reader.result || ''))
        reader.onerror = rejectPromise
        reader.readAsDataURL(file)
      })

      const shrinkImage = (file) => new Promise((resolvePromise) => {
        try {
          const img = new Image()
          const url = URL.createObjectURL(file)
          img.onload = () => {
            const max = 1800
            const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1))
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round((img.width || 1) * scale))
            canvas.height = Math.max(1, Math.round((img.height || 1) * scale))
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
            URL.revokeObjectURL(url)
            resolvePromise(canvas.toDataURL('image/jpeg', 0.9))
          }
          img.onerror = () => { URL.revokeObjectURL(url); resolvePromise(null) }
          img.src = url
        } catch {
          resolvePromise(null)
        }
      })

      const readText = (file) => new Promise((resolvePromise, rejectPromise) => {
        const reader = new FileReader()
        reader.onload = () => resolvePromise(String(reader.result || ''))
        reader.onerror = rejectPromise
        reader.readAsText(file, 'utf-8')
      })

      const recognize = async (file) => {
        if (!enabled) {
          setError('截图识别需要联网：请先打开上面的「联网智能识别」开关' + (configured ? '' : '（默认用当前 Harness 模型，识别失败可在下方指定接口）'))
          return
        }
        setBusy(true); setError('')
        try {
          const dataUrl = (await shrinkImage(file)) || (await fileToDataUrl(file))
          const res = await fetch(API + '/recognize', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
          })
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || '识别失败')
          const list = Array.isArray(json.rows) ? json.rows : []
          if (!list.length) { setNote('没有从图片里识别出成交记录，换一张更清晰的截图试试'); return }
          const raw = list.map((r) => [r.date || '', r.side || '', r.price || '', r.qty || '', '', r.name || ''].join(',')).join('\n')
          setText(raw)
          parse(raw)
          setNote('图片识别出 ' + list.length + ' 行，已放进预览，请核对（识别可能有误差）')
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const readXlsx = async (file) => {
        setBusy(true); setError('')
        try {
          const dataUrl = await fileToDataUrl(file)
          const base64 = dataUrl.split(',')[1] || ''
          const res = await fetch(API + '/parse-xlsx', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: base64 })
          })
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || 'Excel 解析失败')
          const raw = (json.lines || []).join('\n')
          setText(raw)
          parse(raw)
          setNote('Excel 已转成文本预览（' + (json.lines || []).length + ' 行）')
        } catch (err) {
          setError(String(err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const ingest = async (file) => {
        if (!file) return
        setError('')
        if (String(file.type || '').startsWith('image/')) return recognize(file)
        if (/\.xlsx$/i.test(file.name)) return readXlsx(file)
        if (/\.xls$/i.test(file.name)) { setError('旧版 .xls 不支持，请另存为 .xlsx 或 .csv'); return }
        try {
          const raw = await readText(file)
          setText(raw)
          parse(raw)
        } catch (err) {
          setError(String(err.message || err))
        }
      }

      useEffect(() => {
        if (!seed) return
        if (seed.kind === 'text') { setText(seed.value); parse(seed.value) }
        else if (seed.file) ingest(seed.file)
      }, [])

      useEffect(() => {
        const onPaste = (e) => {
          const items = Array.from((e.clipboardData && e.clipboardData.items) || [])
          const img = items.find((i) => i.type && i.type.startsWith('image/'))
          if (!img) return
          e.preventDefault()
          ingest(img.getAsFile())
        }
        window.addEventListener('paste', onPaste)
        return () => window.removeEventListener('paste', onPaste)
      }, [enabled, configured, stocks])

      const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? Object.assign({}, r, patch) : r)))
      const unmatched = rows.filter((r) => !r.name).length

      return h(Modal, { title: '录入成交', onClose, maxWidth: 900 },
        h('div', { className: 'pos-netrow' },
          h('button', {
            className: 'pos-switch' + (enabled ? ' on' : ''),
            title: enabled ? '点击关闭联网识别' : '点击开启联网识别',
            onClick: async () => {
              setError('')
              await onPatch('setVision', Object.assign({}, vdraft, { enabled: !enabled }))
              setNote(!enabled ? '已开启：截图识别 + 表头识别会使用当前 Harness 模型' : '已关闭：数据不再离开本机')
            }
          }),
          h('span', null, '联网智能识别'),
          h('span', { className: 'hint' }, enabled ? '已开启：截图和表头会发送给当前 Harness 模型' : '已关闭：数据不会离开本机'),
          configured ? h('span', { className: 'pos-chip ok', style: { height: 22, fontSize: 11 } }, '自定义接口已配置') : null
        ),

        h('div', {
          className: 'pos-drop' + (hot ? ' hot' : ''),
          onDragOver: (e) => { e.preventDefault(); setHot(true) },
          onDragLeave: () => setHot(false),
          onDrop: (e) => { e.preventDefault(); setHot(false); ingest((e.dataTransfer.files || [])[0]) }
        },
          h('strong', null, '粘贴截图 / 拖入文件'),
          h('div', null, '按 Ctrl+V 粘贴截图，或把截图、CSV、Excel 拖到这里'),
          h('div', { style: { marginTop: 10 } },
            h('input', { type: 'file', accept: 'image/*,.csv,.txt,.xlsx', onChange: (e) => ingest((e.target.files || [])[0]) })
          )
        ),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 } },
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '或直接粘贴文本'),
          h('button', { className: 'pos-mini', style: { marginLeft: 'auto' }, onClick: () => setShowVision(!showVision) }, configured ? '备用接口：已配置' : '备用接口（可选）'),
          busy ? h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '处理中…') : null
        ),

        showVision
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginBottom: 10 } },
              h('p', { className: 'pos-sub', style: { marginTop: 0 } },
                '默认使用当前 Harness 模型识别截图；如果它不支持图片或识别失败，可以在这里指定一个支持图片的接口（可选）。'),
              h('div', { className: 'pos-fee-grid' },
                h('div', { className: 'pos-fee-field' },
                  h('label', null, 'Base URL'),
                  h('input', { className: 'pos-input', placeholder: 'https://api.openai.com/v1', value: vdraft.baseUrl, onChange: (e) => setVdraft(Object.assign({}, vdraft, { baseUrl: e.target.value })) })
                ),
                h('div', { className: 'pos-fee-field' },
                  h('label', null, '模型'),
                  h('input', { className: 'pos-input', placeholder: 'gpt-4o-mini / qwen-vl-max', value: vdraft.model, onChange: (e) => setVdraft(Object.assign({}, vdraft, { model: e.target.value })) })
                ),
                h('div', { className: 'pos-fee-field' },
                  h('label', null, 'API Key'),
                  h('input', { className: 'pos-input', type: 'password', placeholder: 'sk-…', value: vdraft.apiKey, onChange: (e) => setVdraft(Object.assign({}, vdraft, { apiKey: e.target.value })) })
                )
              ),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
                h('button', { className: 'pos-btn', onClick: async () => { await onPatch('setVision', vdraft); setNote('视觉接口已保存') } }, '保存接口')
              )
            )
          : null,

        h('textarea', {
          className: 'pos-input', style: { width: '100%', height: 90, padding: 8, lineHeight: 1.6 },
          placeholder: '2026-11-20,买入,9.50,500,,\n2026-11-21,卖出,11.00,300,3.20,贵州茅台',
          value: text,
          onChange: (e) => { setText(e.target.value); if (rows.length) setRows([]) }
        }),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' } },
          h('button', { className: 'pos-mini', onClick: () => parse(text) }, '解析文本'),
          table.header.length ? h('button', { className: 'pos-mini', onClick: () => setShowMap(!showMap) }, showMap ? '收起列映射' : '列映射') : null
        ),

        showMap && table.header.length
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginTop: 8 } },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
                h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '指定每一列是什么；没有的字段可以留空（费用、股票）。多出来的列会被忽略。'),
                enabled ? h('button', {
                  className: 'pos-mini', style: { marginLeft: 'auto' },
                  onClick: () => askModel(table, mapping)
                }, '用模型识别列') : null
              ),
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
          : null,

        error ? h('p', { className: 'pos-error' }, error) : null,
        note ? h('p', { className: 'pos-note' }, note) : null,

        rows.length === 1
          ? h('div', { className: 'pos-quick' },
              h('span', null, '单条：'),
              h('select', { className: 'pos-import-select', value: rows[0].name, onChange: (e) => setRow(0, { name: e.target.value }) },
                h('option', { value: '' }, '— 选股票 —'),
                rows[0].isNew ? h('option', { key: '__new', value: rows[0].name }, '新建：' + rows[0].name) : null,
                stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
              ),
              h('span', null, rows[0].side),
              h('span', null, rows[0].price + ' × ' + rows[0].qty),
              h('button', { className: 'pos-btn primary', disabled: !rows[0].name || busy, onClick: () => onImport(rows) }, '直接入账')
            )
          : null,

        rows.length > 1
          ? h('table', { className: 'pos-import-table' },
              h('thead', null, h('tr', null, ['日期', '方向', '价格', '数量', '费用', '匹配股票', ''].map((t, i) => h('th', { key: i }, t)))),
              h('tbody', null, (() => {
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
                  block.items.forEach(({ row: r, index: i }) => nodes.push(h('tr', { key: i, className: r.name ? '' : 'unmatched' },
                h('td', null, r.date),
                h('td', null, r.side),
                h('td', null, r.price),
                h('td', null, r.qty),
                h('td', null, r.fee || '—'),
                h('td', null,
                  r.auto ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '按价格匹配') : null,
                  r.isNew ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#eef4ff', borderColor: '#c7d2fe', color: '#2457d6' } }, '新建') : null,
                  r.duplicate ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fef3f2', borderColor: '#fecdca', color: '#b42318' } }, '重复，跳过') : null,
                  h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, { name: e.target.value }) },
                    h('option', { value: '' }, '— 请选择 —'),
                    r.isNew ? h('option', { key: '__new', value: r.name }, '新建：' + r.name) : null,
                    stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
                  )),
                h('td', null, h('button', { className: 'pos-link danger', onClick: () => setRows((prev) => prev.filter((_, idx) => idx !== i)) }, '删除'))
              )))
                })
                return nodes
              })())
            )
          : null,

        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          unmatched ? h('span', { className: 'pos-error', style: { marginRight: 'auto' } }, '还有 ' + unmatched + ' 行未匹配') : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', disabled: !rows.length || unmatched > 0 || busy, onClick: () => onImport(rows) }, '确认导入')
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

    const pctOf = (v) => String(Math.round(Number(v || 0) * 100 * 10000) / 10000)
    const toDraftCategory = (c) => ({
      id: c.id,
      name: c.name,
      commission: pctOf(c.commissionRate),
      min: String(c.minCommission),
      stamp: pctOf(c.stampDutyRate),
      transfer: pctOf(c.transferFeeRate),
      other: String(c.otherFixed),
      note: c.note || ''
    })
    const fromDraftCategory = (c) => ({
      id: c.id,
      name: c.name.trim() || '未命名品种',
      commissionRate: Number(c.commission) / 100,
      minCommission: Number(c.min),
      stampDutyRate: Number(c.stamp) / 100,
      transferFeeRate: Number(c.transfer) / 100,
      otherFixed: Number(c.other),
      note: c.note
    })

    function FeeModal(props) {
      const { state, onClose, onPatch } = props
      const active = state.feeRules.find((r) => r.id === state.activeFeeRule) || state.feeRules[0]
      const [ruleId, setRuleId] = useState(active.id)
      const [name, setName] = useState(active.name)
      const [categories, setCategories] = useState(() => active.categories.map(toDraftCategory))
      const [catId, setCatId] = useState(() => (active.categories[0] || {}).id)
      const [note, setNote] = useState(active.note || '')
      const [image, setImage] = useState(active.image || '')
      const [saved, setSaved] = useState(false)

      const category = categories.find((c) => c.id === catId) || categories[0]
      const setCat = (patch) => {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? Object.assign({}, c, patch) : c)))
        setSaved(false)
      }
      const setField = (key, value) => setCat({ [key]: value })

      const save = async () => {
        await onPatch('saveFeeRule', {
          rule: {
            id: ruleId,
            name: name.trim() || '未命名券商',
            categories: categories.map(fromDraftCategory),
            note,
            image
          }
        })
        setSaved(true)
      }

      const createRule = async () => {
        const rule = {
          id: 'rule-' + Date.now(),
          name: '新券商',
          categories: [{ id: 'cat-' + Date.now(), name: 'A股', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: '' }],
          note: '',
          image: ''
        }
        await onPatch('saveFeeRule', { rule })
        await onPatch('setActiveFeeRule', { id: rule.id })
        setRuleId(rule.id); setName(rule.name)
        setCategories(rule.categories.map(toDraftCategory)); setCatId(rule.categories[0].id)
        setNote(''); setImage(''); setSaved(false)
      }

      const removeRule = async () => {
        if (state.feeRules.length <= 1) return
        await onPatch('deleteFeeRule', { id: ruleId })
        const next = state.feeRules.find((r) => r.id !== ruleId)
        if (next) {
          setRuleId(next.id); setName(next.name)
          setCategories(next.categories.map(toDraftCategory)); setCatId(next.categories[0].id)
          setNote(next.note || ''); setImage(next.image || ''); setSaved(false)
        }
      }

      const pickRule = async (id) => {
        await onPatch('setActiveFeeRule', { id })
        const rule = state.feeRules.find((r) => r.id === id)
        if (rule) {
          setRuleId(rule.id); setName(rule.name)
          setCategories(rule.categories.map(toDraftCategory)); setCatId(rule.categories[0].id)
          setNote(rule.note || ''); setImage(rule.image || ''); setSaved(false)
        }
      }

      const addCategory = () => {
        const cat = { id: 'cat-' + Date.now(), name: '新品种', commission: '0.025', min: '5', stamp: '0', transfer: '0', other: '0', note: '' }
        setCategories((prev) => prev.concat([cat]))
        setCatId(cat.id)
        setSaved(false)
      }
      const removeCategory = () => {
        if (categories.length <= 1) return
        const next = categories.filter((c) => c.id !== category.id)
        setCategories(next); setCatId(next[0].id); setSaved(false)
      }

      const upload = (file) => {
        if (!file) return
        if (file.size > 300 * 1024) { window.alert('图片请小于 300KB，作为参考即可'); return }
        const reader = new FileReader()
        reader.onload = () => { setImage(String(reader.result || '')); setSaved(false) }
        reader.readAsDataURL(file)
      }

      const field = (label, key, unit) => h('div', { className: 'pos-fee-field' },
        h('label', null, label, unit ? h('span', { className: 'unit' }, unit) : null),
        h('input', { className: 'pos-input', value: category[key], onChange: (e) => setField(key, e.target.value) })
      )

      return h(Modal, { title: '费率规则', onClose, maxWidth: 760 },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
          h('span', { className: 'pos-muted' }, '券商：'),
          h('select', { className: 'pos-select', value: ruleId, onChange: (e) => pickRule(e.target.value) },
            state.feeRules.map((r) => h('option', { key: r.id, value: r.id }, r.name))),
          h('button', { className: 'pos-mini', onClick: createRule }, '+ 新建券商'),
          h('button', { className: 'pos-mini', onClick: removeRule, disabled: state.feeRules.length <= 1 }, '删除券商')
        ),

        h('div', { className: 'pos-chips', style: { marginBottom: 10 } },
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '品种：'),
          categories.map((c) => h('button', {
            key: c.id,
            className: 'pos-chip',
            style: c.id === category.id ? { borderColor: '#2457d6', color: '#2457d6', background: '#f2f6ff' } : undefined,
            onClick: () => setCatId(c.id)
          }, c.name)),
          h('button', { className: 'pos-mini', onClick: addCategory }, '+ 新建品种'),
          h('button', { className: 'pos-mini', onClick: removeCategory, disabled: categories.length <= 1 }, '删除品种')
        ),

        h('div', { className: 'pos-fee-grid' },
          field('品种名称', 'name'),
          field('佣金率', 'commission', '%'),
          field('最低佣金（元）', 'min'),
          field('印花税率（仅卖出）', 'stamp', '%'),
          field('过户费率', 'transfer', '%'),
          field('其他固定费用（元/笔）', 'other')
        ),

        h('div', { className: 'pos-fee-field', style: { marginTop: 10 } },
          h('label', null, '品种备注'),
          h('input', { className: 'pos-input', value: category.note, onChange: (e) => setField('note', e.target.value) })
        ),

        h('div', { className: 'pos-fee-field', style: { marginTop: 10 } },
          h('label', null, '券商备注'),
          h('input', { className: 'pos-input', value: note, onChange: (e) => { setNote(e.target.value); setSaved(false) } })
        ),

        h('div', { style: { marginTop: 12 } },
          h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 6 } }, '券商费率截图（可选，仅作参考，数值请手填）'),
          h('input', { type: 'file', accept: 'image/*', onChange: (e) => upload(e.target.files && e.target.files[0]) }),
          image ? h('div', { className: 'pos-fee-preview' }, h('img', { src: image, alt: '券商费率截图' })) : null
        ),

        h('p', { className: 'pos-note' },
          '每个品种单独算：买入 = 佣金（不低于最低）+ 过户费；卖出再加印花税；分红按持股期估红利税。股票用哪个品种，在「编辑分组」里选。'),

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
      const [noteFor, setNoteFor] = useState('')
      const [entryOpen, setEntryOpen] = useState(false)
      const [chartFor, setChartFor] = useState('')
      const [dataOpen, setDataOpen] = useState(false)
      const [entrySeed, setEntrySeed] = useState(null)

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

      useEffect(() => {
        const onPaste = (e) => {
          if (entryOpen) return
          const items = Array.from((e.clipboardData && e.clipboardData.items) || [])
          const img = items.find((i) => i.type && i.type.startsWith('image/'))
          if (!img) return
          e.preventDefault()
          setEntrySeed({ file: img.getAsFile() })
          setEntryOpen(true)
        }
        const onDrop = (e) => {
          if (entryOpen) return
          const file = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null
          if (!file) return
          e.preventDefault()
          setEntrySeed({ file })
          setEntryOpen(true)
        }
        const onDragOver = (e) => { if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) e.preventDefault() }
        window.addEventListener('paste', onPaste)
        window.addEventListener('drop', onDrop)
        window.addEventListener('dragover', onDragOver)
        return () => {
          window.removeEventListener('paste', onPaste)
          window.removeEventListener('drop', onDrop)
          window.removeEventListener('dragover', onDragOver)
        }
      }, [entryOpen])

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
          const category = resolveCategory(rule, s)
          const records = calcRecords(s.records, category)
          const last = records.length ? records[records.length - 1] : null
          const cumQty = last ? last.cumQty : 0
          const cumInvest = last ? last.cumInvest : 0
          const mv = Number(s.price || 0) * cumQty
          return Object.assign({}, s, { records, cumQty, cumInvest, last, mv, category })
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
        category: s.category,
        savedRows: state.calc[s.name],
        customColumns,
        onSetField: (name, key, value) => act('setField', { name, key, value }),
        onChart: (name) => setChartFor(name),
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
              h('button', { className: 'pos-btn', onClick: () => setDataOpen(true) }, '数据'),
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
            h('button', { className: 'pos-btn', onClick: () => { setEntrySeed(null); setEntryOpen(true) } }, '录入 (文件/截图)'),
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
                      columns.map((col) => {
                        if (col.key === 'note') {
                          return h('td', {
                            key: col.key,
                            className: 'pos-note-cell',
                            title: s.note || '点击添加备注',
                            onClick: (e) => { e.stopPropagation(); setNoteFor(s.name) }
                          }, s.note ? s.note : h('span', { className: 'pos-muted' }, '添加'))
                        }
                        return h('td', { key: col.key }, cellValue(s, col.key))
                      }),
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

        noteFor ? h(NoteModal, {
          stock: view.stocks.find((s) => s.name === noteFor) || { name: noteFor, note: '' },
          onClose: () => setNoteFor(''),
          onSave: async (note) => { await act('setNote', { name: noteFor, note }); setNoteFor('') }
        }) : null,
        dataOpen ? h(DataModal, {
          onClose: () => setDataOpen(false),
          onImported: (nextState) => setData((prev) => Object.assign({}, prev, { state: nextState }))
        }) : null,
        chartFor ? h(ChartModal, {
          stock: view.stocks.find((s) => s.name === chartFor),
          state,
          onClose: () => setChartFor(''),
          onPatch: act
        }) : null,
        entryOpen ? h(EntryPanel, {
          stocks: view.stocks.filter((s) => !s.archived),
          state,
          seed: entrySeed,
          onClose: () => { setEntryOpen(false); setEntrySeed(null) },
          onPatch: act,
          onImport: async (rows) => {
            for (const r of rows.filter((row) => !row.duplicate)) {
              const payload = { name: r.name, date: r.date, side: r.side, price: r.price, qty: r.qty }
              if (r.fee !== '' && r.side !== '分红') payload.feeOverride = r.fee
              await act('addTrade', payload)
            }
            setEntryOpen(false)
            setEntrySeed(null)
          }
        }) : null,
        groupOpen ? h(GroupModal, {
          stocks: view.stocks,
          categories: rule.categories || [],
          onVariant: (name, variant) => act('setVariant', { name, variant }),
          onClose: () => setGroupOpen(false),
          onSave: saveGroups
        }) : null,
        headerOpen ? h(HeaderModal, { state, onClose: () => setHeaderOpen(false), onPatch: act }) : null,
        feeOpen ? h(FeeModal, { state, onClose: () => setFeeOpen(false), onPatch: act }) : null,
        archiveOpen ? h(ArchiveModal, {
          stocks: view.archived,
          rule,
          state,
          customColumns,
          onSetField: (name, key, value) => act('setField', { name, key, value }),
        onChart: (name) => setChartFor(name),
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
