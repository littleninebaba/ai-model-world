/**
 * Character-art layers → pixels.
 *
 * A layer is a block of text rows placed at (x, y) on the 64 × 64 cell. Each
 * character is a palette *slot*, never a colour: `m` means "base shade of this
 * layer's main material", so one drawing serves every vendor's colours.
 *
 * Default slots (per layer, materials named in `mats`):
 *   o d m l h   main material     line · shadow · base · light · highlight
 *   O D M L H   second material
 *   0 1 2 3 4   third material
 *   .           transparent
 * Anything else must be declared in the layer's own `legend`.
 *
 * Each layer is outlined on its own before it is filled: transparent pixels next
 * to the layer take the line shade of the neighbouring material. Drawing that
 * outline *over* whatever is already on the canvas is what separates bangs from
 * the face and a sleeve from the torso without anyone drawing those lines by hand.
 */

import { type Raster, type Rgba, setPixel } from '../raster.ts';
import { mixRamp, type Ramp } from './color.ts';

/** Either a flat ramp or a vertical gradient of ramps keyed by canvas y. */
export type Material = Ramp | { stops: readonly (readonly [number, Ramp])[] };

export type Palette = Record<string, Material>;

export type Slot = { mat: string; shade: 0 | 1 | 2 | 3 | 4 } | { rgba: Rgba; line?: Rgba };

export interface Layer {
  x: number;
  y: number;
  rows: readonly string[];
  /** Materials behind the default slots: [main, second, third]. */
  mats?: readonly string[];
  legend?: Record<string, Slot>;
  /** Draw a one-pixel outline around the layer. Default true. */
  outline?: boolean;
  /** Fixed outline colour instead of each material's line shade (e.g. a white sticker edge). */
  outlineColor?: Rgba;
  /** Flip the drawing horizontally about the layer's own box. */
  flip?: boolean;
}

const MAIN = 'odmlh';
const SECOND = 'ODMLH';
const THIRD = '01234';

function isRamp(m: Material): m is Ramp {
  return Array.isArray(m);
}

export function rampAt(m: Material, y: number): Ramp {
  if (isRamp(m)) return m;
  const stops = m.stops;
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [y1, r1] = stops[i];
    if (y <= y1) {
      const [y0, r0] = stops[i - 1];
      return mixRamp(r0, r1, (y - y0) / (y1 - y0));
    }
  }
  return stops[stops.length - 1][1];
}

interface Px {
  rgba: Rgba;
  line: Rgba;
}

function resolve(ch: string, layer: Layer, palette: Palette, y: number): Px | null {
  if (ch === '.' || ch === ' ') return null;
  const own = layer.legend?.[ch];
  let slot: Slot | undefined = own;
  if (!slot) {
    const mats = layer.mats ?? [];
    let i = MAIN.indexOf(ch);
    if (i >= 0 && mats[0]) slot = { mat: mats[0], shade: i as 0 };
    i = SECOND.indexOf(ch);
    if (i >= 0 && mats[1]) slot = { mat: mats[1], shade: i as 0 };
    i = THIRD.indexOf(ch);
    if (i >= 0 && mats[2]) slot = { mat: mats[2], shade: i as 0 };
  }
  if (!slot) throw new Error(`unmapped slot '${ch}' in layer at ${layer.x},${layer.y}`);
  if ('rgba' in slot) return { rgba: slot.rgba, line: slot.line ?? slot.rgba };
  const material = palette[slot.mat];
  if (!material) throw new Error(`palette has no material '${slot.mat}'`);
  const r = rampAt(material, y);
  return { rgba: r[slot.shade], line: r[0] };
}

/** Rasterise one layer to a sparse pixel map keyed by canvas index. */
export function pixelsOf(layer: Layer, palette: Palette, width: number, height: number): Map<number, Px> {
  const out = new Map<number, Px>();
  const w = Math.max(...layer.rows.map((r) => r.length));
  layer.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const x = layer.x + (layer.flip ? w - 1 - i : i);
      const y = layer.y + j;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const px = resolve(row[i], layer, palette, y);
      if (px) out.set(y * width + x, px);
    }
  });
  return out;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
];

export function drawLayer(canvas: Raster, layer: Layer, palette: Palette): void {
  const { width, height } = canvas;
  const px = pixelsOf(layer, palette, width, height);
  if (layer.outline !== false) {
    const edge = new Map<number, Rgba>();
    for (const [idx, p] of px) {
      if (p.rgba[3] < 200) continue;
      const x = idx % width;
      const y = (idx - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (px.has(n) || edge.has(n)) continue;
        edge.set(n, layer.outlineColor ?? p.line);
      }
    }
    for (const [idx, c] of edge) setPixel(canvas, idx % width, Math.floor(idx / width), c);
  }
  for (const [idx, p] of px) setPixel(canvas, idx % width, Math.floor(idx / width), p.rgba);
}
