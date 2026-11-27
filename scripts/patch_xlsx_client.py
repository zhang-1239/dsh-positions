# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# --- ImportModal: initialText + 自动匹配标记 + xlsx ---
old = """      const { stocks, onClose, onImport } = props
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
      }"""
new = """      const { stocks, onClose, onImport, initialText } = props
      const [text, setText] = useState(initialText || '')
      const [rows, setRows] = useState([])
      const [note, setNote] = useState('')

      const parse = (raw) => {
        const parsed = parseImport(raw).map((r) => {
          const explicit = r.name && stocks.some((s) => s.name === r.name)
          const auto = !explicit && !r.name ? matchByPrice(stocks, r.price) : ''
          return Object.assign({}, r, { name: explicit ? r.name : (r.name || auto), auto: !explicit && !!auto })
        })
        const autoCount = parsed.filter((r) => r.auto).length
        setRows(parsed)
        setNote(parsed.length
          ? '解析到 ' + parsed.length + ' 条' + (autoCount ? '，其中 ' + autoCount + ' 条没写股票名，已按价格自动匹配（标「按价格匹配」）' : '') + '，请核对后再导入'
          : '没有解析到有效行，格式示例：2026-11-20,买入,9.50,500,,贵州茅台')
      }

      useEffect(() => { if (initialText) parse(initialText) }, [])

      const pickFile = (file) => {
        if (!file) return
        if (/\\.xlsx$/i.test(file.name)) {
          const reader = new FileReader()
          reader.onload = async () => {
            try {
              const base64 = String(reader.result || '').split(',')[1] || ''
              const res = await fetch(API + '/parse-xlsx', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ data: base64 })
              })
              const json = await res.json()
              if (!json.ok) throw new Error(json.error || '解析失败')
              const raw = (json.lines || []).join('\\n')
              setText(raw)
              parse(raw)
            } catch (err) {
              setNote('Excel 解析失败：' + String(err.message || err))
            }
          }
          reader.readAsDataURL(file)
          return
        }
        if (/\\.xls$/i.test(file.name)) {
          setNote('旧版 .xls 不支持，请在 Excel 里另存为 .xlsx 或 .csv')
          return
        }
        const reader = new FileReader()
        reader.onload = () => { const raw = String(reader.result || ''); setText(raw); parse(raw) }
        reader.readAsText(file, 'utf-8')
      }"""
assert old in s
s = s.replace(old, new)

# 文件选择 accept 加 xlsx
old = """h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', onChange: (e) => pickFile(e.target.files && e.target.files[0]) }),"""
new = """h('input', { type: 'file', accept: '.csv,.txt,.xlsx,text/csv,text/plain', onChange: (e) => pickFile(e.target.files && e.target.files[0]) }),"""
assert old in s
s = s.replace(old, new)

# 自动匹配行加标记
old = """                h('td', null, h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, e.target.value) },"""
new = """                h('td', null, r.auto ? h('span', { className: 'pos-chip', style: { height: 20, fontSize: 10, marginRight: 4, background: '#fff7e6', borderColor: '#f3d19e', color: '#b45309' } }, '按价格匹配') : null,
                  h('select', { className: 'pos-import-select', value: r.name, onChange: (e) => setRow(i, e.target.value) },"""
assert old in s
s = s.replace(old, new)

