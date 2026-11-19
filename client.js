/**
 * 持仓成本台 · 浏览器端
 *
 * 与网页版持仓页一致：
 *   分组管理（整行） → 持仓表 → 展开/测算（同一张表里的行内测算）
 * 视觉上照搬网页版：白底、浅灰表头、测算行蓝底、行尾 保存/删除。
 */
window.__ModuleLoader__.load({
  id: '@zhangxij/dsh-positions',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const API = '/positions'
    const PANEL_ID = 'positions'

    /* ------------------------------------------------------------ 计算 */

    function calcRecords(records, feeRate) {
      const rate = Number(feeRate) > 0 ? Number(feeRate) : 0.0003
      let cumQty = 0
      let cumInvest = 0
      return (records || [])
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => {
          const turnover = Number(r.price) * Number(r.qty)
          const fee = r.feeOverride !== undefined && r.feeOverride !== null ? Number(r.feeOverride) : turnover * rate
          const net = r.side === '买入' ? turnover + fee : turnover - fee
          if (r.side === '买入') {
            cumQty += Number(r.qty)
            cumInvest += net
          } else {
            cumQty -= Number(r.qty)
            cumInvest -= net
          }
          return {
            date: r.date,
            side: r.side,
            price: Number(r.price),
            qty: Number(r.qty),
            fee,
            net,
            cumQty,
            cumInvest,
            cost: cumQty > 0 ? cumInvest / cumQty : null,
            feeFromImport: r.feeOverride !== undefined
          }
        })
    }

    function previewCalc(base, row, feeRate) {
      const rate = Number(feeRate) > 0 ? Number(feeRate) : 0.0003
      const price = Number(row.price)
      const qty = Number(row.qty)
      if (!(price > 0) || !(qty > 0)) return { fee: '—', net: '—', cumQty: '—', cumInvest: '—', cost: '—', error: '' }
      const turnover = price * qty
      const fee = turnover * rate
      const net = row.side === '卖出' ? turnover - fee : turnover + fee
      if (row.side === '卖出' && qty > base.cumQty) {
        return { fee: '—', net: '—', cumQty: '—', cumInvest: '—', cost: '超量', error: '超量' }
      }
      const q = row.side === '买入' ? base.cumQty + qty : base.cumQty - qty
      const invest = row.side === '买入' ? base.cumInvest + net : base.cumInvest - net
      return {
        fee: fee.toFixed(2),
        net: net.toFixed(2),
        cumQty: q,
        cumInvest: invest.toFixed(2),
        cost: q > 0 ? (invest / q).toFixed(3) : '—',
        error: ''
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
.pos-filter { padding:10px 12px; margin-bottom:12px; }
.pos-filter-head { display:flex; align-items:center; justify-content:space-between; font-weight:600; font-size:13px; margin-bottom:8px; gap:8px; }
.pos-chips { display:flex; gap:6px; flex-wrap:wrap; }
.pos-chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:999px;
  border:1px solid #dde3ee; background:#fff; font-size:12px; color:#344054; }
.pos-chip .n { color:#667085; font-size:11px; }
.pos-mini { font-size:12px; padding:0 10px; height:26px; border-radius:8px; cursor:pointer; border:1px solid #dde3ee; background:#fff; color:#1f2937; }
.pos-mini:hover { border-color:#2457d6; color:#2457d6; }
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
    .pos-chip.ok { background:#e8f7f0; border-color:#b7e4cf; color:#047857; }
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
          h('input', {
            className: 'pos-input', list: 'pos-group-options', placeholder: '组名（可空）',
            value: draft[s.name].group,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { group: e.target.value }) }))
          }),
          h('span', { className: 'pos-muted' }, '现价'),
          h('input', {
            className: 'pos-input num', type: 'number', step: '0.01', value: draft[s.name].price,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { price: e.target.value }) }))
          }),
          h('span', { className: 'pos-muted' }, '当日盈亏'),
          h('input', {
            className: 'pos-input num', type: 'number', step: '0.01', value: draft[s.name].dayPnl,
            onChange: (e) => setDraft(Object.assign({}, draft, { [s.name]: Object.assign({}, draft[s.name], { dayPnl: e.target.value }) }))
          })
        )),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', onClick: () => onSave(draft) }, '保存分组')
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
      const feeRate = state ? state.feeRate : 0.0003

      const view = useMemo(() => {
        if (!state) return null
        const stocks = state.stocks.map((s) => {
          const records = calcRecords(s.records, feeRate)
          const last = records.length ? records[records.length - 1] : null
          const cumQty = last ? last.cumQty : 0
          const cumInvest = last ? last.cumInvest : 0
          const mv = Number(s.price || 0) * cumQty
          return Object.assign({}, s, { records, cumQty, cumInvest, last, mv })
        })
        const totalMv = stocks.reduce((sum, s) => sum + s.mv, 0)
        const groups = []
        const index = new Map()
        stocks.forEach((s) => {
          const name = s.group || '未分组'
          if (!index.has(name)) {
            index.set(name, { name, stocks: [], mv: 0, pnl: 0 })
            groups.push(index.get(name))
          }
          const group = index.get(name)
          group.stocks.push(s)
          group.mv += s.mv
          group.pnl += Number(s.dayPnl || 0)
        })
        groups.forEach((g) => { g.pos = totalMv > 0 ? (g.mv / totalMv) * 100 : null })
        return { stocks, groups, totalMv }
      }, [state, feeRate])

      if (error && !data) {
        return h('div', { className: 'pos-root' }, h('style', null, CSS),
          h('div', { className: 'pos-empty' }, h('p', null, '读取失败：' + error), h('button', { className: 'pos-btn', onClick: load }, '重试')))
      }
      if (!data || !view) {
        return h('div', { className: 'pos-root' }, h('style', null, CSS), h('div', { className: 'pos-empty' }, '加载中…'))
      }

      const columns = 11
      const calcStock = calcFor ? view.stocks.find((s) => s.name === calcFor) : null

      const addTrade = async () => {
        if (!form.name.trim() || !form.price || !form.qty) return
        await act('addTrade', {
          name: form.name.trim(),
          date: form.date || today(),
          side: form.side,
          price: form.price,
          qty: form.qty,
          feeOverride: form.fee === '' ? undefined : form.fee
        })
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

      const ledgerProps = (s) => ({
        stock: s,
        feeRate,
        savedRows: state.calc[s.name],
        onSave: (rows) => act('saveCalc', { name: s.name, rows }),
        onDeleteRecord: (name, row) => act('deleteRecord', { name, index: rawIndexOf(state, name, row), match: { date: row.date, side: row.side, price: row.price, qty: row.qty } })
      })

      return h('div', { className: 'pos-root' },
        h('style', null, CSS),
        h('div', { className: 'pos-wrap' },

          h('div', { className: 'pos-head' },
            h('div', null,
              h('h1', { className: 'pos-title' }, '持仓成本台'),
              h('p', { className: 'pos-sub' }, '只记你自己的持仓与成交，不含行情 · 数据目录 ' + (data.dataDir || ''))
            ),
            h('div', { className: 'pos-head-actions' },
              h('button', { className: 'pos-btn', onClick: load, disabled: busy }, '刷新')
            )
          ),

          error ? h('div', { className: 'pos-error' }, error) : null,

          h('div', { className: 'pos-card pos-form' },
            h('span', { className: 'pos-muted' }, '记一笔'),
            h('input', { className: 'pos-input', placeholder: '股票名称', value: form.name, list: 'pos-names',
              onChange: (e) => setForm(Object.assign({}, form, { name: e.target.value })) }),
            h('datalist', { id: 'pos-names' }, state.stocks.map((s) => h('option', { key: s.name, value: s.name }))),
            h('input', { className: 'pos-input', type: 'date', value: form.date,
              onChange: (e) => setForm(Object.assign({}, form, { date: e.target.value })) }),
            h('select', { className: 'pos-select', value: form.side,
              onChange: (e) => setForm(Object.assign({}, form, { side: e.target.value })) },
              h('option', { value: '买入' }, '买入'), h('option', { value: '卖出' }, '卖出')),
            h('input', { className: 'pos-input num', type: 'number', step: '0.01', placeholder: '价格', value: form.price,
              onChange: (e) => setForm(Object.assign({}, form, { price: e.target.value })) }),
            h('input', { className: 'pos-input num', type: 'number', step: '1', placeholder: '数量', value: form.qty,
              onChange: (e) => setForm(Object.assign({}, form, { qty: e.target.value })) }),
            h('input', { className: 'pos-input num', type: 'number', step: '0.01', placeholder: '费用(可空)', value: form.fee,
              onChange: (e) => setForm(Object.assign({}, form, { fee: e.target.value })) }),
            h('button', { className: 'pos-btn primary', onClick: addTrade, disabled: busy }, '写入历史')
          ),

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

          h('div', { className: 'pos-table-wrap' },
            h('table', { className: 'pos-table' },
              h('thead', null, h('tr', null,
                h('th', null, '股票'), h('th', null, '日期'), h('th', null, '方向'), h('th', null, '价格'),
                h('th', null, '数量'), h('th', null, '费用'), h('th', null, '当次含费用投入'), h('th', null, '累计数量'),
                h('th', null, '累计投入'), h('th', null, '累计成本'), h('th', null, '操作')
              )),
              h('tbody', null,
                view.groups.map((group) => [
                  h('tr', { key: 'g-' + group.name, className: 'pos-group' },
                    h('td', { colSpan: columns },
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
                      h('td', null, s.name),
                      h('td', null, s.last ? s.last.date : '—'),
                      h('td', null, s.last ? s.last.side : '—'),
                      h('td', null, s.last ? s.last.price.toFixed(2) : '—'),
                      h('td', null, s.last ? s.last.qty : '—'),
                      h('td', null, s.last ? s.last.fee.toFixed(2) : '—'),
                      h('td', null, s.last ? s.last.net.toFixed(2) : '—'),
                      h('td', null, s.cumQty),
                      h('td', null, s.cumInvest.toFixed(2)),
                      h('td', null, s.last && s.last.cost !== null ? s.last.cost.toFixed(3) : '—'),
                      h('td', null,
                        h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); setCalcFor(s.name) } }, '测算'),
                        h('button', { className: 'pos-link', onClick: (e) => { e.stopPropagation(); setExpanded(isOpen ? '' : s.name) } }, isOpen ? '收起' : '展开')
                      )
                    ))
                    if (isOpen) {
                      rows.push(h('tr', { key: 'd-' + s.name, className: 'pos-detail' },
                        h('td', { colSpan: columns }, h('div', { className: 'pos-detail-box' }, h(Ledger, ledgerProps(s))))
                      ))
                    }
                    return rows
                  })
                ])
              )
            )
          ),

          view.stocks.length === 0 ? h('div', { className: 'pos-empty' }, '还没有持仓，用上方的「记一笔」开始。') : null,

          h('p', { className: 'pos-note' },
            '费用默认按成交额 × ' + (feeRate * 100).toFixed(2) + '% 估算；成交记录里写了费用就优先用记录值（* 号标注）。')
        ),

        groupOpen ? h(GroupModal, { stocks: view.stocks, onClose: () => setGroupOpen(false), onSave: saveGroups }) : null,

        calcStock ? h(Modal, { title: calcStock.name + ' · 历史记录与测算', onClose: () => setCalcFor('') },
          h(Ledger, ledgerProps(calcStock))
        ) : null
      )
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 8, label: () => '台账' }, Icon)
      )
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(Page))
      )
    }

    return { inject: ['slots'], apply }
  }
})
