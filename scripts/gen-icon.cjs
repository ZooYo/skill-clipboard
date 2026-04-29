// Generate skill-clipboard icons at multiple sizes - a rounded blue square
// with a white "S" shape. We render every size natively (no downscaling)
// because Plasmo's @parcel/transformer-image pipeline uses sharp/libvips,
// which converts our PNG to grayscale during resize. By providing each
// size directly under assets/ Plasmo skips the sharp resize step entirely
// and copies our PNG byte-for-byte into the build output.
//
// Run: node scripts/gen-icon.cjs
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")

const BG = [24, 119, 242] // #1877F2
const FG = [255, 255, 255]

// Sizes Plasmo writes into manifest.icons. icon.png (512) is also kept as
// a high-res master suitable for the Chrome Web Store listing.
const SIZES = [16, 32, 48, 64, 128]
const MASTER_SIZE = 512

// Proportional geometry. RADIUS / STROKE / PAD bumps slightly at very small
// sizes so the S glyph stays readable.
function geometryFor(size) {
  const r = size / 512
  return {
    SIZE: size,
    RADIUS: Math.max(2, Math.round(96 * r)),
    STROKE: Math.max(2, Math.round(64 * r)),
    PAD: Math.max(2, Math.round(96 * r)),
    EXTRA: Math.max(0, Math.round(16 * r))
  }
}

function makeMath(g) {
  const SIZE = g.SIZE
  const PAD = g.PAD
  const STROKE = g.STROKE
  const RADIUS = g.RADIUS
  const EXTRA = g.EXTRA
  const LEFT = PAD
  const RIGHT = SIZE - PAD
  const TOP = PAD + EXTRA
  const BOTTOM = SIZE - PAD - EXTRA
  const MID = SIZE / 2

  // Signed distance from (x, y) to the rounded square that fills the canvas.
  function sdf(x, y) {
    const cx = SIZE / 2
    const cy = SIZE / 2
    const halfW = SIZE / 2 - RADIUS
    const halfH = SIZE / 2 - RADIUS
    const dx = Math.max(Math.abs(x - cx) - halfW, 0)
    const dy = Math.max(Math.abs(y - cy) - halfH, 0)
    return Math.hypot(dx, dy) - RADIUS
  }

  function coverageAt(x, y) {
    const d = sdf(x + 0.5, y + 0.5)
    if (d <= -0.5) return 1
    if (d >= 0.5) return 0
    return 0.5 - d
  }

  function inSGlyph(x, y) {
    const inHorizontalBar = (yCenter) =>
      Math.abs(y - yCenter) <= STROKE / 2 && x >= LEFT && x <= RIGHT
    if (inHorizontalBar(TOP + STROKE / 2)) return true
    if (inHorizontalBar(MID)) return true
    if (inHorizontalBar(BOTTOM - STROKE / 2)) return true
    if (x >= LEFT && x <= LEFT + STROKE && y >= TOP && y <= MID) return true
    if (x >= RIGHT - STROKE && x <= RIGHT && y >= MID && y <= BOTTOM) return true
    return false
  }

  return { coverageAt, inSGlyph }
}

function buildPixels(g) {
  const { SIZE } = g
  const { coverageAt, inSGlyph } = makeMath(g)
  const stride = SIZE * 4 + 1 // +1 filter byte per row
  const buf = Buffer.alloc(stride * SIZE)
  for (let y = 0; y < SIZE; y++) {
    const row = y * stride
    buf[row] = 0 // filter: None
    for (let x = 0; x < SIZE; x++) {
      const off = row + 1 + x * 4
      const isFg = inSGlyph(x, y)
      const [r, gg, bb] = isFg ? FG : BG
      // RGB stays the intended ink colour even in transparent pixels so the
      // PNG decoder/compositor never has a chance to drag edge hues toward
      // some other colour.
      const alpha = Math.round(coverageAt(x, y) * 255)
      buf[off] = r
      buf[off + 1] = gg
      buf[off + 2] = bb
      buf[off + 3] = alpha
    }
  }
  return buf
}

let crcTable = null
function computeCRC(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++)
    c = (crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(computeCRC(Buffer.concat([typeBuf, data])) >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function buildPng(size) {
  const g = geometryFor(size)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idatRaw = buildPixels(g)
  const idat = zlib.deflateSync(idatRaw, { level: 9 })
  const srgb = Buffer.from([0])
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("sRGB", srgb),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ])
}

const outDir = path.join(__dirname, "..", "assets")
fs.mkdirSync(outDir, { recursive: true })

// Master keeps the original filename so the Chrome Web Store listing /
// store assets can use a single high-res reference.
fs.writeFileSync(path.join(outDir, "icon.png"), buildPng(MASTER_SIZE))
console.log(`Wrote assets/icon.png (${MASTER_SIZE}x${MASTER_SIZE})`)

for (const size of SIZES) {
  const file = `icon${size}.png`
  fs.writeFileSync(path.join(outDir, file), buildPng(size))
  console.log(`Wrote assets/${file} (${size}x${size})`)
}
