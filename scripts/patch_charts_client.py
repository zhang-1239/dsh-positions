# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 指标元数据 + SVG 图表 + 弹窗，插在「统一录入」之前
anchor = "    /* -------------------------------------------------------- 统一录入 */"
chart_code = """    /* -------------------------------------------------------- 图表 */

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
          }))))
        }
        const area = type === 'area'
          ? h('path', { key: key + 'a', d: line + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - P.b) + ' L ' + pts[0][0].toFixed(1) + ' ' + (H - P.b) + ' Z', fill: color, opacity: 0.12 })
          : null
        return h('g', { key },
          area,
          h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 2 }),
          pts.map((pt, i) => h('circle', { key: i, cx: pt[0], cy: pt[1], r: 2.4, fill: color }))
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
        const list = String(importText || '').split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
          const cells = line.split(/[,\\s]+/).filter(Boolean)
          return { date: cells[0], value: Number(cells[1]) }
        }).filter((p) => /^\\d{4}-\\d{2}-\\d{2}/.test(p.date) && Number.isFinite(p.value))
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
                placeholder: '每行：日期,数值\\n2027-01-05,3200.5\\n2027-02-10,3180.2',
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

""" + anchor
assert anchor in s
s = s.replace(anchor, chart_code)

# Ledger: 生成图表按钮
old = """        h('div', { className: 'pos-calc-actions' },
          h('button', { className: 'pos-mini', onClick: () => { setRows((prev) => prev.concat([{ side: '买入', price: '', qty: '' }])); setDirty(true) } }, '+ 添加一组测算'),"""
new = """        h('div', { className: 'pos-calc-actions' },
          onChart ? h('button', { className: 'pos-mini', style: { marginRight: 'auto' }, onClick: () => onChart(stock.name) }, '生成图表') : null,
          h('button', { className: 'pos-mini', onClick: () => { setRows((prev) => prev.concat([{ side: '买入', price: '', qty: '' }])); setDirty(true) } }, '+ 添加一组测算'),"""
assert old in s
s = s.replace(old, new)

# Ledger props 解构
old = """      const { stock, rule, savedRows, onSave, onDeleteRecord, customColumns, onSetField } = props"""
new = """      const { stock, rule, savedRows, onSave, onDeleteRecord, customColumns, onSetField, onChart } = props"""
assert old in s
s = s.replace(old, new)

# Page: chartFor 状态
old = """      const [entryOpen, setEntryOpen] = useState(false)"""
new = """      const [entryOpen, setEntryOpen] = useState(false)
      const [chartFor, setChartFor] = useState('')"""
assert old in s
s = s.replace(old, new)

# ledgerProps 传 onChart
old = """        onSetField: (name, key, value) => act('setField', { name, key, value }),"""
new = """        onSetField: (name, key, value) => act('setField', { name, key, value }),
        onChart: (name) => setChartFor(name),"""
assert old in s
s = s.replace(old, new)

# 渲染 ChartModal
old = """        entryOpen ? h(EntryPanel, {"""
new = """        chartFor ? h(ChartModal, {
          stock: view.stocks.find((s) => s.name === chartFor),
          state,
          onClose: () => setChartFor(''),
          onPatch: act
        }) : null,
        entryOpen ? h(EntryPanel, {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("charts patched")
