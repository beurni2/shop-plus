/**
 * WO-7.2b — THE VENDORED QR ENCODER (Q4 ruling: vendored, zero dependencies).
 * Byte-mode only, versions 1–5, ECC level M only — everything the product will
 * ever encode (one short identity URL). ISO/IEC 18004. Pure, deterministic TS:
 * same input → byte-identical module matrix, always (a poster is the longest-
 * lived link artifact — the maths must be exact and reproducible). No DOM, no
 * RN, no `@platform/*` — the PWA draws the matrix as SVG rects, RN as
 * react-native-svg rects (decision #10); this module only computes the matrix.
 *
 * The screen/print SIDE is NOT here — it is a render-time derivation from the
 * canon `dimension.qr` primitives (v0.9.7): side = (modules(version) +
 * 2·quietZoneModules)·moduleMinPx. This module owns the MODULES; the caller owns
 * the pixels and asserts the 1.0 mm print floor.
 */

// ── GF(256) arithmetic (primitive polynomial 0x11d) ─────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** α-exponent of a GF value (for verifying generators against the QR spec). */
export const gfLog = (v: number): number => LOG[v]!;

/** Reed–Solomon generator polynomial of `degree` (product of (x − α^i)). */
export function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j]! ^ poly[j]!;
      next[j + 1] = next[j + 1]! ^ gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** EC codewords for one data block. */
function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount);
  const res = new Array<number>(ecCount).fill(0);
  for (const d of data) {
    const factor = d ^ res[0]!;
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) res[i] = res[i]! ^ gfMul(gen[i + 1]!, factor);
    }
  }
  return res;
}

// ── ECC level M block structure, versions 1–5 (ISO 18004 Table 9) ───────────
interface EccSpec {
  readonly ecPerBlock: number;
  readonly blocks: readonly number[]; // data codewords per block
  readonly byteCapacity: number; // byte-mode data capacity (chars)
}
const ECC_M: Record<number, EccSpec> = {
  1: { ecPerBlock: 10, blocks: [16], byteCapacity: 14 },
  2: { ecPerBlock: 16, blocks: [28], byteCapacity: 26 },
  3: { ecPerBlock: 26, blocks: [44], byteCapacity: 42 },
  4: { ecPerBlock: 18, blocks: [32, 32], byteCapacity: 62 },
  5: { ecPerBlock: 24, blocks: [43, 43], byteCapacity: 84 },
};

/** Number of modules per side for a version (21, 25, 29, 33, 37). */
export const modulesForVersion = (version: number): number => version * 4 + 17;

/** The smallest version 1–5 whose ECC-M byte capacity fits `byteLength`, or null. */
export function chooseVersion(byteLength: number): number | null {
  for (let v = 1; v <= 5; v++) if (byteLength <= ECC_M[v]!.byteCapacity) return v;
  return null;
}

// ── Alignment pattern centres (V1–5) ────────────────────────────────────────
const ALIGN_CENTRES: Record<number, readonly number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
};

// ── The eight data-mask conditions ──────────────────────────────────────────
const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const utf8Bytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/** The result: a square boolean matrix (true = dark module) + the chosen version. */
export interface QrMatrix {
  readonly version: number;
  readonly size: number; // modules per side
  readonly byteLength: number; // encoded byte length (for the capacity assertion)
  readonly modules: readonly (readonly boolean[])[];
}

export class QrCapacityError extends Error {
  override readonly name = 'QrCapacityError';
}

