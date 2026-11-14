// Deriva os arquivos de marca do logo oficial (brand/logo-atual.webp).
//  - src/assets/logo/mark-reversed.png      emblema para fundos escuros (preto -> branco)
//  - src/assets/logo/wordmark-reversed.png  "Mapa do Mapa" para fundos escuros
//  - public/icons/*, apple-touch-icon.png, favicon.png  ícones do PWA (emblema sobre branco)
// O arquivo original NÃO é alterado. Uso: npm run brand
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const SRC = 'brand/logo-atual.webp'
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

// 1) O logo oficial já tem fundo transparente: usamos os pixels como estão.
const light = Buffer.from(data)
let maxGR = 1
for (let i = 0; i < W * H; i++) {
  if (light[i * 4 + 3] > 200) maxGR = Math.max(maxGR, light[i * 4 + 1] - light[i * 4])
}

// 2) Versão para fundo escuro: tons escuros viram branco, o verde permanece.
const rev = Buffer.from(light)
for (let i = 0; i < W * H; i++) {
  if (rev[i * 4 + 3] === 0) continue
  const gr = Math.min(1, Math.max(0, (rev[i * 4 + 1] - rev[i * 4]) / maxGR))
  for (let c = 0; c < 3; c++) rev[i * 4 + c] = Math.min(255, rev[i * 4 + c] + (1 - gr) * 255)
}

// 3) Separa emblema e wordmark pelas faixas de linhas com conteúdo.
const rowHas = (y) => {
  for (let x = 0; x < W; x++) if (light[(y * W + x) * 4 + 3] > 24) return true
  return false
}
const segs = []
for (let y = 0, start = -1; y <= H; y++) {
  const has = y < H && rowHas(y)
  if (has && start < 0) start = y
  if (!has && start >= 0) { if (y - start > 40) segs.push([start, y - 1]); start = -1 }
}
if (segs.length !== 2) throw new Error(`Esperava 2 blocos (emblema + wordmark), achei ${segs.length}`)

const bbox = ([y0, y1]) => {
  let x0 = W, x1 = 0
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < W; x++)
      if (light[(y * W + x) * 4 + 3] > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
const [markBox, wordBox] = segs.map(bbox)
const img = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 4 } })

await mkdir('src/assets/logo', { recursive: true })
await img(rev).extract(markBox).resize({ height: 192 }).png({ compressionLevel: 9 }).toFile('src/assets/logo/mark-reversed.png')
await img(rev).extract(wordBox).resize({ height: 96 }).png({ compressionLevel: 9 }).toFile('src/assets/logo/wordmark-reversed.png')

// 4) Ícones do PWA: emblema em cores originais sobre quadrado branco.
const markPng = await img(light).extract(markBox).png().toBuffer()
const tile = async (file, size, fill, radius = 0) => {
  const inner = Math.round(size * fill)
  const mark = await sharp(markPng).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer()
  const bg = radius
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`)
    : { create: { width: size, height: size, channels: 4, background: '#ffffff' } }
  await sharp(radius ? bg : bg)
    .composite([{ input: mark, gravity: 'center' }])
    .png().toFile(file)
}
await mkdir('public/icons', { recursive: true })
await tile('public/icons/icon-192.png', 192, 0.72)
await tile('public/icons/icon-512.png', 512, 0.72)
await tile('public/icons/icon-maskable-512.png', 512, 0.6) // safe zone maskable
await tile('public/apple-touch-icon.png', 180, 0.72)
await tile('public/favicon.png', 64, 0.84, 14)
console.log('Marca gerada. Emblema:', markBox, 'Wordmark:', wordBox)
