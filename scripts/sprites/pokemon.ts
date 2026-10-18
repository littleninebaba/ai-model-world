/**
 * 「厂商 → 宝可梦」形象层（演示用）。
 *
 * 形象不再手工绘制，而是直接取自公开的宝可梦动图：PokeAPI/sprites 仓库里
 * 第 5 世代的动画 GIF。构建期经 jsdelivr 镜像拉取一次（本机访问
 * raw.githubusercontent.com 被阻断，官方 API pokeapi.co 也可，但镜像更稳），
 * 用 sharp 解码出全部帧，再合成进与 `chibi/` 完全一致的输出契约：
 * 576 × 320、9 列 × 5 行、每格 64 px，并交出同样的 anchors（头 / 颅骨 / 身体包围盒），
 * 因此前端一行都不用改。
 *
 * 用法：在 `POKEMON_REGISTRY` 里把某个厂商 id 指向一个 `PokemonSpec`，
 * 该厂商的所有模型就会用这张图；未登记的厂商照常走 chibi。
 *
 * 换形象只改一处：往 `POKEMON_REGISTRY` 加一行（厂商 id → 物种 + 动图路径）。
 *
 * ⚠️ 版权提醒：宝可梦是任天堂 / Game Freak / The Pokémon Company 的 IP。
 * 本地自己玩没问题；若要公开发布，请换成原创或已授权形象。
 */

import sharp from 'sharp';

import { blank, blit, bounds, type Box, type Raster, type Rgba } from './raster.ts';
import { CELL, COLUMNS, OUT_H, OUT_W, ROWS, type ChibiFlags } from './chibi/render.ts';
import { drawLayer, type Layer, type Palette } from './chibi/grid.ts';
import { hex } from './chibi/color.ts';
import type { SpriteAnchors } from '../../src/lib/sprite/types.ts';

/**
 * PokeAPI/sprites 的镜像列表，按可用性排序尝试。
 * 本机 DNS 解析不了 raw.githubusercontent.com（jsdelivr 主域会 302 过去，故直接失败），
 * gcore 节点可直连，其余节点作为兜底。
 */
const MIRRORS = [
  'https://gcore.jsdelivr.net/gh/PokeAPI/sprites@master/sprites',
  'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites',
  'https://fastly.jsdelivr.net/gh/PokeAPI/sprites@master/sprites',
];

/** 一个物种的动图来源与循环参数。 */
export interface PokemonSpec {
  /** 稳定 key，写进 manifest 的 appearance.character。 */
  key: string;
  name: string;
  note: string;
  /** 第 5 世代动画 GIF 在仓库里的相对路径。 */
  animated: string;
  /** 展示主帧（row 0）在动图里的下标，默认 0。 */
  standFrame?: number;
  /** 九帧循环（row 1–4）的起始下标，默认 0。 */
  loopStart?: number;
  /**
   * 演示用开关：无视厂商各模型的真实能力，把这一个物种的道具栏强制点亮 4 件。
   * 仅用于「一列看满 4 件道具」的示范（阿尔宙斯用），会让 manifest 的 flags
   * 与该模型真实能力不符；正常物种不要打开。
   */
  demoAllProps?: boolean;
}

/** 已解码、并量好居中偏移的物种资源；所有帧尺寸一致。 */
export interface PokemonAsset {
  spec: PokemonSpec;
  frames: Raster[];
  /** 把一帧摆进 64 px 格子的左上角偏移。所有帧共用同一个偏移，避免逐帧抖动。 */
  dx: number;
  dy: number;
}

// ── 拉取与解码 ────────────────────────────────────────────────

/**
 * 下载动图并摊平成一组 RGBA 帧。
 * sharp 对动画 GIF 会先做帧合并，再按页纵向堆叠返回，这里按行切成单帧。
 */
