/**
 * Sprite build entry point.
 *
 *   npx tsx scripts/sprites/index.ts
 *
 * Reads `data/models.json` (falling back to a built-in mock snapshot when it is
 * absent), draws one sheet per model into `public/sprites/`, and writes
 * `manifest.json`.
 *
 * Every vendor has one fixed chibi character (`chibi/designs.ts`); a model's
 * sheet is that character plus the props its own data calls for — open or
 * closed eyes, headphones, paintbrush, key. Offline, free and deterministic:
 * identical input always yields identical bytes.
 *
 * The human review sheet is a separate step: `npm run sprites:review`.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { buildSizeScale, crownOf, signsOf } from '../../src/lib/derive.ts';
import type { ModelRecord, Vendor, WorldSnapshot } from '../../src/lib/types.ts';
import type { SpriteEntry, SpriteManifest } from '../../src/lib/sprite/types.ts';
import { designFor } from './chibi/designs.ts';
import { loadPokemonAsset, pokemonFor, renderPokemonSheet, type PokemonAsset } from './pokemon.ts';
import { CELL, COLUMNS, OUT_H, OUT_ROW, OUT_W, renderSheet, ROWS, type ChibiFlags } from './chibi/render.ts';
import { mockSnapshot } from './mock-models.ts';

/** Bump when a drawing change should invalidate cached sheets. */
const PIPELINE_VERSION = '2.4.0';

const ROOT = path.resolve(__dirname, '../..');
const SNAPSHOT_FILE = path.join(ROOT, 'data/models.json');
const OUT_DIR = path.join(ROOT, 'public/sprites');

function loadSnapshot(): { snapshot: WorldSnapshot; source: string } {
  if (process.argv.includes('--mock')) {
    return { snapshot: mockSnapshot(), source: 'built-in mock snapshot (--mock)' };
  }
  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8')) as WorldSnapshot;
      if (Array.isArray(parsed.models) && parsed.models.length > 0) {
        return { snapshot: parsed, source: path.relative(ROOT, SNAPSHOT_FILE) };
      }
    } catch (err) {
      console.warn(`[warn] ${SNAPSHOT_FILE} unreadable (${(err as Error).message}); using mock snapshot`);
    }
  }
  return { snapshot: mockSnapshot(), source: 'built-in mock snapshot (data/models.json absent)' };
}

/** A vendor missing from the snapshot still gets a character: the design table falls back on its own. */
function unknownVendor(id: string): Vendor {
  return { id, name: id, nameZh: id, country: 'ZZ', continent: 'west', motif: 'wanderer', accentColor: '#7c8da6', homepage: null };
}

/** 1-based ranking on ECI; ties break on model id so the order is stable. */
function rankByEci(models: ModelRecord[]): Map<string, number> {
  return new Map(
    models
      .filter((m) => typeof m.benchmarks.eci === 'number')
      .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id))
      .map((m, i) => [m.id, i + 1]),
  );
}

function safeSlug(model: ModelRecord): string {
  const raw = model.slug || model.id;
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** The sprite and the page it sits on must agree, so the props come from the site's own `signsOf`. */
function flagsOf(model: ModelRecord): ChibiFlags {
  const s = signsOf(model);
  return { imageIn: s.eyewear === 'glasses', audio: s.headphones, imageOut: s.paintbrush, openWeights: s.key };
}

async function main() {
  const started = Date.now();
  const { snapshot, source } = loadSnapshot();
  const ranks = rankByEci(snapshot.models);
  const sizeScale = buildSizeScale(snapshot.models);
  const vendors = new Map(snapshot.vendors.map((v) => [v.id, v]));

  console.log(`[input] ${source}: ${snapshot.models.length} models, ${snapshot.vendors.length} vendors`);

  // Mapped vendors draw from a real animated sprite, fetched once and reused for
  // every model of that vendor. Unmapped vendors keep the offline chibi pipeline.
  const pokemonAssets = new Map<string, PokemonAsset>();
  for (const vendorId of new Set(snapshot.models.map((m) => m.vendorId))) {
    const spec = pokemonFor(vendorId);
    if (spec) pokemonAssets.set(vendorId, await loadPokemonAsset(spec));
  }
  if (pokemonAssets.size > 0) {
    const list = [...pokemonAssets.values()].map((a) => `${a.spec.name} (${a.frames.length} frames)`).join(', ');
    console.log(`[pokemon] ${pokemonAssets.size} animated sprite set(s) loaded: ${list}`);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sprites: Record<string, SpriteEntry> = {};
  const byBasis = new Map<string, Set<string>>();
  let bytes = 0;

  for (const model of [...snapshot.models].sort((a, b) => a.id.localeCompare(b.id))) {
    const vendor = vendors.get(model.vendorId) ?? unknownVendor(model.vendorId);
    const pokemon = pokemonAssets.get(vendor.id) ?? null;
    // 宝可梦物种可声明 demoAllProps，把道具栏固定亮齐 4 件（仅示范用，见 pokemon.ts 注册表）。
    const flags: ChibiFlags = pokemon?.spec.demoAllProps
      ? { imageIn: true, audio: true, imageOut: true, openWeights: true }
      : flagsOf(model);
    const design = designFor(vendor, { id: model.id, name: model.name, imageOut: flags.imageOut });
    const { sheet, anchors } = pokemon ? renderPokemonSheet(pokemon, flags) : renderSheet(design, flags);
    const character = pokemon ? pokemon.spec.key : design.key;
    const basis = pokemon ? 'icon' : design.basis;
    const png = await sharp(sheet.data, { raw: { width: OUT_W, height: OUT_H, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer();

    const slug = safeSlug(model);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), png);
    bytes += png.length;
    if (!byBasis.has(basis)) byBasis.set(basis, new Set());
    byBasis.get(basis)!.add(character);

    const rank = ranks.get(model.id) ?? null;
    sprites[slug] = {
      slug,
      modelId: model.id,
      vendorId: vendor.id,
      file: `/sprites/${slug}.png`,
      width: OUT_W,
      height: OUT_H,
      bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
      anchors,
      appearance: {
        character,
        basis,
        sizeTier: sizeScale.sizeOf(model).tier,
        rank,
        crown: crownOf(rank),
        flags,
      },
    };
  }

  const manifest: SpriteManifest = {
    generatedAt: snapshot.generatedAt,
    pipeline: PIPELINE_VERSION,
    overlaysBaked: false,
    frame: { size: CELL, columns: COLUMNS, rows: ROWS },
    rows: OUT_ROW,
    walkFrames: COLUMNS,
    sprites: Object.fromEntries(Object.entries(sprites).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

  const n = Object.keys(sprites).length;
  const cast = [...byBasis.entries()].map(([b, keys]) => `${b} ${keys.size}`).join(', ');
  console.log(`[out] ${n} sprites -> public/sprites/ (${(bytes / 1048576).toFixed(2)} MB, avg ${(bytes / n / 1024).toFixed(1)} KB)`);
  console.log(`[out] characters used: ${cast}`);
  console.log(`[out] total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