# --- ImageModal 组件 ---
anchor = "    /* -------------------------------------------------------- 归档弹窗 */"
image_modal = """    /* -------------------------------------------------------- 图片识别 */

    function ImageModal(props) {
      const { state, onClose, onRecognized, onPatch } = props
      const vision = state.vision || {}
      const [draft, setDraft] = useState({ baseUrl: vision.baseUrl || '', apiKey: vision.apiKey || '', model: vision.model || '' })
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const [saved, setSaved] = useState(false)
      const configured = !!(vision.apiKey && vision.baseUrl && vision.model)

      const saveConfig = async () => {
        await onPatch('setVision', draft)
        setSaved(true)
      }

      const upload = (file) => {
        if (!file) return
        if (!configured) { setErr('请先保存 Base URL / API Key / 模型'); return }
        if (file.size > 4 * 1024 * 1024) { setErr('图片请小于 4MB'); return }
        const reader = new FileReader()
        reader.onload = async () => {
          setBusy(true); setErr('')
          try {
            const res = await fetch(API + '/recognize', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ image: String(reader.result || '') })
            })
            const json = await res.json()
            if (!json.ok) throw new Error(json.error || '识别失败')
            const rows = Array.isArray(json.rows) ? json.rows : []
            if (!rows.length) { setErr('没有从图片里识别出成交记录，换一张更清晰的试试'); return }
            const lines = rows.map((r) => [r.date || '', r.side || '', r.price || '', r.qty || '', '', r.name || ''].join(','))
            onRecognized(lines)
          } catch (e) {
            setErr(String(e.message || e))
          } finally {
            setBusy(false)
          }
        }
        reader.readAsDataURL(file)
      }

      return h(Modal, { title: '上传图片识别（需要联网）', onClose, maxWidth: 620 },
        h('p', { className: 'pos-sub', style: { marginTop: 0 } },
          '识别时会把这张截图发送到你自己配置的视觉接口（走网络），不会上传到别处。第一次使用请先填好接口信息。'),
        h('div', { className: 'pos-fee-grid' },
          h('div', { className: 'pos-fee-field' },
            h('label', null, 'Base URL'),
            h('input', { className: 'pos-input', placeholder: 'https://api.openai.com/v1', value: draft.baseUrl, onChange: (e) => setDraft(Object.assign({}, draft, { baseUrl: e.target.value })) })
          ),
          h('div', { className: 'pos-fee-field' },
            h('label', null, '模型'),
            h('input', { className: 'pos-input', placeholder: 'gpt-4o-mini / qwen-vl-max', value: draft.model, onChange: (e) => setDraft(Object.assign({}, draft, { model: e.target.value })) })
          ),
          h('div', { className: 'pos-fee-field' },
            h('label', null, 'API Key'),
            h('input', { className: 'pos-input', type: 'password', placeholder: 'sk-…', value: draft.apiKey, onChange: (e) => setDraft(Object.assign({}, draft, { apiKey: e.target.value })) })
          )
        ),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 } },
          h('button', { className: 'pos-btn', onClick: saveConfig }, '保存配置'),
          saved ? h('span', { className: 'pos-chip ok', style: { height: 26 } }, '已保存') : null,
          configured ? h('span', { className: 'pos-chip ok', style: { height: 26 } }, '已配置') : h('span', { className: 'pos-chip warn', style: { height: 26 } }, '未配置')
        ),
        err ? h('p', { className: 'pos-error' }, err) : null,
        h('div', { style: { marginTop: 12 } },
          h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 6 } }, '选择截图（成交记录 / 对账单）'),
          h('input', { type: 'file', accept: 'image/*', disabled: busy, onChange: (e) => upload(e.target.files && e.target.files[0]) })
        ),
        h('p', { className: 'pos-note' }, '图片会先转成文字行，再进入导入预览，你可以逐行核对、改股票、再确认导入。')
      )
    }

""" + anchor
assert anchor in s
s = s.replace(anchor, image_modal)

# --- Page 状态 ---
old = """      const [noteFor, setNoteFor] = useState('')
      const [importOpen, setImportOpen] = useState(false)"""
new = """      const [noteFor, setNoteFor] = useState('')
      const [importOpen, setImportOpen] = useState(false)
      const [importText, setImportText] = useState('')
      const [imageOpen, setImageOpen] = useState(false)"""
assert old in s
s = s.replace(old, new)

# --- 表单行加「上传图片」按钮 ---
old = """            h('button', { className: 'pos-btn', onClick: () => setImportOpen(true) }, '导入'),"""
new = """            h('button', { className: 'pos-btn', onClick: () => { setImportText(''); setImportOpen(true) } }, '导入'),
            h('button', { className: 'pos-btn', onClick: () => setImageOpen(true) }, '上传图片'),"""
assert old in s
s = s.replace(old, new)

# --- 渲染 ImportModal 传 initialText + ImageModal ---
old = """        importOpen ? h(ImportModal, {
          stocks: view.stocks.filter((s) => !s.archived),"""
new = """        imageOpen ? h(ImageModal, {
          state,
          onClose: () => setImageOpen(false),
          onPatch: act,
          onRecognized: (lines) => { setImageOpen(false); setImportText(lines.join('\\n')); setImportOpen(true) }
        }) : null,
        importOpen ? h(ImportModal, {
          key: importText || 'blank',
          initialText: importText,
          stocks: view.stocks.filter((s) => !s.archived),"""
assert old in s
s = s.replace(old, new)

old = """          onImport: async (rows) => {
            for (const r of rows) {"""
new = """          onImport: async (rows) => {
            setImportText('')
            for (const r of rows) {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("client xlsx+image patched")