async function decodeAnimatedGif(path: string): Promise<{ width: number; height: number; frames: Raster[] }> {
  const buf = await downloadSprite(path);
  const { data, info } = await sharp(buf, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const pageHeight = info.pageHeight ?? info.height;
  const pages = info.pages ?? 1;
  const stride = width * pageHeight * 4;
  const frames: Raster[] = [];
  for (let p = 0; p < pages; p++) {
    const frame = blank(width, pageHeight);
    data.copy(frame.data, 0, p * stride, (p + 1) * stride);
    frames.push(frame);
  }
  return { width, height: pageHeight, frames };
}

/** 依次尝试各镜像，返回第一个成功的字节。 */
async function downloadSprite(path: string): Promise<Buffer> {
  const errors: string[] = [];
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}/${path}`);
      if (!res.ok) {
        errors.push(`${base} -> ${res.status} ${res.statusText}`);
        continue;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      errors.push(`${base} -> ${(err as Error).message}`);
    }
  }
  throw new Error(`all sprite mirrors failed for ${path}:\n  ${errors.join('\n  ')}`);
}

/** 用到的那几帧（stand + 循环）合起来的不透明包围盒。 */
interface ContentBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 只统计 indices 里的帧，避免动图里不摆进 sheet 的帧把包围盒撑大。 */
function measureContent(frames: Raster[], indices: Iterable<number>): ContentBox | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const idx of indices) {
    const frame = frames[idx];
    const box = bounds(frame, 0, 0, frame.width, frame.height);
    if (!box) continue;
    minX = Math.min(minX, box.x0);
    maxX = Math.max(maxX, box.x1);
    minY = Math.min(minY, box.y0);
    maxY = Math.max(maxY, box.y1);
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

/**
 * 按比例缩小整组帧（最近邻，保住像素画的硬边与调色板本色）。
 * 比 64 px 格子还大的物种（阿尔宙斯 69×82）靠它塞进格子；
 * 反正是整数采样，不引入新颜色。
 */
async function scaleFrames(frames: Raster[], scale: number): Promise<Raster[]> {
  const out: Raster[] = [];
  for (const frame of frames) {
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const { data } = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .resize(width, height, { kernel: 'nearest' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    out.push({ width, height, data: Buffer.from(data) });
  }
  return out;
}

/** 拉取并解码一个物种，算出把它摆进 64 px 格子的偏移（超格则先等比缩小）。构建期联网一次。 */
export async function loadPokemonAsset(spec: PokemonSpec): Promise<PokemonAsset> {
  const decoded = await decodeAnimatedGif(spec.animated);
  if (decoded.frames.length === 0) throw new Error(`no frames decoded for ${spec.key}`);

  // 精灵整体靠左摆，右侧让出 PROP_LANE 宽的一条竖列专门放能力道具（见 drawAbilityLane）。
  // 轮廓只统计「真正会进 sheet 的帧」：stand + 九帧循环。动图里其余帧（六尾共 47 帧）
  // 并不会被摆进图，若一并算进来会误报超宽（六尾全帧并集 x0..59，但用到的那 9 帧只有 x0..55）。
  const standIndex = spec.standFrame ?? STAND;
  const loopStart = spec.loopStart ?? LOOP;
  const usedFrames = new Set<number>([standIndex]);
  for (let c = 0; c < COLUMNS; c++) usedFrames.add((loopStart + c) % decoded.frames.length);

  let frames = decoded.frames;
  let content = measureContent(frames, usedFrames);
  if (!content) throw new Error(`${spec.key}: no visible pixels in the frames that go into the sheet`);

  // 缩放上限同时受三方约束：内容要塞得下（留出右侧道具列 availW），整帧也不能溢出格子。
  // 六尾本身够小，scale 取到 1 → 不缩放；阿尔宙斯则按比例收进来。
  const contentW = content.maxX - content.minX + 1;
  const contentH = content.maxY - content.minY + 1;
  const scale = Math.min((CELL - PROP_LANE) / contentW, CELL / frames[0].width, CELL / frames[0].height, 1);
  if (scale < 1) {
    frames = await scaleFrames(frames, scale);
    const rescanned = measureContent(frames, usedFrames);
    if (!rescanned) throw new Error(`${spec.key}: sprite vanished after downscaling`);
    content = rescanned;
  }

  const fitW = content.maxX - content.minX + 1;
  const fitH = content.maxY - content.minY + 1;
  if (fitW + PROP_LANE > CELL || fitH > CELL || frames[0].width > CELL || frames[0].height > CELL) {
    throw new Error(`${spec.key}: sprite is ${fitW}x${fitH}px, no room for the ${PROP_LANE}px prop lane`);
  }

  return { spec, frames, dx: -content.minX, dy: Math.round((CELL - frames[0].height) / 2) };
}

// ── 锚点实测（供皇冠 / 光环 / 雾 / 闪光定位） ──────────────────

function toBox(box: Box | null): SpriteAnchors['head'] {
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: box.x0, y: box.y0, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 };
}

/** 只在 [yStart, yEnd] 行内测包围盒（绝对坐标，不做偏移）。 */
function boundsRows(src: Raster, yStart: number, yEnd: number): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 某一行不透明像素的水平跨度（min/max），空行返回 null。 */
function rowSpan(src: Raster, y: number): { min: number; max: number } | null {
  let min = -1;
  let max = -1;
  for (let x = 0; x < src.width; x++) {
    if (src.data[(y * src.width + x) * 4 + 3] < 8) continue;
    if (min < 0) min = x;
    max = x;
  }
  return min < 0 ? null : { min, max };
}

/**
 * 从主帧估锚点。六尾是四足兽：脑袋在左上角，身体与三条尾巴在右侧，
 * 无法像 chibi 那样按图层切出「头部」，所以改用轮廓法——
 * 从上往下扫，第一个「明显变宽」的行就是肩线（尾巴/身体的起点），
 * 肩线以上即视作头部。这样王冠与光环会落在耳朵上，而不是横跨整只狐狸。
 */
function anchorsOf(cell: Raster): SpriteAnchors {
  const body = bounds(cell, 0, 0, CELL, CELL);
  if (!body) {
    const empty = toBox(null);
    return { head: empty, skull: empty, body: empty };
  }

  let maxSpan = 0;
  for (let y = body.y0; y <= body.y1; y++) {
    const s = rowSpan(cell, y);
    if (s) maxSpan = Math.max(maxSpan, s.max - s.min + 1);
  }

  const shoulder = maxSpan * 0.72;
  let headBottom = body.y1;
  for (let y = body.y0; y <= body.y1; y++) {
    const s = rowSpan(cell, y);
    if (s && s.max - s.min + 1 >= shoulder) {
      headBottom = Math.max(body.y0, y - 1);
      break;
    }
  }

  const head = toBox(boundsRows(cell, body.y0, headBottom));
  return { head, skull: head, body: toBox(body) };
}

// ── 能力道具栏 ────────────────────────────────────────────────
//
// 原方案里每个角色靠「装备」表达能力，但四件道具直接叠在六尾身上会糊成一团。
// 改成竖排在格子右侧让出的一条窄列里：只占一列、不压身体，谁有哪件能力就亮哪件。
// 六尾（Anthropic）目前数据里只有「看图」，所以只会出现博识眼镜；
// 其余三件图标已经画好，能力数据一到就会自动亮起。
//
// 每件道具本体宽 6 px，左右各 1 px 描边，恰好塞进 PROP_LANE = 8 px 的列。

/** 右侧专门让给道具栏的宽度（px）。loadPokemonAsset 会按它把精灵靠左摆。 */
const PROP_LANE = 8;
/** 图标本体左上角 x（6 px 宽 → x56..63 的列里居中）。 */
const ICON_X = CELL - PROP_LANE + 1;
/** 第一件道具的中心 y，以及相邻道具的中心间距。 */
const LANE_CENTER = 8;
const LANE_STEP = 16;

const EMPTY_PALETTE: Palette = {};

interface PropIcon {
  rows: readonly string[];
  legend: Record<string, { rgba: Rgba; line: Rgba }>;
}

/** 用「字符 → [填充色, 描边色]」建一个小图标；字符一律是显式色值，故无需调色板。 */
function propIcon(rows: readonly string[], colors: Record<string, [string, string]>): PropIcon {
  const legend: Record<string, { rgba: Rgba; line: Rgba }> = {};
  for (const [ch, [fill, line]] of Object.entries(colors)) legend[ch] = { rgba: hex(fill), line: hex(line) };
  return { rows, legend };
}

/** 四件能力道具：看图 = 博识眼镜，能听 = 厉害耳塞，画图 = 冒险笔记，开源 = 秘密钥匙。 */
const PROP_ICONS: Record<keyof ChibiFlags, PropIcon> = {
  imageIn: propIcon(['KK..KK', 'LLKKLL', 'KK..KK'], { K: ['#1f2937', '#0b1220'], L: ['#67e8f9', '#0e7490'] }),
  audio: propIcon(['.MMMM.', 'M....M', 'M....M', 'KK..KK', 'KK..KK'], {
    M: ['#a78bfa', '#4c1d95'],
    K: ['#6d28d9', '#3b0a86'],
  }),
  imageOut: propIcon(['DBBBB.', 'DBLLB.', 'DBLLB.', 'DBBBB.', 'DBBBB.', 'DBBBB.'], {
    D: ['#92400e', '#4a1d05'],
    B: ['#d97706', '#7c3a06'],
    L: ['#fef3c7', '#b45309'],
  }),
  openWeights: propIcon(['..KK..', '.K..K.', '.K..K.', '..KK..', '..KK..', '..KKK.', '..KK..', '..KKK.'], {
    K: ['#facc15', '#a16207'],
  }),
};

/** 道具从上到下的固定槽位顺序，和能力梳理表一致；缺的能力留空。 */
const PROP_ORDER: readonly (keyof ChibiFlags)[] = ['imageIn', 'audio', 'imageOut', 'openWeights'];

/** 把该模型拥有的能力道具竖排在右侧一列。 */
function drawAbilityLane(cell: Raster, flags: ChibiFlags): void {
  PROP_ORDER.forEach((key, slot) => {
    if (!flags[key]) return;
    const icon = PROP_ICONS[key];
    const layer: Layer = {
      x: ICON_X,
      y: LANE_CENTER + slot * LANE_STEP - Math.floor(icon.rows.length / 2),
      rows: icon.rows,
      legend: icon.legend,
    };
    drawLayer(cell, layer, EMPTY_PALETTE);
  });
}

// ── 合成 sheet（契约与 chibi 一致） ────────────────────────────

const STAND = 0;
const LOOP = 0;

/** 把动图里的一帧摆进一个 64 px 格子（不含道具，供锚点实测用）。 */
function bakeFrame(asset: PokemonAsset, index: number): Raster {
  const src = asset.frames[index % asset.frames.length];
  const cell = blank(CELL, CELL);
  blit(cell, src, 0, 0, src.width, src.height, asset.dx, asset.dy);
  return cell;
}

/** 摆好一帧后再补上右侧道具栏。 */
function bakeCell(asset: PokemonAsset, index: number, flags: ChibiFlags): Raster {
  const cell = bakeFrame(asset, index);
  drawAbilityLane(cell, flags);
  return cell;
}

/**
 * 拼出 576 × 320、9×5 的整张 sheet。
 * row 0 放主帧（静态展示）；row 1–4 放同一段九帧循环——
 * 前端的四向行走行共用同一段，六尾本来也只有正面朝向。
 * 锚点只按狐狸本身实测（不含道具），否则王冠 / 光环会被右侧道具带偏。
 */
export function renderPokemonSheet(asset: PokemonAsset, flags: ChibiFlags): { sheet: Raster; anchors: SpriteAnchors } {
  const anchors = anchorsOf(bakeFrame(asset, asset.spec.standFrame ?? STAND));
  const stand = bakeCell(asset, asset.spec.standFrame ?? STAND, flags);
  const loop = Array.from({ length: COLUMNS }, (_, c) => bakeCell(asset, (asset.spec.loopStart ?? LOOP) + c, flags));

  const sheet = blank(OUT_W, OUT_H);
  blit(sheet, stand, 0, 0, CELL, CELL, 0, 0);
  for (let row = 1; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      blit(sheet, loop[col], 0, 0, CELL, CELL, col * CELL, row * CELL);
    }
  }
  return { sheet, anchors };
}

// ── 「厂商 → 宝可梦」映射表 ─────────────────────────────────────

/** 在这个表里加一行（厂商 id → 物种），该厂商所有模型就会用宝可梦形象。 */
export const POKEMON_REGISTRY: Record<string, PokemonSpec> = {
  anthropic: {
    key: 'vulpix',
    name: '六尾',
    note: 'PokeAPI/sprites 第 5 世代动画六尾（Vulpix #37），60×50、47 帧 GIF 合成',
    animated: 'pokemon/versions/generation-v/black-white/animated/37.gif',
  },
  // 阿里（Qwen）能力最全且带开源权重，适合当「满列道具」示范：整条厂商线并集=4，
  // 但没有任何单一模型四样全占（最多 3），故开 demoAllProps 让阿尔宙斯固定亮齐 4 件，
  // 专门用来看满列效果。阿尔宙斯 #493 原图 69×82 比 64 px 格子还大，
  // loadPokemonAsset 会自动等比缩小再摆。
  alibaba: {
    key: 'arceus',
    name: '阿尔宙斯',
    note: 'PokeAPI/sprites 第 5 世代动画阿尔宙斯（Arceus #493），69×82、84 帧 GIF 合成（超格，自动等比缩小）；演示用，道具栏固定亮齐 4 件',
    animated: 'pokemon/versions/generation-v/black-white/animated/493.gif',
    demoAllProps: true,
  },
};

/** 取某厂商的宝可梦形象；未登记返回 null（调用方回退 chibi）。 */
export function pokemonFor(vendorId: string): PokemonSpec | null {
  return POKEMON_REGISTRY[vendorId] ?? null;
}
