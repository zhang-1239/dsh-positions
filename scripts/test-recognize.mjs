const base = 'http://127.0.0.1:59714'
const get = async (p) => { const r = await fetch(base + p); return { s: r.status, j: await r.json() } }
const act = async (type, payload) => {
  const r = await fetch(base + '/positions/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload })
  })
  return { s: r.status, j: await r.json() }
}

const st = await get('/positions/state')
console.log('vision:', JSON.stringify(st.j.state.vision))

const off = await fetch(base + '/positions/recognize', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ image: 'data:image/png;base64,AAAA' })
})
console.log('开关关闭时:', off.status, JSON.stringify(await off.json()))

await act('setVision', { enabled: true })
// 1x1 透明 PNG
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const on = await fetch(base + '/positions/recognize', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ image: tiny })
})
console.log('开关打开时:', on.status, JSON.stringify(await on.json()).slice(0, 400))

await act('setVision', { enabled: false })
const back = await get('/positions/state')
console.log('恢复关闭:', back.j.state.vision.enabled)
