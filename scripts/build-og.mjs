/**
 * Draw public/og.png, the share image every page names (index.html,
 * 1200×630). A dark ground, the site's wordmark and one line, so a link
 * preview has a picture of its own. Run when the words change:
 *
 *   node scripts/build-og.mjs
 */
import { crc32, deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200;
const H = 630;
const GROUND = [0x0c, 0x0c, 0x0e, 255];
const INK = [0xf4, 0xf4, 0xf5, 255];
const ACCENT = [0xff, 0x5a, 0xae, 255];

/** 5×7 glyphs, one row a bit field. Missing glyphs draw nothing. */
const FONT = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ",": [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  a: [0, 0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  c: [0, 0, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110],
  d: [0, 0, 0b00111, 0b00101, 0b10101, 0b10011, 0b01111],
  e: [0, 0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0, 0b00110, 0b00100, 0b01110, 0b00100, 0b00100, 0b00100],
  g: [0, 0, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110],
  i: [0, 0b00100, 0, 0b01100, 0b00100, 0b00100, 0b01110],
  l: [0, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  n: [0, 0, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001],
  o: [0, 0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  r: [0, 0, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  s: [0, 0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0, 0b00100, 0b01110, 0b00100, 0b00100, 0b00101, 0b00010],
  w: [0, 0, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010, 0b01010],
};

const px = Buffer.alloc(W * H * 4, 0);
const put = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, GROUND);

const textWidth = (text, scale) =>
  [...text].reduce((w, ch) => w + (ch === " " ? 3 : 6) * scale, 0);

function text(label, x, y, scale, color) {
  let cx = x;
  for (const ch of label) {
    const glyph = FONT[ch];
    if (!glyph) {
      cx += 6 * scale;
      continue;
    }
    if (ch !== " ") {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if ((glyph[row] >> (4 - col)) & 1) {
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++)
                put(cx + col * scale + dx, y + row * scale + dy, color);
          }
        }
      }
    }
    cx += (ch === " " ? 3 : 6) * scale;
  }
}

// A wing: two strokes, the mark's idea without its lettering.
function wing(x, y, s, color) {
  const pts = [
    [0, 18],
    [10, 8],
    [22, 14],
    [34, 4],
    [40, 10],
    [26, 22],
    [16, 16],
    [8, 26],
  ];
  const inside = (px0, py0) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (
        yi > py0 !== yj > py0 &&
        px0 < ((xj - xi) * (py0 - yi)) / (yj - yi) + xi
      )
        c = !c;
    }
    return c;
  };
  for (let py = 0; py < 32; py++)
    for (let pxx = 0; pxx < 44; pxx++)
      if (inside(pxx, py))
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++)
            put(x + pxx * s + dx, y + py * s + dy, color);
}

const mark = "wingfoil.ie";
const line = "Wing foil forecast for Ireland";
const markScale = 11;
const lineScale = 5;
const blockW = Math.max(textWidth(mark, markScale), textWidth(line, lineScale));
const x0 = Math.round((W - blockW) / 2);
const y0 = 210;
for (let x = x0; x < x0 + 96; x++)
  for (let y = y0; y < y0 + 8; y++) put(x, y, ACCENT);
text(mark, x0, y0 + 28, markScale, INK);
text(line, x0, y0 + 28 + 7 * markScale + 28, lineScale, INK);
wing(x0 + blockW + 36, y0 + 20, 3, INK);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, sum]);
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../public/og.png", import.meta.url), png);
console.log(`public/og.png: ${png.length} bytes`);
