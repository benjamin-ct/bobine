// Génère des icônes PWA reprenant le logo "bobine" (anneau + 5 points, voir
// ReelIcon dans src/shared/components/NavBar/NavBar.tsx) en PNG brut, sans
// dépendance externe (juste zlib, déjà fourni par Node).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

type Rgba = readonly [number, number, number, number];

const BG: Rgba = [0x13, 0x0e, 0x0a, 0xff]; // #130e0a (--bg thème sombre, src/styles/variables.css)
const ACCENT: Rgba = [0xaa, 0x38, 0x36, 0xff]; // #aa3836 (--accent, même couleur que le logo NavBar)

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

// Reprend les proportions du ReelIcon de la NavBar (viewBox 0..24, centre
// 12,12, anneau r=9 d'épaisseur 1.6, points r=1.5/2.2 décalés de 5.4) mises à
// l'échelle sur le canevas de sortie.
function drawIcon(
  size: number,
  { rounded = true, markDiameterRatio = 0.62 }: { rounded?: boolean; markDiameterRatio?: number } = {}
): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const cornerR = rounded ? size * 0.18 : 0;

  const scale = (markDiameterRatio * size) / 18;
  const ringOuterR = scale * 9.8;
  const ringInnerR = scale * 8.2;
  const centerDotR = scale * 2.2;
  const satelliteDotR = scale * 1.5;
  const satelliteOffset = scale * 5.4;
  const dots: readonly [number, number][] = [
    [cx, cy - satelliteOffset],
    [cx, cy + satelliteOffset],
    [cx - satelliteOffset, cy],
    [cx + satelliteOffset, cy],
  ];

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type 0 (none) for this scanline
    for (let x = 0; x < size; x++) {
      let color: Rgba = BG;
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
      const distSq = dx * dx + dy * dy;
      if (distSq >= ringInnerR * ringInnerR && distSq <= ringOuterR * ringOuterR) {
        color = ACCENT;
      }
      if (dx * dx + dy * dy <= centerDotR * centerDotR) {
        color = ACCENT;
      }
      for (const [dcx, dcy] of dots) {
        const ddx = x - dcx;
        const ddy = y - dcy;
        if (ddx * ddx + ddy * ddy <= satelliteDotR * satelliteDotR) {
          color = ACCENT;
        }
      }

      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
      raw[offset++] = alpha;
    }
  }
  return raw;
}

function writePng(
  filePath: string,
  size: number,
  opts?: { rounded?: boolean; markDiameterRatio?: number }
): void {
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
// Icône maskable : le motif doit rester dans la zone de sécurité (cercle de
// 80% de diamètre centré) du masque adaptatif Android, qui gère lui-même la
// forme — donc pas de coins arrondis ici, et un motif plus petit.
writePng(path.join(publicDir, "icon-maskable-512.png"), 512, {
  rounded: false,
  markDiameterRatio: 0.42,
});
writePng(path.join(publicDir, "apple-touch-icon.png"), 180, { rounded: true });
