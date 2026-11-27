# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

# CSS: 开关
anchor = ".pos-quick { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; border:1px solid #b7e4cf;"
idx = s.find(anchor)
assert idx >= 0
end = s.find("\n", s.find("font-size:12px; }", idx))
insert = """
.pos-netrow { display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:10px;
  border:1px solid #dde3ee; border-radius:10px; background:#fbfcff; font-size:12px; color:#344054; }
.pos-switch { position:relative; width:44px; height:24px; border-radius:999px; background:#d0d5dd;
  cursor:pointer; transition:background .2s; flex:none; border:none; padding:0; }
.pos-switch.on { background:#2457d6; }
.pos-switch::after { content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
  background:#fff; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.25); }
.pos-switch.on::after { transform:translateX(20px); }
.pos-netrow .hint { color:#667085; }
"""
s = s[:end] + insert + s[end:]

# EntryPanel: enabled 常量
old = """      const configured = !!(vision.apiKey && vision.baseUrl && vision.model)"""
new = """      const configured = !!(vision.apiKey && vision.baseUrl && vision.model)
      const enabled = vision.enabled === true"""
assert old in s
s = s.replace(old, new)

# recognize: 改为开关判断
old = """      const recognize = async (file) => {
        if (!configured) {
          setError('还没有配置视觉接口：请在下面「视觉接口设置」里填 Base URL、模型、API Key，保存后再试。')
          setShowVision(true)
          return
        }"""
new = """      const recognize = async (file) => {
        if (!enabled) {
          setError('截图识别需要联网：请先打开上面的「联网识别截图」开关' + (configured ? '' : '（默认用当前 Harness 模型，识别失败可在下方指定接口）'))
          return
        }"""
assert old in s
s = s.replace(old, new)

# 渲染：开关行 + 说明
old = """        h('div', {
          className: 'pos-drop' + (hot ? ' hot' : ''),"""
new = """        h('div', { className: 'pos-netrow' },
          h('button', {
            className: 'pos-switch' + (enabled ? ' on' : ''),
            title: enabled ? '点击关闭联网识别' : '点击开启联网识别',
            onClick: async () => {
              await onPatch('setVision', Object.assign({}, vdraft, { enabled: !enabled }))
              setNote(!enabled ? '已开启联网识别：截图会发送给当前 Harness 模型识别' : '已关闭联网识别')
            }
          }),
          h('span', null, '联网识别截图'),
          h('span', { className: 'hint' }, enabled ? '已开启：截图会发送给当前 Harness 模型' : '已关闭：截图不会离开本机'),
          configured ? h('span', { className: 'pos-chip ok', style: { height: 22, fontSize: 11 } }, '自定义接口已配置') : null
        ),

        h('div', {
          className: 'pos-drop' + (hot ? ' hot' : ''),"""
assert old in s
s = s.replace(old, new)

# 视觉设置说明改成"可选回退"
old = """              h('p', { className: 'pos-sub', style: { marginTop: 0 } }, '截图识别需要联网：图片会发送到下面这个接口，只在识别时发送。'),"""
new = """              h('p', { className: 'pos-sub', style: { marginTop: 0 } },
                '默认使用当前 Harness 模型识别截图；如果它不支持图片或识别失败，可以在这里指定一个支持图片的接口（可选）。'),"""
assert old in s
s = s.replace(old, new)

# 视觉接口按钮文案
old = """h('button', { className: 'pos-mini', style: { marginLeft: 'auto' }, onClick: () => setShowVision(!showVision) }, configured ? '视觉接口：已配置' : '视觉接口：未配置'),"""
new = """h('button', { className: 'pos-mini', style: { marginLeft: 'auto' }, onClick: () => setShowVision(!showVision) }, configured ? '备用接口：已配置' : '备用接口（可选）'),"""
assert old in s
s = s.replace(old, new)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("client net switch patched")
