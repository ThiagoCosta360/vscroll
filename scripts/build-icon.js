// Generates icon.png (128x128) matching icon.svg, using only Node built-ins.
// Run: node scripts/build-icon.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 128, H = 128;
const buf = Buffer.alloc(W * H * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  // Alpha-blend over existing pixel.
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

function fillRect(x, y, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPx(x + dx, y + dy, r, g, b, a);
}

function fillRoundedRect(x, y, w, h, radius, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      let cx = null, cy = null;
      if (dx < radius && dy < radius) { cx = radius; cy = radius; }
      else if (dx >= w - radius && dy < radius) { cx = w - radius - 1; cy = radius; }
      else if (dx < radius && dy >= h - radius) { cx = radius; cy = h - radius - 1; }
      else if (dx >= w - radius && dy >= h - radius) { cx = w - radius - 1; cy = h - radius - 1; }

      if (cx !== null) {
        const ddx = dx - cx, ddy = dy - cy;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist > radius) continue;
        // Antialiasing: soft edge in the last pixel.
        const edgeAlpha = dist > radius - 1 ? (radius - dist) : 1;
        setPx(x + dx, y + dy, r, g, b, Math.round(a * Math.max(0, Math.min(1, edgeAlpha))));
      } else {
        setPx(x + dx, y + dy, r, g, b, a);
      }
    }
  }
}

function strokeRoundedRect(x, y, w, h, radius, thickness, r, g, b, a = 255) {
  // Outer minus inner (composited via difference).
  // Easier: draw border by painting a slightly larger rounded rect of stroke
  // color, then subtracting the inner area.
  const outerCanvas = Buffer.alloc(W * H * 4);
  const innerCanvas = Buffer.alloc(W * H * 4);
  function paint(canvas, ox, oy, ow, oh, orad) {
    for (let dy = 0; dy < oh; dy++) {
      for (let dx = 0; dx < ow; dx++) {
        let cx = null, cy = null;
        if (dx < orad && dy < orad) { cx = orad; cy = orad; }
        else if (dx >= ow - orad && dy < orad) { cx = ow - orad - 1; cy = orad; }
        else if (dx < orad && dy >= oh - orad) { cx = orad; cy = oh - orad - 1; }
        else if (dx >= ow - orad && dy >= oh - orad) { cx = ow - orad - 1; cy = oh - orad - 1; }
        let inside = true;
        if (cx !== null) {
          const ddx = dx - cx, ddy = dy - cy;
          inside = (ddx * ddx + ddy * ddy) <= orad * orad;
        }
        if (inside) {
          const px = ox + dx, py = oy + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            const i = (py * W + px) * 4;
            canvas[i + 3] = 255;
          }
        }
      }
    }
  }
  paint(outerCanvas, x, y, w, h, radius);
  paint(innerCanvas, x + thickness, y + thickness, w - 2 * thickness, h - 2 * thickness, Math.max(0, radius - thickness));
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (outerCanvas[i + 3] === 255 && innerCanvas[i + 3] === 0) {
        setPx(px, py, r, g, b, a);
      }
    }
  }
}

function strokeLine(x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  // Thick horizontal/vertical or diagonal line with rounded caps (approx).
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len);
  const half = thickness / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    for (let py = Math.floor(cy - half); py <= Math.ceil(cy + half); py++) {
      for (let px = Math.floor(cx - half); px <= Math.ceil(cx + half); px++) {
        const ddx = px - cx, ddy = py - cy;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist <= half) {
          const edge = Math.max(0, Math.min(1, half - dist));
          setPx(Math.round(px), Math.round(py), r, g, b, Math.round(a * edge));
        }
      }
    }
  }
}

// 1) Background: dark rounded square.
fillRoundedRect(0, 0, 128, 128, 20, 0x1e, 0x1e, 0x1e);

// 2) Page rect (filled + stroked).
fillRoundedRect(28, 22, 72, 84, 4, 0x2d, 0x2d, 0x30);
strokeRoundedRect(28, 22, 72, 84, 4, 3, 0x0e, 0x63, 0x9c);

// 3) Text lines.
const lines = [
  { y: 40, w: 48, c: [0x9c, 0xdc, 0xfe] },
  { y: 54, w: 44, c: [0xce, 0x91, 0x78] },
  { y: 68, w: 40, c: [0x9c, 0xdc, 0xfe] },
  { y: 82, w: 36, c: [0xce, 0x91, 0x78] },
  { y: 96, w: 32, c: [0x9c, 0xdc, 0xfe] },
];
for (const l of lines) {
  strokeLine(40, l.y, 40 + l.w, l.y, 3, l.c[0], l.c[1], l.c[2]);
}

// PNG encoding.
function crc32(data) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = (table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 4);
  raw[off] = 0;
  buf.copy(raw, off + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
