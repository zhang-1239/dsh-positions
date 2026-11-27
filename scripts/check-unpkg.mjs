const files = ['01-overview.jpg', '02-entry.jpg', '03-fees.jpg', '04-calc.jpg']
for (const f of files) {
  const u = 'https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/' + f
  try {
    const r = await fetch(u, { redirect: 'follow' })
    const b = await r.arrayBuffer()
    console.log('latest', f, r.status, b.byteLength, 'bytes')
  } catch (e) {
    console.log('latest', f, 'ERR', e.message)
  }
}
const r2 = await fetch('https://unpkg.com/@zhangxij/dsh-positions@0.3.1/docs/screenshots/01-overview.jpg')
console.log('pinned 0.3.1 01:', r2.status, (await r2.arrayBuffer()).byteLength, 'bytes')
