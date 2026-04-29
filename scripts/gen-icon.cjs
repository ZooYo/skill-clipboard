// Generate assets/icon.png — a simple 512x512 rounded blue square with a
// white "S" shape, encoded directly as a PNG using only Node built-ins.
//
// Run: node scripts/gen-icon.cjs
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")

const SIZE = 512
const RADIUS = 96
const BG = [24, 119, 242] // Facebook blue (#1877F2)
const FG = [255, 255, 255]

// Signed distance from (x, y) to a rounded square that fills the canvas.
// Negative inside, positive outside, zero on the edge.
function roundedRectSDF(x, y) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  const halfW = SIZE / 2 - RADIUS
  const halfH = SIZE / 2 - RADIUS
  const dx = Math.max(Math.abs(x - cx) - halfW, 0)
  const dy = Math.max(Math.abs(y - cy) - halfH, 0)
  return Math.hypot(dx, dy) - RADIUS
}

function coverageAt(x, y) {
  // Sample on the pixel centre and use the SDF as a 1-pixel-wide AA band.
  const d = roundedRectSDF(x + 0.5, y + 0.5)
  if (d <= -0.5) return 1
  if (d >= 0.5) return 0
  return 0.5 - d
}

// Letter "S" drawn from three rounded bars + connecting strokes.
// Coordinates target a 512x512 canvas.
const STROKE = 64
const PAD = 96
const LEFT = PAD
const RIGHT = SIZE - PAD
const TOP = PAD + 16
const BOTTOM = SIZE - PAD - 16
const MID = SIZE / 2

function inSGlyph(x, y) {
  const inHorizontalBar = (yCenter) => Math.abs(y - yCenter) <= STROKE / 2 && x >= LEFT && x <= RIGHT
  if (inHorizontalBar(TOP + STROKE / 2)) return true
  if (inHorizontalBar(MID)) return true
  if (inHorizontalBar(BOTTOM - STROKE / 2)) return true
  // Top-left vertical stroke
  if (x >= LEFT && x <= LEFT + STROKE && y >= TOP && y <= MID) return true
  // Bottom-right vertical stroke
  if (x >= RIGHT - STROKE && x <= RIGHT && y >= MID && y <= BOTTOM) return true
  return false
}

function buildPixels() {
  const stride = SIZE * 4 + 1 // +1 for filter byte per row
  const buf = Buffer.alloc(stride * SIZE)
  for (let y = 0; y < SIZE; y++) {
    const row = y * stride
    buf[row] = 0 // filter: None
    for (let x = 0; x < SIZE; x++) {
      const off = row + 1 + x * 4
      const isFg = inSGlyph(x, y)
      const [r, g, b] = isFg ? FG : BG
      // RGB is always the intended ink colour — even in transparent corners
      // we leave RGB = BG so sharp's premultiply/demultiply roundtrip during
      // downscaling can't drag edge pixels toward a different hue.
      const alpha = Math.round(coverageAt(x, y) * 255)
      buf[off] = r
      buf[off + 1] = g
      buf[off + 2] = b
      buf[off + 3] = alpha
    }
  }
  return buf
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  const crcVal = computeCRC(Buffer.concat([typeBuf, data]))
  crc.writeUInt32BE(crcVal >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crc])
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
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function buildPng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idatRaw = buildPixels()
  const idat = zlib.deflateSync(idatRaw, { level: 9 })
  // Tag the PNG as sRGB so downstream resamplers (sharp/libvips inside
  // Plasmo) do not treat the pixels as linear-light, which otherwise
  // desaturates the image when generating 16/32/48/64/128px variants.
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
const outFile = path.join(outDir, "icon.png")
fs.writeFileSync(outFile, buildPng())
console.log(`Wrote ${outFile} (${SIZE}x${SIZE})`)
