const r = await fetch('https://www.npmjs.com/package/@zhangxij/dsh-positions', {
  headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
})
const html = await r.text()
console.log('page:', r.status, html.length, 'bytes')
console.log('含 0.3.1:', html.includes('0.3.1'), '| 含 0.3.0:', html.includes('0.3.0'))
const imgs = [...html.matchAll(/https:\/\/unpkg\.com\/[^"'\s>]+/g)].map((m) => m[0]).slice(0, 6)
console.log('unpkg 图片引用:', imgs.length ? imgs.join('\n') : '无')
const ver = html.match(/"version":"([0-9.]+)"/)
console.log('页面 version:', ver ? ver[1] : 'n/a')
