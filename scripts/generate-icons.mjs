// Gera os ícones PNG do PWA a partir da marca (pin sobre quadrado verde-lima).
// Uso: npm run icons
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const LIME = '#B9F46D'
const GRAPHITE = '#141715'

// `inset` reduz o pin para respeitar a "safe zone" do ícone maskable.
const svg = ({ rounded, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="16"' : ''} fill="${LIME}"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <path fill="${GRAPHITE}" d="M32 52S16 39.5 16 27a16 16 0 0 1 32 0c0 12.5-16 25-16 25z"/>
    <circle cx="32" cy="27" r="6" fill="${LIME}"/>
  </g>
</svg>`

const out = async (file, size, opts) =>
  sharp(Buffer.from(svg(opts)), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(file)

await mkdir('public/icons', { recursive: true })
await out('public/icons/icon-192.png', 192, { rounded: true, scale: 1.1 })
await out('public/icons/icon-512.png', 512, { rounded: true, scale: 1.1 })
await out('public/icons/icon-maskable-512.png', 512, { rounded: false, scale: 0.9 })
await out('public/apple-touch-icon.png', 180, { rounded: false, scale: 1.0 })
console.log('Ícones gerados em public/')
