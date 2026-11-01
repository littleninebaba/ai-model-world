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
 * 换形象只改一处：往 `POKEMON_REGISTRY` 加一行（厂商 id → 物种，用 gen5/showdown/staticSprite 指明图源）。
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
   * 仅用于「一列看满 4 件道具」的示范，会让 manifest 的 flags
   * 与该模型真实能力不符；正常物种不要打开。
   */
  demoAllProps?: boolean;
  /**
   * 可选：把该物种的内容高度单独归一到这个像素值（默认 TARGET_CONTENT_H）。
   * 只影响纵向；宽度预算（道具列）仍是硬上限，所以特别宽的物种调大它也不会更宽。
   */
  fitHeight?: number;
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

/**
 * 主帧内容高度统一归一到这个值（64 px 格内）。实测 chibi 角色身高 56–58px，
 * 取 56 让宝可梦与回退到 chibi 的厂商站在同一排时高度一致。
 */
const TARGET_CONTENT_H = 56;
/** 允许的最大放大倍数。小图放太大块状明显，2.2 倍以内尚可接受。 */
const MAX_UPSCALE = 2.2;
/** 内容底边离格子底部的留白，用来把所有角色对齐到同一条地平线。 */
const GROUND_PAD = 2;

/** 拉取并解码一个物种，按内容高度归一并算出摆进 64 px 格子的偏移。构建期联网一次。 */
export async function loadPokemonAsset(spec: PokemonSpec): Promise<PokemonAsset> {
  const decoded = await decodeAnimatedGif(spec.animated);
  if (decoded.frames.length === 0) throw new Error(`no frames decoded for ${spec.key}`);

  // 精灵整体靠左摆，右侧让出 PROP_LANE 宽的一条竖列专门放能力道具（见 drawAbilityLane）。
  // 轮廓只统计「真正会进 sheet 的帧」：stand + 九帧循环。动图里其余帧（有的物种多达数十帧）
  // 并不会被摆进图，若一并算进来会误报超宽（全帧并集会比实际用到的那 9 帧更大）。
  const standIndex = spec.standFrame ?? STAND;
  const loopStart = spec.loopStart ?? LOOP;
  const usedFrames = new Set<number>([standIndex]);
  for (let c = 0; c < COLUMNS; c++) usedFrames.add((loopStart + c) % decoded.frames.length);

  let frames = decoded.frames;
  const union = measureContent(frames, usedFrames);
  if (!union) throw new Error(`${spec.key}: no visible pixels in the frames that go into the sheet`);
  const stand = measureContent(frames, [standIndex]);
  if (!stand) throw new Error(`${spec.key}: no visible pixels in the standing frame`);
  let content = union;

  // ── 体型归一：按「主帧内容高度」而不是宽度 ─────────────────────────────
  // 宝可梦的宽高比差异极大（展翅的伊裴尔塔尔 52×18 vs 细高的千面避役 19×63）。
  // 旧逻辑按「所有入图帧并集的宽度」压到 56px：展翅的被压成小点、细高的顶满格子，
  // 而且动画里抬手的帧会抬高并集高度，把主帧一起拖小。
  // 现在高度按**主帧**归一到 TARGET_CONTENT_H；并集只用来约束宽度与格子溢出。
  const standH = stand.maxY - stand.minY + 1;
  const unionW = union.maxX - union.minX + 1;
  const targetH = spec.fitHeight ?? TARGET_CONTENT_H;
  const widthBudget = CELL - PROP_LANE - 1;
  const scale = Math.max(0.05, Math.min(targetH / standH, widthBudget / unionW, MAX_UPSCALE));

  if (Math.abs(scale - 1) > 0.01) {
    frames = await scaleFrames(frames, scale);
    const rescanned = measureContent(frames, usedFrames);
    if (!rescanned) throw new Error(`${spec.key}: sprite vanished after rescaling`);
    content = rescanned;
  }

  let fitW = content.maxX - content.minX + 1;
  let fitH = content.maxY - content.minY + 1;
  // 最近邻缩放的取整可能顶出 1px；并集超宽或动画帧高过格子时再收一档。
  const corrective = Math.min(widthBudget / fitW, CELL / fitH);
  if (corrective < 1) {
    frames = await scaleFrames(frames, corrective);
    const rescanned = measureContent(frames, usedFrames);
    if (!rescanned) throw new Error(`${spec.key}: sprite vanished after fit correction`);
    content = rescanned;
    fitW = content.maxX - content.minX + 1;
    fitH = content.maxY - content.minY + 1;
  }
  if (fitW > widthBudget || fitH > CELL) {
    throw new Error(`${spec.key}: sprite is ${fitW}x${fitH}px, no room for the ${PROP_LANE}px prop lane`);
  }

  // 水平：在道具列左侧的可用宽度里居中（细高物种若贴死左边会留出大片空白）。
  const dx = -content.minX + Math.max(0, Math.floor((CELL - PROP_LANE - fitW) / 2));
  // 垂直：内容底边对齐到同一条地平线，而不是按整帧居中——所有角色才踩在同一条线上。
  const dy = CELL - GROUND_PAD - (content.maxY + 1);

  return { spec, frames, dx, dy };
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
 * 从主帧估锚点。物种姿态各异（四足 / 双足 / 悬空），无法像 chibi 那样按图层切出「头部」，
 * 所以改用轮廓法——从上往下扫，第一个「明显变宽」的行就是肩线（身体/附件展开处），
 * 肩线以上即视作头部。这样王冠与光环会落在头上，而不是横跨整只精灵。
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
 * 前端的四向行走行共用同一段（素材只有正面朝向）。
 * 锚点只按精灵本身实测（不含道具），否则王冠 / 光环会被右侧道具带偏。
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

/**
 * 图鉴号 1–649 有第 5 世代（黑白）全套动画 GIF，像素风与 chibi 最接近，优先用它。
 * 括号里的数字是图鉴号，也是 GIF 文件名。
 */
function gen5(key: string, name: string, dex: number): PokemonSpec {
  return {
    key,
    name,
    note: `PokeAPI/sprites 第 5 世代动画${name}（#${dex}）`,
    animated: `pokemon/versions/generation-v/black-white/animated/${dex}.gif`,
  };
}

/** 图鉴号 650+ 没有第 5 世代动图，改用 Showdown 动画（同为多帧 GIF，画风不同）。 */
function showdown(key: string, name: string, dex: number): PokemonSpec {
  return {
    key,
    name,
    note: `PokeAPI/sprites Showdown 动画${name}（#${dex}）`,
    animated: `pokemon/other/showdown/${dex}.gif`,
  };
}

/** Showdown 也缺图时退回正面静态精灵（单帧 PNG，仍能正常合成）。 */
function staticSprite(key: string, name: string, dex: number): PokemonSpec {
  return {
    key,
    name,
    note: `PokeAPI/sprites 正面静态精灵${name}（#${dex}，Showdown 无动图）`,
    animated: `pokemon/${dex}.png`,
  };
}

/** 在这个表里加一行（厂商 id → 物种），该厂商所有模型就会用宝可梦形象。 */
export const POKEMON_REGISTRY: Record<string, PokemonSpec> = {
  // ── 国内厂商 ──────────────────────────────────────────────
  alibaba: gen5('entei', '炎帝', 244),
  deepseek: gen5('arceus', '阿尔宙斯', 493),
  zhipuai: showdown('zygarde', '基格尔德', 718),
  minimax: gen5('celebi', '雪拉比', 251),
  'bytedance-seed': gen5('chansey', '吉利蛋', 113),
  moonshotai: gen5('umbreon', '月亮伊布', 197),
  tencent: gen5('ditto', '百变怪', 132),
  xiaomi: showdown('alcremie', '霜奶仙', 869),
  inclusionai: gen5('heracross', '赫拉克罗斯', 214),
  stepfun: gen5('starmie', '宝石海星', 121),
  kwaipilot: showdown('duraludon', '铝钢龙', 884),
  baidu: showdown('poltchageist', '来悲粗茶', 1012),
  meituan: gen5('dragonite', '快龙', 149),

  // ── 国外厂商 ──────────────────────────────────────────────
  openai: gen5('giratina', '骑拉帝纳', 487),
  google: gen5('palkia', '帕路奇亚', 484),
  mistral: gen5('dialga', '帝牙卢卡', 483),
  anthropic: showdown('yveltal', '伊裴尔塔尔', 717),
  meta: showdown('xerneas', '哲尔尼亚斯', 716),
  xai: gen5('hooh', '凤王', 250),
  nvidia: gen5('mewtwo', '超梦', 150),
  cohere: gen5('lugia', '路基亚', 249),
  amazon: gen5('regigigas', '雷吉奇卡斯', 486),
  sakana: gen5('feraligatr', '大力鳄', 160),
  deepreinforce: gen5('mew', '梦幻', 151),
  ibm: gen5('kyogre', '盖欧卡', 382),
  microsoft: gen5('groudon', '古拉顿', 383),
  nousresearch: gen5('kyurem', '酋雷姆', 646),
  perplexity: gen5('raikou', '雷公', 243),
  'aion-labs': gen5('suicune', '水君', 245),
  'arcee-ai': gen5('zapdos', '闪电鸟', 145),
  inception: gen5('articuno', '急冻鸟', 144),
  poolside: gen5('moltres', '火焰鸟', 146),
  upstage: gen5('blastoise', '水箭龟', 9),
  sao10k: gen5('charizard', '喷火龙', 6),
  thedrummer: showdown('cinderace', '闪炎王牌', 815),
  vispark: showdown('inteleon', '千面避役', 818),
  ai21: gen5('meganium', '大菊花', 154),
  baai: gen5('typhlosion', '火爆兽', 157),
  'inference-net': showdown('morpeko', '莫鲁贝可', 877),
  mindlab: gen5('gengar', '耿鬼', 94),
  morph: gen5('mismagius', '梦妖魔', 429),
  openbmb: gen5('wigglytuff', '胖可丁', 40),
  quiverai: gen5('togekiss', '波克基斯', 468),
  reflection: gen5('espeon', '太阳伊布', 196),
  rekaai: gen5('lapras', '拉普拉斯', 131),
  relace: gen5('chandelure', '水晶灯火灵', 609),
  sarvam: gen5('snorlax', '卡比兽', 143),
  scaledown: showdown('greninja', '甲贺忍蛙', 658),
  stealth: gen5('lucario', '路卡利欧', 448),
  'swiss-ai': gen5('latias', '拉帝亚斯', 380),
  thinkingmachines: gen5('latios', '拉帝欧斯', 381),
  writer: gen5('tyranitar', '班基拉斯', 248),
  aisingapore: gen5('garchomp', '烈咬陆鲨', 445),
  'anthracite-org': showdown('greattusk', '雄伟牙', 984),
  apodex: gen5('pinsir', '凯罗斯', 127),
  baichuan: showdown('trevenant', '朽木妖', 709),
  cognitivecomputations: showdown('centiskorch', '焚焰蚣', 851),
  elorian: gen5('luxray', '伦琴猫', 405),
  fireworks: showdown('drednaw', '暴噬龟', 834),
  gryphe: showdown('appletun', '丰蜜龙', 841),
  liquid: gen5('raichu', '雷丘', 26),
  mancer: gen5('camerupt', '喷火驼', 323),
  mixedbread: staticSprite('ogerpon', '厄诡椪', 1017),
  'motif-technologies': showdown('lunala', '露奈雅拉', 792),
  'nex-agi': showdown('solgaleo', '索尔迦雷欧', 791),
  paddlepaddle: showdown('regieleki', '雷吉艾勒奇', 894),
  perceptron: showdown('zeraora', '捷拉奥拉', 807),
  sdaia: gen5('kangaskhan', '袋兽', 115),
  trendyol: gen5('gyarados', '暴鲤龙', 130),
  typesafe: staticSprite('toxtricity', '颤弦蝾螈', 849),
  unbiased: gen5('metagross', '巨金怪', 376),
  undi95: showdown('rillaboom', '轰擂金刚猩', 812),
  vivgrid: gen5('porygon2', '多边兽乙型', 233),
};

/** 取某厂商的宝可梦形象；未登记返回 null（调用方回退 chibi）。 */
export function pokemonFor(vendorId: string): PokemonSpec | null {
  return POKEMON_REGISTRY[vendorId] ?? null;
}
