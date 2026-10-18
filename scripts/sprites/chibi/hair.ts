/**
 * Hairstyles. Hair is the single biggest identity signal on a chibi — it is
 * what makes Claude "the peach-haired one" and Gemini "the rainbow one" — so
 * each style is described by its silhouette and filled procedurally, which
 * keeps shading consistent across styles and colours.
 *
 * Back hair sits behind the body and is shaded one step darker than the fringe;
 * that single value step is what gives the head its depth.
 *
 * Geometry follows `body.ts`: head skin x20–43 × y11–35, eyes from y21.
 */

import type { Layer } from './grid.ts';

export type BackStyle = 'long' | 'wavy' | 'hime' | 'twintails' | 'ponytail' | 'bob' | 'short';
export type FringeStyle = 'soft' | 'blunt' | 'swept' | 'parted';
export type LockLength = 'long' | 'mid' | 'short';

const W = 64;

/** A 64 × 64 character canvas, cropped to its bounding box on output. */
class Sheet {
  private cells: string[][] = Array.from({ length: W }, () => Array(W).fill('.'));
  set(x: number, y: number, ch: string) {
    if (x >= 0 && y >= 0 && x < W && y < W) this.cells[y][x] = ch;
  }
  layer(mats: string[]): Layer {
    let x0 = W;
    let y0 = W;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++)
        if (this.cells[y][x] !== '.') {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (x1 < 0) return { x: 0, y: 0, rows: [], mats };
    const rows = [];
    for (let y = y0; y <= y1; y++) rows.push(this.cells[y].slice(x0, x1 + 1).join(''));
    return { x: x0, y: y0, rows, mats };
  }
}

type Span = [number, number, number];

/** The back of the skull cap shared by every style. */
const DOME: Span[] = [
  [3, 26, 37],
  [4, 23, 40],
  [5, 21, 42],
  [6, 20, 43],
  [7, 19, 44],
  [8, 18, 45],
  [9, 18, 45],
];

function span(y0: number, y1: number, x0: number, x1: number): Span[] {
  const out: Span[] = [];
  for (let y = y0; y <= y1; y++) out.push([y, x0, x1]);
  return out;
}

function fillBack(sheet: Sheet, spans: Span[]) {
  for (const [y, x0, x1] of spans) {
    for (let x = x0; x <= x1; x++) {
      const edge = x - x0 <= 1 || x1 - x <= 1;
      const strand = (x + (y >> 3)) % 6 === 0;
      sheet.set(x, y, edge || strand ? 'm' : 'd');
    }
  }
}

/** Pointed tips hanging from `y`, one every `pitch` pixels across [x0, x1]. */
function tips(sheet: Sheet, y: number, x0: number, x1: number, depth: number, pitch = 5) {
  const c = (pitch - 1) / 2;
  for (let x = x0; x <= x1; x++) {
    const len = Math.round(depth - Math.abs(((x - x0) % pitch) - c) * (depth / (c + 0.5)));
    for (let d = 1; d <= len; d++) sheet.set(x, y + d, 'd');
  }
}

export interface HairOptions {
  back: BackStyle;
  fringe: FringeStyle;
  locks: LockLength;
  ahoge?: boolean;
  /** Material for the tie on twintails and ponytails. */
  tieMat?: string;
}

export function backHair(opt: HairOptions): Layer[] {
  const s = new Sheet();
  const tie = new Sheet();
  const dome = [...DOME, ...span(10, 20, 17, 46)];
  switch (opt.back) {
    case 'long':
      fillBack(s, [...dome, ...span(21, 30, 16, 47), ...span(31, 44, 15, 48)]);
      tips(s, 44, 15, 48, 3, 6);
      break;
    case 'wavy': {
      const rows: Span[] = [...dome, ...span(21, 26, 16, 47)];
      for (let y = 27; y <= 45; y++) {
        const w = [0, 1, 1, 0, 0, -1, -1, 0][(y - 27) % 8];
        rows.push([y, 15 - w, 48 + w]);
      }
      fillBack(s, rows);
      tips(s, 45, 14, 49, 3, 6);
      break;
    }
    case 'hime':
      fillBack(s, [...dome, ...span(21, 47, 16, 47)]);
      for (let x = 16; x <= 47; x++) s.set(x, 47, 'd');
      break;
    case 'twintails': {
      fillBack(s, [...dome, ...span(21, 28, 17, 46)]);
      const tail: Span[] = [];
      for (let y = 10; y <= 44; y++) {
        const t = (y - 10) / 34;
        const bulge = Math.round(Math.sin(t * Math.PI) * 3.4);
        const x1 = 17 - Math.round(t * 2);
        tail.push([y, Math.max(5, x1 - 4 - bulge), x1]);
      }
      fillBack(s, tail);
      fillBack(s, tail.map(([y, a, b]) => [y, 63 - b, 63 - a] as Span));
      tips(s, 44, 9, 16, 2, 4);
      tips(s, 44, 47, 54, 2, 4);
      if (opt.tieMat) for (const x of [15, 16, 17, 18, 45, 46, 47, 48]) for (const y of [9, 10]) tie.set(x, y, 'm');
      break;
    }
    case 'ponytail': {
      fillBack(s, [...dome, ...span(21, 30, 17, 46)]);
      const tail: Span[] = [];
      for (let y = 6; y <= 42; y++) {
        const t = (y - 6) / 36;
        const cx = 45 + Math.round(Math.sin(t * Math.PI * 0.9) * 6);
        tail.push([y, cx - 3, cx + 3 - Math.round(t * 2)]);
      }
      fillBack(s, tail);
      tips(s, 42, 47, 53, 2, 4);
      if (opt.tieMat) for (const [x, y] of [[45, 6], [46, 6], [47, 6], [45, 7], [46, 7], [47, 7]]) tie.set(x, y, 'm');
      break;
    }
    case 'bob':
      fillBack(s, [...dome, ...span(21, 30, 16, 47), ...span(31, 34, 15, 48), [35, 16, 47]]);
      break;
    case 'short':
      fillBack(s, [...dome, ...span(21, 28, 17, 46)]);
      break;
  }
  const out = [s.layer(['hair'])];
  if (opt.tieMat) {
    const t = tie.layer([opt.tieMat]);
    if (t.rows.length) out.push(t);
  }
  return out;
}

