# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# 1) vision.enabled
old = """    vision: {
      baseUrl: str(state.vision?.baseUrl).slice(0, 300),"""
new = """    vision: {
      enabled: state.vision?.enabled === true,
      baseUrl: str(state.vision?.baseUrl).slice(0, 300),"""
assert old in s
s = s.replace(old, new)

old = """  setVision(state, payload) {
    state.vision = {
      baseUrl: str(payload?.baseUrl).slice(0, 300),"""
new = """  setVision(state, payload) {
    state.vision = {
      enabled: payload?.enabled === true,
      baseUrl: str(payload?.baseUrl).slice(0, 300),"""
assert old in s
s = s.replace(old, new)

# 2) 用 Harness 模型识别
anchor = "function bad(message) {"
harness = """async function recognizeViaHarness(ctx, dataUrl, prompt) {
  const llm = ctx.llm
  if (!llm || typeof llm.stream !== 'function') return { ok: false, error: '当前 Harness 没有可用的模型服务' }
  const sel = ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function'
    ? ctx.agentDefaultModel.currentSelection()
    : null
  if (!sel || !sel.provider || !sel.model) return { ok: false, error: '当前会话没有默认模型' }
  const m = /^data:(image\\/[a-zA-Z0-9.+-]+);base64,([\\s\\S]+)$/.exec(dataUrl)
  if (!m) return { ok: false, error: '图片格式不对' }
  const messages = [{
    role: 'user',
    source: { kind: 'user' },
    content: [
      { type: 'text', text: prompt },
      { type: 'image', attachment: { mediaType: m[1], data: m[2] } }
    ]
  }]
  const result = await llm.stream({
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-positions',
    temperature: 0,
    messages
  })
  let text = ''
  if (typeof result === 'string') text = result
  else if (result && typeof result.text === 'string') text = result.text
  else if (result && typeof result[Symbol.asyncIterator] === 'function') {
    for await (const chunk of result) {
      if (typeof chunk === 'string') text += chunk
      else if (chunk && typeof chunk.text === 'string') text += chunk.text
    }
  } else if (result && result.content) {
    const parts = Array.isArray(result.content) ? result.content : [result.content]
    text = parts.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
  }
  return { ok: true, text }
}

""" + anchor
assert anchor in s
s = s.replace(anchor, harness)

# 3) /recognize 改：先看开关，再走 Harness，最后回退到自定义接口
old_start = "      if (req.method === 'POST' && suffix === '/recognize') {"
old_end = "      if (req.method === 'POST' && suffix === '/action') {"
i = s.find(old_start)
j = s.find(old_end)
assert i >= 0 and j > i
new_route = """      if (req.method === 'POST' && suffix === '/recognize') {
        const body = await readJson(req)
        const vision = state.vision || {}
        if (vision.enabled !== true) {
          send(res, 400, { ok: false, error: '截图识别需要联网，请先打开「联网识别」开关' })
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

        let rows = []
        let source = 'harness'
        let harnessError = ''
        try {
          const viaHarness = await recognizeViaHarness(ctx, image, prompt)
          if (viaHarness.ok) {
            const match = String(viaHarness.text || '').match(/\\[[\\s\\S]*\\]/)
            if (match) {
              try { rows = JSON.parse(match[0]) } catch { rows = [] }
            }
            if (!Array.isArray(rows)) rows = []
          } else {
            harnessError = viaHarness.error || 'Harness 模型不可用'
          }
        } catch (error) {
          harnessError = error?.message || String(error)
        }

        if (rows.length === 0 && vision.apiKey && vision.baseUrl && vision.model) {
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
          if (response.ok) {
            try {
              const json = JSON.parse(text)
              const content = json.choices?.[0]?.message?.content ?? ''
              const match = String(content).match(/\\[[\\s\\S]*\\]/)
              if (match) rows = JSON.parse(match[0])
              if (!Array.isArray(rows)) rows = []
              source = 'endpoint'
            } catch {
              send(res, 502, { ok: false, error: '接口返回的不是 JSON' })
              return
            }
          } else {
            send(res, 502, { ok: false, error: '视觉接口返回 ' + response.status + '：' + text.slice(0, 160) })
            return
          }
        }

        if (rows.length === 0) {
          send(res, 200, {
            ok: false,
            error: harnessError
              ? '识别失败：' + harnessError + '（可在「视觉接口设置」里指定一个支持图片的模型）'
              : '没有识别出成交记录，换一张更清晰的截图试试'
          })
          return
        }
        send(res, 200, { ok: true, source, rows: rows.slice(0, 200) })
        return
      }

      if (req.method === 'POST' && suffix === '/action') {"""
s = s[:i] + new_route + s[j:]

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("harness recognition patched")
