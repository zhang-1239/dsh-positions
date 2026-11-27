# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\index.js"
s = open(p, encoding="utf-8").read()

anchor = "function bad(message) {"
conv = """const SIDE_TO_MINI = { '买入': '转入', '卖出': '转出', '分红': '收益' }
const SIDE_FROM_MINI = { '转入': '买入', '转出': '卖出', '收益': '分红' }

function lastQty(records) {
  let n = 0
  for (const r of records) {
    if (r.side === '买入' || r.side === '转入') n += Number(r.qty)
    else if (r.side === '卖出' || r.side === '转出') n -= Number(r.qty)
  }
  return n
}

function toMiniPayload(state) {
  const sids = new Map()
  const stocks = state.stocks.map((s, i) => {
    const sid = s.sid || 's' + (i + 1)
    sids.set(s.name, sid)
    const records = (s.records || []).map((r) => {
      const out = { date: r.date, side: SIDE_TO_MINI[r.side] || r.side, price: Number(r.price), qty: Number(r.qty) }
      if (r.feeOverride !== undefined && r.feeOverride !== null) out.fee = Number(r.feeOverride)
      return out
    })
    const qty = lastQty(records)
    return {
      name: s.name,
      sid,
      group: s.group || '',
      marketValue: Number(((Number(s.price) || 0) * qty).toFixed(2)),
      dayPnl: Number(s.dayPnl) || 0,
      records
    }
  })
  const notes = {}
  const archived = {}
  const calc = {}
  state.stocks.forEach((s) => {
    const sid = sids.get(s.name)
    if (s.note) notes[sid] = s.note
    if (s.archived) archived[sid] = true
    if (state.calc && state.calc[s.name]) calc[sid] = state.calc[s.name]
  })
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    holdings: {
      meta: { version: 1, updatedAt: new Date().toISOString().slice(0, 10), note: '持仓成本台导出' },
      feeRate: state.feeRate,
      stocks
    },
    theory: [],
    calc,
    notes,
    archived,
    feeRules: {
      list: (state.feeRules || []).map((r) => ({
        id: r.id,
        name: r.name,
        categories: (r.categories || []).map((c) => ({
          key: c.id,
          label: c.name,
          commissionRate: c.commissionRate,
          minCommission: c.minCommission,
          stampDutyRate: c.stampDutyRate,
          transferFeeRate: c.transferFeeRate,
          otherFixed: c.otherFixed
        }))
      })),
      activeId: state.activeFeeRule
    },
    columns: (state.columns || []).filter((c) => !c.builtin).map((c) => ({ key: c.key, label: c.label })),
    groups: Array.from(new Set(state.stocks.map((s) => s.group).filter(Boolean)))
  }
}

function fromMiniPayload(payload) {
  const stocks = payload.holdings.stocks.map((s, i) => {
    const records = (s.records || []).map((r) => {
      const out = {
        date: r.date,
        side: SIDE_FROM_MINI[r.side] || r.side,
        price: Number(r.price),
        qty: Number(r.qty)
      }
      if (r.fee !== undefined) out.feeOverride = Number(r.fee)
      return out
    })
    const qty = lastQty(records)
    const price = qty > 0 ? Number(s.marketValue || 0) / qty : 0
    const sid = s.sid || 's' + (i + 1)
    return {
      raw: {
        name: s.name,
        group: s.group || '',
        price,
        dayPnl: Number(s.dayPnl) || 0,
        archived: !!(payload.archived && payload.archived[sid]),
        note: (payload.notes && payload.notes[sid]) || '',
        fields: {},
        records
      },
      sid
    }
  })
  const calc = {}
  for (const item of stocks) {
    if (payload.calc && payload.calc[item.sid]) calc[item.raw.name] = payload.calc[item.sid]
  }
  const feeRules = payload.feeRules && Array.isArray(payload.feeRules.list)
    ? payload.feeRules.list.map((r) => ({
        id: r.id,
        name: r.name,
        categories: (r.categories || []).map((c) => ({
          id: c.key || c.id,
          name: c.label || c.name,
          commissionRate: c.commissionRate,
          minCommission: c.minCommission,
          stampDutyRate: c.stampDutyRate,
          transferFeeRate: c.transferFeeRate,
          otherFixed: c.otherFixed
        }))
      }))
    : null
  const customColumns = Array.isArray(payload.columns)
    ? payload.columns.map((c) => ({ key: c.key, label: c.label, builtin: false }))
    : []
  return {
    stocks: stocks.map((item) => item.raw),
    feeRules,
    activeFeeRule: payload.feeRules ? payload.feeRules.activeId : undefined,
    customColumns,
    calc
  }
}

""" + anchor
assert anchor in s
s = s.replace(anchor, conv)

# 路由：导出 / 导入
old = """      if (req.method === 'POST' && suffix === '/parse-xlsx') {"""
new_route = """      if (req.method === 'GET' && suffix === '/export-json') {
        send(res, 200, { ok: true, payload: toMiniPayload(state) })
        return
      }

      if (req.method === 'POST' && suffix === '/import-json') {
        const body = await readJson(req)
        const payload = body && body.data
        if (!isObject(payload)) { send(res, 400, { ok: false, error: '内容不是合法 JSON 对象' }); return }

        let converted
        if (isObject(payload.holdings) && Array.isArray(payload.holdings.stocks)) {
          converted = fromMiniPayload(payload)
        } else if (Array.isArray(payload.stocks)) {
          const normalized = normalizeState(Object.assign({}, state, payload))
          converted = {
            stocks: normalized.stocks,
            feeRules: normalized.feeRules,
            activeFeeRule: normalized.activeFeeRule,
            customColumns: normalized.columns.filter((c) => !c.builtin),
            calc: normalized.calc
          }
        } else {
          send(res, 400, { ok: false, error: '认不出这个 JSON：既不是小程序导出，也不是插件备份' })
          return
        }

        try {
          writeFileSync(stateFile + '.backup-' + Date.now() + '.json', JSON.stringify(state, null, 2), 'utf8')
        } catch { /* 备份失败不阻塞 */ }

        const next = normalizeState({
          feeRate: state.feeRate,
          tags: state.tags,
          activeTags: state.activeTags,
          charts: state.charts,
          vision: state.vision,
          columns: state.columns.filter((c) => c.builtin).concat(converted.customColumns || []),
          feeRules: converted.feeRules || state.feeRules,
          activeFeeRule: converted.activeFeeRule,
          calc: converted.calc || {},
          stocks: converted.stocks
        })
        state = next
        persist(state)
        send(res, 200, { ok: true, state })
        return
      }

      if (req.method === 'POST' && suffix === '/parse-xlsx') {"""
assert old in s
s = s.replace(old, new_route)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("json export/import patched")
