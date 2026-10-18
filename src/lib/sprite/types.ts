/**
 * Contract between the sprite pipeline (`scripts/sprites/`) and the site.
 * Mirrors `public/sprites/manifest.json` exactly.
 */

export type Facing = 'up' | 'left' | 'down' | 'right';

/** Rows of the generated sheet. `stand` holds the front-facing display pose. */
export type SpriteRow = 'stand' | Facing;

export const FACINGS: readonly Facing[] = ['up', 'left', 'down', 'right'];

export interface FrameGrid {
  /** Edge length of one square cell, in source pixels. */
  size: number;
  columns: number;
  rows: number;
}

/** Which character and which data-driven props a sheet carries; metadata for tooltips and QA. */
export interface SpriteAppearance {
  /** Design key from `scripts/sprites/chibi/designs.ts`: a vendor id, `vendor/variant`, or the vendor id of a fallback look. */
  character: string;
  /** What the look is based on: an established community character, an official mascot, the vendor's logo, or the generic fallback. */
  basis: 'community' | 'official' | 'icon' | 'fallback';
  /** 1–5 from `buildSizeScale`. The sheet itself is the same size for every tier; the site scales it. */
  sizeTier: number;
  /** 1-based ECI rank, or null when the model has no ECI score. */
  rank: number | null;
  crown: 'gold' | 'laurel' | 'silver' | null;
  flags: {
    /** Eyes open. Text-only models keep them closed. */
    imageIn: boolean;
    /** Headphones. */
    audio: boolean;
    /** Paintbrush. */
    imageOut: boolean;
    /** Key. */
    openWeights: boolean;
  };
}

export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Measured attachment points for the state overlays the site draws itself,
 * in standing-frame pixels (origin at the top-left of the 64 px cell, before any
 * display scaling). Measured off the composited character, so they already
 * account for body type, hairstyle volume and headgear.
 */
export interface SpriteAnchors {
  /** Head plus hair. Float haloes and sparkles above `y`. */
  head: AnchorBox;
  /** Bare skull. A crown rests on `y`; ear-level items sit at `y + height*0.45`. */
  skull: AnchorBox;
  /**
   * The whole character, excluding the ground shadow. `y + height` is the feet,
   * which is where ground fog belongs; the box also bounds the ghost tint.
   */
  body: AnchorBox;
}

export interface SpriteEntry {
  slug: string;
  modelId: string;
  vendorId: string;
  /** Public path, already root-relative. */
  file: string;
  width: number;
  height: number;
  bytes: number;
  /** Content hash of the PNG; stable across runs, safe as a cache key. */
  sha256: string;
  anchors: SpriteAnchors;
  appearance: SpriteAppearance;
}

export interface SpriteManifest {
  generatedAt: string;
  /** Bumped whenever the composer's output would change for identical input. */
  pipeline: string;
  /**
   * False: the PNGs carry identity only — the vendor's character plus the
   * headset, brush, key and open/closed eyes. The five state overlays (crown, thinking halo, newborn
   * sparkle, fog cloak, retired ghost) are *not* drawn in, and the site must
   * render them itself over the sprite, using `anchors` for placement.
   *
   * State changes with the leaderboard and the calendar; baking it in would mean
   * re-rendering every sheet every time a rank moves. `appearance.crown` and
   * `appearance.flags` still carry the computed values as metadata.
   */
  overlaysBaked: boolean;
  frame: FrameGrid;
  rows: Record<SpriteRow, number>;
  /**
   * Frames in one loop row. The characters are drawn front-facing only, so the
   * four facing rows all carry the same nine-frame bob-and-blink loop.
   */
  walkFrames: number;
  sprites: Record<string, SpriteEntry>;
}