/**
 * Lowest fringe pixel for each x in 20..43 (face columns). Over the eyes it
 * stops at y19 so the fringe's own outline lands on y20, clear of the lashes.
 */
function fringeProfile(style: FringeStyle): number[] {
  const clamp = (v: number[]) =>
    v.map((b, i) => {
      const x = 20 + i;
      const overEye = (x >= 22 && x <= 28) || (x >= 35 && x <= 41);
      return overEye ? Math.min(19, b) : b;
    });
  switch (style) {
    case 'soft':
      return clamp([21, 20, 19, 19, 18, 18, 19, 19, 19, 20, 21, 22, 22, 21, 20, 19, 19, 19, 18, 18, 19, 19, 20, 21]);
    case 'blunt':
      return clamp([21, ...Array(22).fill(19), 21]);
    case 'swept':
      return clamp(Array.from({ length: 24 }, (_, i) => (i >= 22 ? 20 + (i - 22) : Math.min(19, 14 + Math.round(i * 0.3)))));
    case 'parted':
      return clamp(Array.from({ length: 24 }, (_, i) => Math.min(21, 14 + Math.round(Math.abs(i - 11.5) * 0.62))));
  }
}

const LOCK_END: Record<LockLength, number> = { long: 38, mid: 32, short: 27 };

export function frontHair(opt: HairOptions): Layer[] {
  const s = new Sheet();
  const cap: Span[] = [
    [6, 25, 38],
    [7, 23, 40],
    [8, 21, 42],
    [9, 20, 43],
    [10, 19, 44],
    [11, 18, 45],
    [12, 18, 45],
    [13, 17, 46],
    [14, 17, 46],
  ];
  for (const [y, x0, x1] of cap) for (let x = x0; x <= x1; x++) s.set(x, y, 'm');
  // Angel ring: a shine band following the curve of the crown, broken where
  // strands cross it, brightest towards the light on the upper left.
  const RING: [number, number, string][] = [
    [21, 12, 'l'], [22, 11, 'l'], [23, 11, 'h'], [24, 11, 'h'], [25, 10, 'l'], [26, 10, 'l'],
    [28, 10, 'l'], [29, 10, 'h'], [30, 10, 'l'], [31, 10, 'l'], [32, 10, 'l'],
    [34, 10, 'l'], [35, 10, 'l'], [36, 11, 'l'], [37, 11, 'l'], [39, 11, 'l'], [40, 12, 'l'],
  ];
  for (const [x, y, ch] of RING) {
    s.set(x, y, ch);
    if (ch === 'h') s.set(x, y + 1, 'l');
  }

  const profile = fringeProfile(opt.fringe);
  for (let x = 17; x <= 46; x++) {
    const bottom = x < 20 || x > 43 ? 21 : profile[x - 20];
    for (let y = 15; y <= bottom; y++) s.set(x, y, 'm');
  }
  // Strand separations: a short shadow line above every notch in the edge.
  for (let i = 1; i < 23; i++) {
    if (profile[i] < profile[i - 1] && profile[i] <= profile[i + 1]) {
      for (let y = profile[i] - 1; y <= profile[i]; y++) s.set(20 + i, y, 'd');
    }
  }
  if (opt.fringe === 'swept') for (let x = 23; x <= 41; x += 6) s.set(x, 15 + Math.round((x - 20) * 0.25), 'd');
  if (opt.fringe === 'parted') for (let y = 7; y <= 13; y++) s.set(31, y, 'd');

  // Side locks framing the face, tapering to a point.
  const end = LOCK_END[opt.locks];
  for (let y = 15; y <= end; y++) {
    const taper = y > end - 4 ? end - y : 3;
    const shift = y > end - 4 ? 3 - taper : 0;
    for (let k = 0; k <= Math.min(3, taper); k++) {
      s.set(17 + k + shift, y, k === 0 ? 'l' : 'm');
      s.set(46 - k - shift, y, k === 0 ? 'd' : 'm');
    }
  }
  const layers = [s.layer(['hair'])];
  if (opt.ahoge) layers.push({ x: 31, y: 0, mats: ['hair'], rows: ['...mm', '..mm.', '.mm..', '.m...', 'mm...', 'm....'] });
  return layers;
}