/**
 * Encode `text` (byte mode, ECC M) into a QR module matrix, choosing the
 * smallest fitting version 1–5. Deterministic (mask chosen by the ISO penalty
 * score, itself deterministic).
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length);
  if (version === null) {
    throw new QrCapacityError(
      `${bytes.length} bytes exceeds V5 ECC-M capacity (84) — the product never encodes this much`,
    );
  }
  const spec = ECC_M[version]!;
  const totalDataCodewords = spec.blocks.reduce((a, b) => a + b, 0);

  // 1 — the bit stream: mode(0100) · count(8) · data · terminator · pad.
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // count indicator (V1–9 byte mode)
  for (const b of bytes) push(b, 8);
  const capacityBits = totalDataCodewords * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminator ≤ 4 bits
  while (bits.length % 8 !== 0) bits.push(0); // byte align
  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    dataCodewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  for (let pad = 0xec; dataCodewords.length < totalDataCodewords; pad ^= 0xec ^ 0x11) {
    dataCodewords.push(pad); // 0xEC / 0x11 alternating
  }

  // 2 — split into blocks, EC per block, then interleave.
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const count of spec.blocks) {
    const block = dataCodewords.slice(offset, offset + count);
    offset += count;
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, spec.ecPerBlock));
  }
  const finalCodewords: number[] = [];
  const maxData = Math.max(...spec.blocks);
  for (let i = 0; i < maxData; i++) {
    for (const b of dataBlocks) if (i < b.length) finalCodewords.push(b[i]!);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const b of ecBlocks) finalCodewords.push(b[i]!);
  }

  // 3 — the module matrix + function patterns.
  const size = modulesForVersion(version);
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, dark: boolean, reserve = true) => {
    modules[r]![c] = dark;
    if (reserve) reserved[r]![c] = true;
  };
  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark = inRing && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(r, c, dark);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);
  // Timing patterns (row/col 6).
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Alignment patterns.
  const centres = ALIGN_CENTRES[version]!;
  for (const r0 of centres) {
    for (const c0 of centres) {
      if (reserved[r0]![c0]) continue; // skips finder overlaps
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          set(r0 + dr, c0 + dc, dark);
        }
      }
    }
  }
  // Dark module + reserve the format-info area.
  set(size - 8, 8, true);
  const reserveFormat = () => {
    for (let i = 0; i < 9; i++) {
      if (!reserved[8]![i]) reserved[8]![i] = true;
      if (!reserved[i]![8]) reserved[i]![8] = true;
    }
    for (let i = 0; i < 8; i++) {
      reserved[8]![size - 1 - i] = true;
      reserved[size - 1 - i]![8] = true;
    }
  };
  reserveFormat();

  // 4 — lay the data bits in the up/down zigzag, skipping function modules.
  const dataBits: number[] = [];
  for (const cw of finalCodewords) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    const c = col === 6 ? col - 1 : col; // skip the timing column
    for (let row = 0; row < size; row++) {
      const r = upward ? size - 1 - row : row;
      for (let k = 0; k < 2; k++) {
        const cc = c - k;
        if (reserved[r]![cc]) continue;
        modules[r]![cc] = bitIdx < dataBits.length ? dataBits[bitIdx]! === 1 : false;
        bitIdx++;
      }
    }
    upward = !upward;
  }

  // 5 — choose the mask by the ISO penalty score (deterministic), apply it,
  // and write the matching format information.
  const applyMask = (grid: (boolean | null)[][], mask: number): boolean[][] => {
    const out = grid.map((row) => row.map((v) => v === true));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r]![c] && MASKS[mask]!(r, c)) out[r]![c] = !out[r]![c];
      }
    }
    return out;
  };
  let best = { mask: 0, penalty: Infinity, grid: [] as boolean[][] };
  for (let mask = 0; mask < 8; mask++) {
    const grid = applyMask(modules, mask);
    writeFormat(grid, reserved, size, mask);
    const p = penalty(grid, size);
    if (p < best.penalty) best = { mask, penalty: p, grid };
  }
  return { version, size, byteLength: bytes.length, modules: best.grid };
}

/** BCH(15,5) format info for ECC level M (bits 00) + mask, written twice. */
function writeFormat(grid: boolean[][], _reserved: boolean[][], size: number, mask: number): void {
  const data = (0b00 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) ? 0b10100110111 : 0);
  const bitsVal = (((data << 10) | rem) ^ 0b101010000010010) >>> 0;
  const fbit = (i: number): boolean => ((bitsVal >> i) & 1) === 1;
  // Copy 1 — around the top-left finder.
  for (let i = 0; i <= 5; i++) grid[8]![i] = fbit(i);
  grid[8]![7] = fbit(6);
  grid[8]![8] = fbit(7);
  grid[7]![8] = fbit(8);
  for (let i = 9; i <= 14; i++) grid[14 - i]![8] = fbit(i);
  // Copy 2 — split across the other two finders.
  for (let i = 0; i <= 7; i++) grid[size - 1 - i]![8] = fbit(i);
  for (let i = 8; i <= 14; i++) grid[8]![size - 15 + i] = fbit(i);
  grid[size - 8]![8] = true; // dark module stays
}

/** ISO 18004 §8.8 penalty score — deterministic mask selection. */
function penalty(g: boolean[][], size: number): number {
  let score = 0;
  // Rule 1 — runs of ≥5 same-colour in rows and columns.
  const runScore = (line: boolean[]): number => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run++;
        if (run === 5) s += 3;
        else if (run > 5) s += 1;
      } else run = 1;
    }
    return s;
  };
  for (let r = 0; r < size; r++) score += runScore(g[r]!);
  for (let c = 0; c < size; c++) score += runScore(g.map((row) => row[c]!));
  // Rule 2 — 2×2 blocks of the same colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = g[r]![c];
      if (v === g[r]![c + 1] && v === g[r + 1]![c] && v === g[r + 1]![c + 1]) score += 3;
    }
  }
  // Rule 3 — the 1:1:3:1:1 finder-like pattern in rows and columns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const hasAt = (line: boolean[], i: number, pat: boolean[]) =>
    pat.every((p, k) => line[i + k] === p);
  const ruleThree = (line: boolean[]): number => {
    let s = 0;
    for (let i = 0; i + 11 <= line.length; i++) {
      if (hasAt(line, i, pat1) || hasAt(line, i, pat2)) s += 40;
    }
    return s;
  };
  for (let r = 0; r < size; r++) score += ruleThree(g[r]!);
  for (let c = 0; c < size; c++) score += ruleThree(g.map((row) => row[c]!));
  // Rule 4 — deviation of dark-module proportion from 50%.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (g[r]![c]) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}
