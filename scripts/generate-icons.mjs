/**
 * Generates the PWA icons.
 *
 * Kept in the repo rather than committing opaque binaries: the icons are
 * reproducible from this file, and there is no image toolchain to install. PNGs
 * are written directly — zlib is all a PNG needs — and the mark is drawn
 * procedurally at 4x then box-filtered down, which is enough anti-aliasing for a
 * geometric shape.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [12, 13, 16]; // --bg
const ACCENT = [76, 141, 255]; // --accent
const INK = [242, 244, 248]; // --text

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode straight RGBA pixels as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark: a trap bar seen from above — two handles either side of a loaded
 * bar. Geometric, so it stays legible at 48px in a home-screen grid.
 *
 * `inset` is the fraction of the canvas kept clear at the edges. A maskable icon
 * is cropped to a circle by the launcher, so its content sits inside the safe
 * zone while the background bleeds to the edge.
 */
function drawMark(size, { maskable }) {
  const scale = 4;
  const w = size * scale;
  const big = Buffer.alloc(w * w * 4);

  const rounded = maskable ? w : w * 0.22;
  const content = maskable ? 0.62 : 0.76;

  const cx = w / 2;
  const cy = w / 2;
  const half = (w * content) / 2;

  const barHeight = w * 0.085;
  const plateWidth = w * 0.1;
  const plateHeight = w * 0.4;
  const gripHeight = w * 0.26;

  const put = (i, colour) => {
    big[i] = colour[0];
    big[i + 1] = colour[1];
    big[i + 2] = colour[2];
    big[i + 3] = 255;
  };

  for (let y = 0; y < w; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;

      // Background: a rounded square, or full bleed when maskable.
      const dx = Math.max(rounded - x, x - (w - rounded), 0);
      const dy = Math.max(rounded - y, y - (w - rounded), 0);
      const outside = !maskable && Math.hypot(dx, dy) > rounded;
      if (outside) {
        big[i + 3] = 0;
        continue;
      }
      put(i, BG);

      const ox = x - cx;
      const oy = y - cy;

      // The bar.
      if (Math.abs(oy) <= barHeight / 2 && Math.abs(ox) <= half) put(i, ACCENT);

      // Plates, inboard of each end.
      const plateCentre = half - plateWidth * 1.6;
      if (Math.abs(Math.abs(ox) - plateCentre) <= plateWidth / 2 && Math.abs(oy) <= plateHeight / 2) {
        put(i, ACCENT);
      }

      // Grips at each end.
      if (Math.abs(Math.abs(ox) - half) <= plateWidth / 2 && Math.abs(oy) <= gripHeight / 2) {
        put(i, INK);
      }
    }
  }

  // Box-filter down to the requested size.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const i = ((y * scale + sy) * w + (x * scale + sx)) * 4;
          const alpha = big[i + 3] / 255;
          r += big[i] * alpha;
          g += big[i + 1] * alpha;
          b += big[i + 2] * alpha;
          a += big[i + 3];
        }
      }
      const n = scale * scale;
      const alphaAvg = a / n;
      const weight = alphaAvg === 0 ? 1 : alphaAvg / 255;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n / weight);
      out[o + 1] = Math.round(g / n / weight);
      out[o + 2] = Math.round(b / n / weight);
      out[o + 3] = Math.round(alphaAvg);
    }
  }
  return encodePng(size, size, out);
}

mkdirSync(OUT, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: true },
];

for (const target of targets) {
  const png = drawMark(target.size, { maskable: target.maskable });
  writeFileSync(join(OUT, target.name), png);
  console.log(`${target.name}  ${target.size}x${target.size}  ${(png.length / 1024).toFixed(1)} kB`);
}
