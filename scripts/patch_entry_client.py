# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# ---------- CSS ----------
anchor = ".pos-import-select { height:28px; border-radius:6px; border:1px solid #dde3ee; background:#fff; font-size:12px; padding:0 6px; max-width:150px; }"
css = anchor + """
.pos-drop { border:2px dashed #c7d2e5; border-radius:12px; padding:18px; text-align:center; color:#667085; font-size:12px;
  background:#fbfcff; margin-bottom:10px; }
.pos-drop.hot { border-color:#2457d6; background:#f2f6ff; color:#2457d6; }
.pos-drop strong { color:#1f2937; font-size:13px; display:block; margin-bottom:4px; }
.pos-quick { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; border:1px solid #b7e4cf;
  background:#e8f7f0; border-radius:10px; margin-top:10px; font-size:12px; }
"""
assert anchor in s
s = s.replace(anchor, css)

# ---------- EntryPanel ----------
anchor2 = "    /* -------------------------------------------------------- 归档弹窗 */"
panel = """    /* -------------------------------------------------------- 统一录入 */

    function EntryPanel(props) {
      const { stocks, state, seed, onClose, onImport, onPatch } = props
      const [text, setText] = useState('')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [hot, setHot] = useState(false)
      const [showVision, setShowVision] = useState(false)
      const vision = state.vision || {}
      const [vdraft, setVdraft] = useState({ baseUrl: vision.baseUrl || '', apiKey: vision.apiKey || '', model: vision.model || '' })
      const configured = !!(vision.apiKey && vision.baseUrl && vision.model)

      const parse = (raw) => {
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
      }

      const fileToDataUrl = (file) => new Promise((resolvePromise, rejectPromise) => {
        const reader = new FileReader()
        reader.onload = () => resolvePromise(String(reader.result || ''))
        reader.onerror = rejectPromise
        reader.readAsDataURL(file)
      })

      const readText = (file) => new Promise((resolvePromise, rejectPromise) => {
        const reader = new FileReader()
        reader.onload = () => resolvePromise(String(reader.result || ''))
        reader.onerror = rejectPromise
        reader.readAsText(file, 'utf-8')
      })

      const recognize = async (file) => {
        if (!configured) {
          setError('还没有配置视觉接口：请在下面「视觉接口设置」里填 Base URL、模型、API Key，保存后再试。')
          setShowVision(true)
          return
        }
        setBusy(true); setError('')
        try {
          const dataUrl = await fileToDataUrl(file)
          const res = await fetch(API + '/recognize', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
          })
          const json = await res.json()
          if (!json.ok) throw new Error(json.error || '识别失败')
          const list = Array.isArray(json.rows) ? json.rows : []
          if (!list.length) { setNote('没有从图片里识别出成交记录，换一张更清晰的截图试试'); return }
          const raw = list.map((r) => [r.date || '', r.side || '', r.price || '', r.qty || '', '', r.name || ''].join(',')).join('\\n')
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
          const raw = (json.lines || []).join('\\n')
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
        if (String(file.type || '').startsWith('image/')) return recognize(file)
        if (/\\.xlsx$/i.test(file.name)) return readXlsx(file)
        if (/\\.xls$/i.test(file.name)) { setError('旧版 .xls 不支持，请另存为 .xlsx 或 .csv'); return }
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
      }, [configured])

      const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? Object.assign({}, r, patch) : r)))
      const unmatched = rows.filter((r) => !r.name).length

      return h(Modal, { title: '录入成交', onClose, maxWidth: 900 },
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
          h('button', { className: 'pos-mini', style: { marginLeft: 'auto' }, onClick: () => setShowVision(!showVision) }, configured ? '视觉接口：已配置' : '视觉接口：未配置'),
          busy ? h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '处理中…') : null
        ),

        showVision
          ? h('div', { style: { border: '1px solid #dde3ee', borderRadius: 10, padding: 10, marginBottom: 10 } },
              h('p', { className: 'pos-sub', style: { marginTop: 0 } }, '截图识别需要联网：图片会发送到下面这个接口，只在识别时发送。'),
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
          placeholder: '2026-11-20,买入,9.50,500,,\\n2026-11-21,卖出,11.00,300,3.20,贵州茅台',
          value: text,
          onChange: (e) => { setText(e.target.value); if (rows.length) setRows([]) }
        }),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { className: 'pos-mini', onClick: () => parse(text) }, '解析文本')
        ),

        error ? h('p', { className: 'pos-error' }, error) : null,
        note ? h('p', { className: 'pos-note' }, note) : null,

        rows.length === 1
          ? h('div', { className: 'pos-quick' },
              h('span', null, '单条：'),
              h('select', { className: 'pos-import-select', value: rows[0].name, onChange: (e) => setRow(0, { name: e.target.value }) },
                h('option', { value: '' }, '— 选股票 —'),
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
              h('tbody', null, rows.map((r, i) => h('tr', { key: i, className: r.name ? '' : 'unmatched' },
                h('td', null, r.date),
                h('td', null, r.side),
                h('td', null, r.price),
                h('td', null, r.qty),
                h('td', null, r.fee || '—'),
                h('td', null, r.auto ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '按价格匹配') : null,
                  h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, { name: e.target.value }) },
                    h('option', { value: '' }, '— 请选择 —'),
                    stocks.map((s) => h('option', { key: s.name, value: s.name }, s.name))
                  )),
                h('td', null, h('button', { className: 'pos-link danger', onClick: () => setRows((prev) => prev.filter((_, idx) => idx !== i)) }, '删除'))
              )))
            )
          : null,

        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          unmatched ? h('span', { className: 'pos-error', style: { marginRight: 'auto' } }, '还有 ' + unmatched + ' 行未匹配') : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '取消'),
          h('button', { className: 'pos-btn primary', disabled: !rows.length || unmatched > 0 || busy, onClick: () => onImport(rows) }, '确认导入')
        )
      )
    }

""" + anchor2
assert anchor2 in s
s = s.replace(anchor2, panel)

