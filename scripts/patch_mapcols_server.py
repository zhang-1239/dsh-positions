# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

# 文本版 Harness 调用（无图片）
anchor = "async function recognizeViaHarness(ctx, dataUrl, prompt) {"
helper = """async function askHarnessText(ctx, prompt) {
  const llm = ctx.llm
  if (!llm || typeof llm.stream !== 'function') return { ok: false, error: '当前 Harness 没有可用的模型服务' }
  const sel = ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function'
    ? ctx.agentDefaultModel.currentSelection()
    : null
  if (!sel || !sel.provider || !sel.model) return { ok: false, error: '当前会话没有默认模型' }
  const result = await llm.stream({
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-positions',
    temperature: 0,
    messages: [{
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: prompt }]
    }]
  })
  let text = ''
  if (typeof result === 'string') text = result
  else if (result && typeof result.text === 'string') text = result.text
  else if (result && typeof result[Symbol.asyncIterator] === 'function') {
    for await (const chunk of result) {
      if (typeof chunk === 'string') text += chunk
      else if (chunk && typeof chunk.text === 'string') text += chunk.text
      else if (chunk && typeof chunk.delta === 'string') text += chunk.delta
    }
  } else if (result && result.content) {
    const parts = Array.isArray(result.content) ? result.content : [result.content]
    text = parts.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
  }
  return { ok: true, text }
}

""" + anchor
assert anchor in s
s = s.replace(anchor, helper)

# /map-columns 路由
old = "      if (req.method === 'POST' && suffix === '/action') {"
new_route = """      if (req.method === 'POST' && suffix === '/map-columns') {
        const body = await readJson(req)
        if (state.vision?.enabled !== true) {
          send(res, 400, { ok: false, error: '需要先打开「联网识别」开关' })
          return
        }
        const header = Array.isArray(body?.header) ? body.header.slice(0, 30).map((x) => String(x)) : []
        const sample = Array.isArray(body?.sample) ? body.sample.slice(0, 3).map((r) => (Array.isArray(r) ? r.slice(0, 30).map((x) => String(x)) : [])) : []
        if (!header.length) { send(res, 400, { ok: false, error: '缺少表头' }); return }
        const prompt = [
          '你在帮用户把成交表格的列对应到固定字段。',
          '字段有：date(日期)、side(买入/卖出/分红)、price(成交价)、qty(成交数量)、fee(费用)、name(股票名称)。',
          '只输出一个 JSON 对象，键是字段名，值是该字段所在的列序号（从 0 开始），没有的字段输出 null。不要解释。',
          '表头：' + JSON.stringify(header),
          '样例行：' + JSON.stringify(sample)
        ].join('\\n')
        try {
          const result = await askHarnessText(ctx, prompt)
          if (!result.ok) { send(res, 200, { ok: false, error: result.error || '模型不可用' }); return }
          const match = String(result.text || '').match(/\\{[\\s\\S]*\\}/)
          if (!match) { send(res, 200, { ok: false, error: '模型没有返回可用的列映射' }); return }
          let mapping = {}
          try { mapping = JSON.parse(match[0]) } catch { mapping = {} }
          const clean = {}
          for (const key of ['date', 'side', 'price', 'qty', 'fee', 'name']) {
            const value = mapping[key]
            if (Number.isInteger(value) && value >= 0 && value < header.length) clean[key] = value
          }
          send(res, 200, { ok: true, mapping: clean })
        } catch (error) {
          send(res, 200, { ok: false, error: error?.message || String(error) })
        }
        return
      }

      if (req.method === 'POST' && suffix === '/action') {"""
assert old in s
s = s.replace(old, new_route)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("map-columns patched")
