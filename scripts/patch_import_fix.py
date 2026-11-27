# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# 1) form.date -> today()
old = "        const filled = buildRecords(table, mapping, { side: defaultSide, date: form.date }).map((r) => {"
new = "        const filled = buildRecords(table, mapping, { side: defaultSide, date: today() }).map((r) => {"
assert old in s
s = s.replace(old, new)

# 2) 抽出模型识别列函数 + 自动调用
old2 = """      const parse = (raw) => {
        const table = parseTable(raw)
        setTable(table)
        setMapping(table.mapping)
        const missing = ['date', 'side', 'price', 'qty'].filter((key) => table.mapping[key] === undefined)
        if (missing.length) {
          setRows([])
          setShowMap(true)
          setNote('识别到 ' + table.header.length + ' 列，但缺少：' + missing.map((k) => COLUMN_LABELS[k]).join('、') + '。请在下方「列映射」里指定。')
          return
        }
        applyTable(table, table.mapping)
      }"""
new2 = """      const askModel = async (tbl, baseMapping) => {
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
      }"""
assert old2 in s
s = s.replace(old2, new2)

# 3) 按钮复用 askModel
old3 = """                enabled ? h('button', {
                  className: 'pos-mini', style: { marginLeft: 'auto' },
                  onClick: async () => {
                    try {
                      const res = await fetch(API + '/map-columns', {
                        method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ header: table.header, sample: table.rows.slice(0, 3) })
                      })
                      const json = await res.json()
                      if (!json.ok) { setNote('模型识别失败：' + (json.error || '未知原因')); return }
                      const merged = Object.assign({}, mapping, json.mapping)
                      setMapping(merged)
                      applyTable(table, merged)
                      setNote('模型建议的列映射已填入，请核对')
                    } catch (err) {
                      setNote('模型识别失败：' + String(err.message || err))
                    }
                  }
                }, '用模型识别列') : null"""
new3 = """                enabled ? h('button', {
                  className: 'pos-mini', style: { marginLeft: 'auto' },
                  onClick: () => askModel(table, mapping)
                }, '用模型识别列') : null"""
assert old3 in s
s = s.replace(old3, new3)

# 4) 开关文案：截图 + 表头
old4 = """          h('span', null, '联网识别截图'),
          h('span', { className: 'hint' }, enabled ? '已开启：截图会发送给当前 Harness 模型' : '已关闭：截图不会离开本机'),"""
new4 = """          h('span', null, '联网智能识别'),
          h('span', { className: 'hint' }, enabled ? '已开启：截图和表头会发送给当前 Harness 模型' : '已关闭：数据不会离开本机'),"""
assert old4 in s
s = s.replace(old4, new4)

old5 = """            onClick: async () => {
              setError('')
              await onPatch('setVision', Object.assign({}, vdraft, { enabled: !enabled }))
              setNote(!enabled ? '已开启联网识别：截图会发送给当前 Harness 模型识别' : '已关闭联网识别')
            }"""
new5 = """            onClick: async () => {
              setError('')
              await onPatch('setVision', Object.assign({}, vdraft, { enabled: !enabled }))
              setNote(!enabled ? '已开启：截图识别 + 表头识别会使用当前 Harness 模型' : '已关闭：数据不再离开本机')
            }"""
assert old5 in s
s = s.replace(old5, new5)

# 5) 错误提示同步
old6 = """          setError('截图识别需要联网：请先打开上面的「联网识别截图」开关' + (configured ? '' : '（默认用当前 Harness 模型，识别失败可在下方指定接口）'))"""
new6 = """          setError('截图识别需要联网：请先打开上面的「联网智能识别」开关' + (configured ? '' : '（默认用当前 Harness 模型，识别失败可在下方指定接口）'))"""
assert old6 in s
s = s.replace(old6, new6)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("form bug + auto map patched")
