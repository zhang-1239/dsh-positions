# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# imports
old = "import { dirname, join, resolve } from 'node:path'"
assert old in s
s = s.replace(old, old + "\nimport { inflateRawSync } from 'node:zlib'")

# xlsx 解析
anchor = "/* -------------------------------------------------------------------- 动作 */"
xlsx = """/* ------------------------------------------------------------------ xlsx */

function unzipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw bad('不是有效的 xlsx 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const files = {}
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const csize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + csize)
    files[name] = method === 0 ? raw : inflateRawSync(raw)
    off += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function xmlText(xml) {
  return String(xml)
    .replace(/<\\/?t[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function colIndex(ref) {
  const letters = (String(ref).match(/^[A-Z]+/) || ['A'])[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseXlsx(buf) {
  const files = unzipEntries(buf)
  const sheetName = Object.keys(files).find((n) => /^xl\\/worksheets\\/sheet1\\.xml$/.test(n)) || Object.keys(files).find((n) => /^xl\\/worksheets\\/.*\\.xml$/.test(n))
  if (!sheetName) throw bad('xlsx 里找不到工作表')
  const sharedXml = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : ''
  const shared = []
  for (const m of sharedXml.matchAll(/<si>([\\s\\S]*?)<\\/si>/g)) shared.push(xmlText(m[1]))

  const sheetXml = files[sheetName].toString('utf8')
  const lines = []
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\\s\\S]*?)<\\/row>/g)) {
    const cells = []
    for (const c of rowMatch[1].matchAll(/<c\\s+([^>]*?)(\\/>|>([\\s\\S]*?)<\\/c>)/g)) {
      const attrs = c[1]
      const body = c[3] || ''
      const type = (attrs.match(/\\bt="([^"]+)"/) || [])[1] || ''
      const ref = (attrs.match(/\\br="([^"]+)"/) || [])[1] || ''
      const rawValue = (body.match(/<v>([\\s\\S]*?)<\\/v>/) || [])[1]
      let value = ''
      if (type === 's') value = shared[Number(rawValue)] ?? ''
      else if (type === 'inlineStr') value = xmlText((body.match(/<is>([\\s\\S]*?)<\\/is>/) || [])[1] || '')
      else if (rawValue !== undefined) value = xmlText(rawValue)
      const index = ref ? colIndex(ref) : cells.length
      cells[index] = String(value).trim()
    }
    const line = cells.map((v) => v ?? '').join(',').replace(/,+$/, '')
    if (line.trim()) lines.push(line)
  }
  return lines
}

""" + anchor
assert anchor in s
s = s.replace(anchor, xlsx)

# vision 配置
old = """    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,"""
new = """    feeRate: num(state.feeRate) > 0 ? num(state.feeRate) : 0.0003,
    vision: {
      baseUrl: str(state.vision?.baseUrl).slice(0, 300),
      apiKey: str(state.vision?.apiKey).slice(0, 300),
      model: str(state.vision?.model).slice(0, 100)
    },"""
assert old in s
s = s.replace(old, new)

# setVision action
old = """  setNote(state, payload) {"""
new = """  setVision(state, payload) {
    state.vision = {
      baseUrl: str(payload?.baseUrl).slice(0, 300),
      apiKey: str(payload?.apiKey).slice(0, 300),
      model: str(payload?.model).slice(0, 100)
    }
    return state
  },

  setNote(state, payload) {"""
assert old in s
s = s.replace(old, new)

# 路由：/parse-xlsx 与 /recognize
old = """      if (req.method === 'POST' && suffix === '/action') {"""
new = """      if (req.method === 'POST' && suffix === '/parse-xlsx') {
        const body = await readJson(req)
        const data = str(body?.data)
        if (!data) { send(res, 400, { ok: false, error: '缺少文件内容' }); return }
        const buf = Buffer.from(data, 'base64')
        if (buf.length > 8 * 1024 * 1024) { send(res, 413, { ok: false, error: '文件过大（上限 8MB）' }); return }
        const lines = parseXlsx(buf)
        send(res, 200, { ok: true, lines })
        return
      }

      if (req.method === 'POST' && suffix === '/recognize') {
        const body = await readJson(req)
        const vision = state.vision || {}
        if (!vision.apiKey || !vision.baseUrl || !vision.model) {
          send(res, 400, { ok: false, error: '还没有配置视觉接口（Base URL / API Key / 模型）' })
          return
        }
        const image = str(body?.image)
        if (!image.startsWith('data:image/')) { send(res, 400, { ok: false, error: '图片格式不对' }); return }
        if (image.length > 6 * 1024 * 1024) { send(res, 413, { ok: false, error: '图片过大（上限 6MB）' }); return }
        const prompt = [
          '你是股票成交记录提取器。从图片中提取所有成交记录，输出严格 JSON 数组，不要任何解释。',
          '每项字段：date（YYYY-MM-DD）、side（买入/卖出/分红）、price（数字）、qty（数字）、name（股票名称，没有就空字符串）。',
          '如果图片里没有日期，date 用今天。无法识别的行直接跳过。'
        ].join('\\n')
        const endpoint = vision.baseUrl.replace(/\\/+$/, '') + '/chat/completions'
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + vision.apiKey },
          body: JSON.stringify({
            model: vision.model,
            temperature: 0,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: [
                { type: 'text', text: '提取这些成交记录' },
                { type: 'image_url', image_url: { url: image } }
              ] }
            ]
          })
        })
        const text = await response.text()
        if (!response.ok) {
          send(res, 502, { ok: false, error: '视觉接口返回 ' + response.status + '：' + text.slice(0, 200) })
          return
        }
        let content = ''
        try {
          const json = JSON.parse(text)
          content = json.choices?.[0]?.message?.content ?? ''
        } catch {
          send(res, 502, { ok: false, error: '视觉接口返回的不是 JSON' })
          return
        }
        const match = String(content).match(/\\[[\\s\\S]*\\]/)
        if (!match) { send(res, 200, { ok: true, rows: [] }); return }
        let rows = []
        try { rows = JSON.parse(match[0]) } catch { rows = [] }
        send(res, 200, { ok: true, rows: Array.isArray(rows) ? rows.slice(0, 200) : [] })
        return
      }

      if (req.method === 'POST' && suffix === '/action') {"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("server xlsx+vision patched")
