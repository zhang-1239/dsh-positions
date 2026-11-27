# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

anchor = "    /* -------------------------------------------------------- 图表 */"
data_modal = """    /* -------------------------------------------------------- 数据互通 */

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

""" + anchor
assert anchor in s
s = s.replace(anchor, data_modal)

# Page 状态 + 按钮 + 渲染
old = """      const [chartFor, setChartFor] = useState('')"""
new = """      const [chartFor, setChartFor] = useState('')
      const [dataOpen, setDataOpen] = useState(false)"""
assert old in s
s = s.replace(old, new)

old2 = """              h('button', { className: 'pos-btn', onClick: load, disabled: busy }, '刷新')"""
new2 = """              h('button', { className: 'pos-btn', onClick: () => setDataOpen(true) }, '数据'),
              h('button', { className: 'pos-btn', onClick: load, disabled: busy }, '刷新')"""
assert old2 in s
s = s.replace(old2, new2)

old3 = """        chartFor ? h(ChartModal, {"""
new3 = """        dataOpen ? h(DataModal, {
          onClose: () => setDataOpen(false),
          onImported: (nextState) => setData((prev) => Object.assign({}, prev, { state: nextState }))
        }) : null,
        chartFor ? h(ChartModal, {"""
assert old3 in s
s = s.replace(old3, new3)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("data modal patched")