# ---------- Page state ----------
old = """      const [noteFor, setNoteFor] = useState('')
      const [importOpen, setImportOpen] = useState(false)
      const [importText, setImportText] = useState('')
      const [imageOpen, setImageOpen] = useState(false)"""
new = """      const [noteFor, setNoteFor] = useState('')
      const [entryOpen, setEntryOpen] = useState(false)
      const [entrySeed, setEntrySeed] = useState(null)"""
assert old in s
s = s.replace(old, new)

# ---------- 全局粘贴/拖拽 ----------
old = """      useEffect(() => { load() }, [])"""
new = """      useEffect(() => { load() }, [])

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
      }, [entryOpen])"""
assert old in s
s = s.replace(old, new)

# ---------- 按钮：删除 导入/上传图片，换成一个「录入」 ----------
old = """            h('button', { className: 'pos-btn', onClick: () => { setImportText(''); setImportOpen(true) } }, '导入'),
            h('button', { className: 'pos-btn', onClick: () => setImageOpen(true) }, '上传图片'),"""
new = """            h('button', { className: 'pos-btn', onClick: () => { setEntrySeed(null); setEntryOpen(true) } }, '录入 (文件/截图)'),"""
assert old in s
s = s.replace(old, new)

# ---------- 渲染：去掉旧弹窗，换成 EntryPanel ----------
old_start = "        imageOpen ? h(ImageModal, {"
old_end = "        groupOpen ? h(GroupModal,"
i = s.find(old_start)
j = s.find(old_end)
assert i >= 0 and j > i
new_block = """        entryOpen ? h(EntryPanel, {
          stocks: view.stocks.filter((s) => !s.archived),
          state,
          seed: entrySeed,
          onClose: () => { setEntryOpen(false); setEntrySeed(null) },
          onPatch: act,
          onImport: async (rows) => {
            for (const r of rows) {
              const payload = { name: r.name, date: r.date, side: r.side, price: r.price, qty: r.qty }
              if (r.fee !== '' && r.side !== '分红') payload.feeOverride = r.fee
              await act('addTrade', payload)
            }
            setEntryOpen(false)
            setEntrySeed(null)
          }
        }) : null,
"""
s = s[:i] + new_block + s[j:]

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("entry panel patched")
