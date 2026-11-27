# -*- coding: utf-8 -*-
p = r"D:\PositionsWorkbench\plugin\client.js"
s = open(p, encoding="utf-8").read()

start = s.find("    function FeeModal(props) {")
end = s.find("    /* -------------------------------------------------------------- 页面 */")
assert start > 0 and end > start

new_fee = '''    const pctOf = (v) => String(Math.round(Number(v || 0) * 100 * 10000) / 10000)
    const toDraftCategory = (c) => ({
      id: c.id,
      name: c.name,
      commission: pctOf(c.commissionRate),
      min: String(c.minCommission),
      stamp: pctOf(c.stampDutyRate),
      transfer: pctOf(c.transferFeeRate),
      other: String(c.otherFixed),
      note: c.note || ''
    })
    const fromDraftCategory = (c) => ({
      id: c.id,
      name: c.name.trim() || '未命名品种',
      commissionRate: Number(c.commission) / 100,
      minCommission: Number(c.min),
      stampDutyRate: Number(c.stamp) / 100,
      transferFeeRate: Number(c.transfer) / 100,
      otherFixed: Number(c.other),
      note: c.note
    })

    function FeeModal(props) {
      const { state, onClose, onPatch } = props
      const active = state.feeRules.find((r) => r.id === state.activeFeeRule) || state.feeRules[0]
      const [ruleId, setRuleId] = useState(active.id)
      const [name, setName] = useState(active.name)
      const [categories, setCategories] = useState(() => active.categories.map(toDraftCategory))
      const [catId, setCatId] = useState(() => (active.categories[0] || {}).id)
      const [note, setNote] = useState(active.note || '')
      const [image, setImage] = useState(active.image || '')
      const [saved, setSaved] = useState(false)

      const category = categories.find((c) => c.id === catId) || categories[0]
      const setCat = (patch) => {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? Object.assign({}, c, patch) : c)))
        setSaved(false)
      }
      const setField = (key, value) => setCat({ [key]: value })

      const save = async () => {
        await onPatch('saveFeeRule', {
          rule: {
            id: ruleId,
            name: name.trim() || '未命名券商',
            categories: categories.map(fromDraftCategory),
            note,
            image
          }
        })
        setSaved(true)
      }

      const createRule = async () => {
        const rule = {
          id: 'rule-' + Date.now(),
          name: '新券商',
          categories: [{ id: 'cat-' + Date.now(), name: 'A股', commissionRate: 0.00025, minCommission: 5, stampDutyRate: 0.0005, transferFeeRate: 0.00001, otherFixed: 0, note: '' }],
          note: '',
          image: ''
        }
        await onPatch('saveFeeRule', { rule })
        await onPatch('setActiveFeeRule', { id: rule.id })
        setRuleId(rule.id); setName(rule.name)
        setCategories(rule.categories.map(toDraftCategory)); setCatId(rule.categories[0].id)
        setNote(''); setImage(''); setSaved(false)
      }

      const removeRule = async () => {
        if (state.feeRules.length <= 1) return
        await onPatch('deleteFeeRule', { id: ruleId })
        const next = state.feeRules.find((r) => r.id !== ruleId)
        if (next) {
          setRuleId(next.id); setName(next.name)
          setCategories(next.categories.map(toDraftCategory)); setCatId(next.categories[0].id)
          setNote(next.note || ''); setImage(next.image || ''); setSaved(false)
        }
      }

      const pickRule = async (id) => {
        await onPatch('setActiveFeeRule', { id })
        const rule = state.feeRules.find((r) => r.id === id)
        if (rule) {
          setRuleId(rule.id); setName(rule.name)
          setCategories(rule.categories.map(toDraftCategory)); setCatId(rule.categories[0].id)
          setNote(rule.note || ''); setImage(rule.image || ''); setSaved(false)
        }
      }

      const addCategory = () => {
        const cat = { id: 'cat-' + Date.now(), name: '新品种', commission: '0.025', min: '5', stamp: '0', transfer: '0', other: '0', note: '' }
        setCategories((prev) => prev.concat([cat]))
        setCatId(cat.id)
        setSaved(false)
      }
      const removeCategory = () => {
        if (categories.length <= 1) return
        const next = categories.filter((c) => c.id !== category.id)
        setCategories(next); setCatId(next[0].id); setSaved(false)
      }

      const upload = (file) => {
        if (!file) return
        if (file.size > 300 * 1024) { window.alert('图片请小于 300KB，作为参考即可'); return }
        const reader = new FileReader()
        reader.onload = () => { setImage(String(reader.result || '')); setSaved(false) }
        reader.readAsDataURL(file)
      }

      const field = (label, key, unit) => h('div', { className: 'pos-fee-field' },
        h('label', null, label, unit ? h('span', { className: 'unit' }, unit) : null),
        h('input', { className: 'pos-input', value: category[key], onChange: (e) => setField(key, e.target.value) })
      )

      return h(Modal, { title: '费率规则', onClose, maxWidth: 760 },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
          h('span', { className: 'pos-muted' }, '券商：'),
          h('select', { className: 'pos-select', value: ruleId, onChange: (e) => pickRule(e.target.value) },
            state.feeRules.map((r) => h('option', { key: r.id, value: r.id }, r.name))),
          h('button', { className: 'pos-mini', onClick: createRule }, '+ 新建券商'),
          h('button', { className: 'pos-mini', onClick: removeRule, disabled: state.feeRules.length <= 1 }, '删除券商')
        ),

        h('div', { className: 'pos-chips', style: { marginBottom: 10 } },
          h('span', { className: 'pos-muted', style: { fontSize: 12 } }, '品种：'),
          categories.map((c) => h('button', {
            key: c.id,
            className: 'pos-chip',
            style: c.id === category.id ? { borderColor: '#2457d6', color: '#2457d6', background: '#f2f6ff' } : undefined,
            onClick: () => setCatId(c.id)
          }, c.name)),
          h('button', { className: 'pos-mini', onClick: addCategory }, '+ 新建品种'),
          h('button', { className: 'pos-mini', onClick: removeCategory, disabled: categories.length <= 1 }, '删除品种')
        ),

        h('div', { className: 'pos-fee-grid' },
          field('品种名称', 'name'),
          field('佣金率', 'commission', '%'),
          field('最低佣金（元）', 'min'),
          field('印花税率（仅卖出）', 'stamp', '%'),
          field('过户费率', 'transfer', '%'),
          field('其他固定费用（元/笔）', 'other')
        ),

        h('div', { className: 'pos-fee-field', style: { marginTop: 10 } },
          h('label', null, '品种备注'),
          h('input', { className: 'pos-input', value: category.note, onChange: (e) => setField('note', e.target.value) })
        ),

        h('div', { className: 'pos-fee-field', style: { marginTop: 10 } },
          h('label', null, '券商备注'),
          h('input', { className: 'pos-input', value: note, onChange: (e) => { setNote(e.target.value); setSaved(false) } })
        ),

        h('div', { style: { marginTop: 12 } },
          h('div', { className: 'pos-muted', style: { fontSize: 12, marginBottom: 6 } }, '券商费率截图（可选，仅作参考，数值请手填）'),
          h('input', { type: 'file', accept: 'image/*', onChange: (e) => upload(e.target.files && e.target.files[0]) }),
          image ? h('div', { className: 'pos-fee-preview' }, h('img', { src: image, alt: '券商费率截图' })) : null
        ),

        h('p', { className: 'pos-note' },
          '每个品种单独算：买入 = 佣金（不低于最低）+ 过户费；卖出再加印花税；分红按持股期估红利税。股票用哪个品种，在「编辑分组」里选。'),

        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
          saved ? h('span', { className: 'pos-chip ok', style: { height: 26 } }, '已保存') : null,
          h('button', { className: 'pos-btn', onClick: onClose }, '关闭'),
          h('button', { className: 'pos-btn primary', onClick: save }, '保存费率')
        )
      )
    }

'''
s = s[:start] + new_fee + s[end:]
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("FeeModal categories rewritten")
