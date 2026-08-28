// Génère des icônes PWA simples (fond accent + logo "play" blanc) en PNG brut,
// sans dépendance externe (juste zlib, déjà fourni par Node).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

type Rgba = readonly [number, number, number, number];
type Point = readonly [number, number];

const ACCENT: Rgba = [0x7a, 0x26, 0x36, 0xff]; // #7a2636 (rouge velours, voir src/styles/variables.css)
const WHITE: Rgba = [0xff, 0xff, 0xff, 0xff];

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function pointInTriangle(px: number, py: number, p1: Point, p2: Point, p3: Point): boolean {
  const sign = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const d1 = sign(px, py, p1[0], p1[1], p2[0], p2[1]);
  const d2 = sign(px, py, p2[0], p2[1], p3[0], p3[1]);
  const d3 = sign(px, py, p3[0], p3[1], p1[0], p1[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function drawIcon(size: number, { rounded = true }: { rounded?: boolean } = {}): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const circleR = size * 0.34;
  const cornerR = rounded ? size * 0.18 : 0;

  const p1: Point = [cx - circleR * 0.32, cy - circleR * 0.52];
  const p2: Point = [cx - circleR * 0.32, cy + circleR * 0.52];
  const p3: Point = [cx + circleR * 0.58, cy];

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type 0 (none) for this scanline
    for (let x = 0; x < size; x++) {
      let color: Rgba = ACCENT;
      let alpha = 255;

      if (rounded) {
        // Coins arrondis : pixels hors du rectangle à coins arrondis = transparents.
        const nearestX = Math.min(Math.max(x, cornerR), size - cornerR);
        const nearestY = Math.min(Math.max(y, cornerR), size - cornerR);
        const dx = x - nearestX;
        const dy = y - nearestY;
        if (dx * dx + dy * dy > cornerR * cornerR) {
          alpha = 0;
        }
      }

      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= circleR * circleR) {
        color = WHITE;
      }
      if (pointInTriangle(x, y, p1, p2, p3)) {
        color = ACCENT;
      }

      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
      raw[offset++] = alpha;
    }
  }
  return raw;
}

function writePng(filePath: string, size: number, opts?: { rounded?: boolean }): void {
  const raw = drawIcon(size, opts);
  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, png);
  console.log(`Écrit ${filePath} (${size}x${size})`);
}

const publicDir = path.join(import.meta.dirname, "..", "public");
writePng(path.join(publicDir, "icon-192.png"), 192, { rounded: true });
writePng(path.join(publicDir, "icon-512.png"), 512, { rounded: true });
writePng(path.join(publicDir, "icon-maskable-512.png"), 512, { rounded: false });
writePng(path.join(publicDir, "apple-touch-icon.png"), 180, { rounded: true });
