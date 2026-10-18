/**
 * Everything worn or carried on top of body + hair: animal ears and tails, head
 * gear, the vendor logo pinned in the hair, and the three capability props
 * (headphones, paintbrush, key) that stay data-driven per model.
 *
 * Geometry follows `body.ts` and `hair.ts`: hair cap x17–46 from y3, hands at
 * y43–45 on x21–23 (left) and x40–42 (right).
 */

import { hex } from './color.ts';
import type { Layer, Slot } from './grid.ts';

export type EarStyle = 'fox' | 'cat' | 'bear' | 'llama';
export type TailStyle = 'fox' | 'whale';
export type Extra = 'sleepmask' | 'shades' | 'beret' | 'scarf' | 'antenna' | 'glasses' | 'bells';

const WHITE: Slot = { rgba: hex('#ffffff'), line: hex('#8a8aa0') };

function mirror(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}

/** A left/right pair from one left-hand drawing. */
function pair(x: number, y: number, rows: string[], rightX: number, mats: string[]): Layer[] {
  return [
    { x, y, rows, mats },
    { x: rightX, y, rows: mirror(rows), mats },
  ];
}

export function ears(style: EarStyle): Layer[] {
  switch (style) {
    case 'fox':
      return pair(16, 0, ['.m......', '.mm.....', '.mMm....', 'mmMMm...', 'mMMMmm..', 'mMMMMmm.', 'mmMMMMmm', 'dmmmmmmm', '.ddmmmmm'], 40, ['ear', 'earInner']);
    case 'cat':
      return pair(17, 1, ['.m.....', '.mm....', 'mMmm...', 'mMMmm..', 'mMMMmm.', 'mMMMMmm', 'dmmmmmm'], 40, ['ear', 'earInner']);
    case 'bear':
      return pair(17, 2, ['.mmmm.', 'mmMMmm', 'mMMMMm', 'mMMMMm', 'dmmmmd'], 41, ['ear', 'earInner']);
    case 'llama':
      return pair(15, 0, ['..mm.', '.mmm.', '.mMm.', 'mmMm.', 'mMMm.', 'mMmm.', 'dmmd.', '.dd..'], 44, ['ear', 'earInner']);
  }
}

export function tail(style: TailStyle): Layer {
  if (style === 'fox') {
    const spans: [number, number][] = [
      [53, 56], [51, 58], [50, 59], [49, 60], [49, 60], [48, 60], [48, 60], [48, 59], [47, 59],
      [47, 58], [46, 58], [45, 57], [44, 56], [43, 55], [42, 54], [41, 52], [41, 50], [41, 48],
    ];
    const rows = spans.map(([a, b], i) => {
      let r = '';
      for (let x = 39; x <= 60; x++) {
        if (x < a || x > b) r += '.';
        else if (i < 5) r += x === b ? 'D' : 'M';
        else r += x === a || x === a + 1 ? 'd' : x === b ? 'd' : (x + i) % 5 === 0 ? 'l' : 'm';
      }
      return r;
    });
    return { x: 39, y: 27, rows, mats: ['tail', 'tailTip'] };
  }
  // A whale's tail rising from behind the skirt, fluke up, like the logo's whale.
  return {
    x: 39,
    y: 27,
    mats: ['tail', 'tailTip'],
    rows: [
      '.........lm.........ml',
      '.........lmm.......mmd',
      '..........lmm.....mmd.',
      '..........lMmm...mmMd.',
      '...........lMmm.mmMd..',
      '............lMmmmMd...',
      '.............lmmmd....',
      '.............Mmmd.....',
      '............MMmd......',
      '...........MMmd.......',
      '..........MMmmd.......',
      '.........MMmmd........',
      '........MMmmd.........',
      '.......MMmmd..........',
      '.....MMMmmd...........',
      '...MMMmmmd............',
      '.MMMmmmdd.............',
      'MMmmmdd...............',
      'mmmdd.................',
    ],
  };
}

export function extra(kind: Extra): Layer[] {
  switch (kind) {
    case 'sleepmask':
      // Worn pushed up on the crown: two closed eyes and a Z, edged in white lace so
      // it still reads on black hair.
      return [
        {
          x: 22,
          y: 3,
          mats: ['mask', 'maskInk'],
          rows: [
            '.MMMMMMMMMMMMMMMMMM.',
            'MmmmmmmmmmmmmmmmmmmM',
            'MmmMmmmMmMMMmMmmmMmM',
            'MmmmMMMmmmmMmmMMMmmM',
            'MmmmmmmmmmMmmmmmmmmM',
            '.MmmmmmmmMMMmmmmmmM.',
            '..MMMMMMMMMMMMMMMM..',
          ],
        },
      ];
    case 'shades':
      return [{ x: 24, y: 7, mats: ['shade', 'shadeLens'], rows: ['mmmmmmmmmmmmmmmm', 'mMMmmmmmmmmMMmmm', '.mmmm......mmmm.'] }];
    case 'beret':
      return [
        {
          x: 17,
          y: 0,
          mats: ['beret'],
          rows: [
            '..........mm.........',
            '......lmmmmmmmmm.....',
            '...lllmmmmmmmmmmmm...',
            '.llmmmmmmmmmmmmmmmmm.',
            'lmmmmmmmmmmmmmmmmmmmd',
            'mmmmmmmmmmmmmmmmmmmdd',
            '.ddmmmmmmmmmmmmmdddd.',
            '....dddddddddddd.....',
          ],
        },
      ];
    case 'scarf':
      return [
        {
          x: 26,
          y: 35,
          mats: ['scarf'],
          rows: ['lmmmmmmmmmmm', 'lmmmmmmmmmmd', '.dmmmmmmmmd.', '.......lmd..', '.......lmd..', '.......lmmd.', '........dd..'],
        },
      ];
    case 'antenna':
      return [
        { x: 23, y: 0, mats: ['antenna'], rows: ['ll..', 'lm..', '.m..', '..m.', '..m.', '...m'] },
        { x: 37, y: 0, mats: ['antenna'], rows: ['..ll', '..ml', '..m.', '.m..', '.m..', 'm...'] },
      ];
    case 'glasses':
      return [
        {
          x: 21,
          y: 20,
          outline: false,
          mats: ['frame'],
          rows: [
            '.mmmmmmmm....mmmmmmmm.',
            'm........m..m........m',
            'm........mmmm........m',
            'm........m..m........m',
            'm........m..m........m',
            'm........m..m........m',
            'm........m..m........m',
            '.mmmmmmmm....mmmmmmmm.',
          ],
        },
      ];
    case 'bells':
      return [
        { x: 15, y: 22, mats: ['bell'], rows: ['.m.', 'mlm', 'mmm', '.d.'] },
        { x: 46, y: 22, mats: ['bell'], rows: ['.m.', 'mlm', 'mmm', '.d.'] },
      ];
  }
}

/** Headset for models that hear or speak. */
export const headphones: Layer[] = [
  {
    x: 15,
    y: 1,
    mats: ['phones'],
    rows: [
      '........llmmmmmmmmmmm.......',
      '.....llm.............mmm....',
      '...lm...................md..',
      '..l.......................d.',
      '.m.........................d',
      'm..........................d',
    ],
  },
  { x: 12, y: 12, mats: ['phones', 'phonesAccent'], rows: ['.mm.', 'mMMm', 'mMMm', 'mMMm', 'mMMm', 'mMMm', '.dd.'] },
  { x: 48, y: 12, mats: ['phones', 'phonesAccent'], rows: ['.mm.', 'mMMm', 'mMMm', 'mMMm', 'mMMm', 'mMMm', '.dd.'] },
];

/** Paintbrush in the right hand for models that draw. */
export const paintbrush: Layer[] = [
  {
    x: 41,
    y: 34,
    mats: ['brush', 'brushTip'],
    rows: ['.....MM', '....MMM', '....MM.', '...lm..', '...m...', '..lm...', '..m....', '.lm....', '.m.....', 'lm.....', 'm......'],
  },
];

/** A little key in the left hand for open-weights models. */
export const key: Layer[] = [
  {
    x: 18,
    y: 43,
    mats: ['key'],
    rows: ['.lmm.', 'lm.mm', 'mm.md', '.mmd.', '..m..', '..m..', '..mm.', '..m..', '..mm.'],
  },
];

/**
 * Vendor marks, drawn as hair ornaments. Each is small enough to pin on the
 * side of the head and simple enough to survive at 1×; they are pixel
 * paraphrases of the marks, not reproductions.
 */
export type LogoId =
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'gemma'
  | 'whale'
  | 'zai'
  | 'qwen'
  | 'kimi'
  | 'xai'
  | 'meta'
  | 'mistral'
  | 'nvidia'
  | 'cohere'
  | 'microsoft'
  | 'amazon'
  | 'hunyuan'
  | 'minimax'
  | 'xiaomi'
  | 'fish'
  | 'perplexity'
  | 'ibm'
  | 'stairs'
  | 'paw'
  | 'clip'
  | 'moon'
  | 'sun';

interface LogoArt {
  rows: string[];
  mats: string[];
  legend?: Record<string, Slot>;
  /** Sticker-style white edge instead of a dark outline. */
  whiteEdge?: boolean;
}

const LOGOS: Record<LogoId, LogoArt> = {
  openai: {
    mats: ['badge', 'logo'],
    rows: [
      '.mmmmmmmmm.',
      'mmmmMMMmmmm',
      'mmMMmMmMMmm',
      'mmMmMMMmMmm',
      'mMmMMmMMmMm',
      'mMMmMmMmMMm',
      'mMmMMmMMmMm',
      'mmMmMMMmMmm',
      'mmMMmMmMMmm',
      'mmmmMMMmmmm',
      '.mmmmmmmmm.',
    ],
  },
  claude: {
    mats: ['logo', 'badge'],
    rows: ['....m....', '.m..m..m.', '..m.m.m..', '...mmm...', 'mmmmMmmmm', '...mmm...', '..m.m.m..', '.m..m..m.', '....m....'],
  },
  // The current Gemini mark: a four-point star shaded red (top), blue (right),
  // green (bottom) and yellow (left), blending through the centre.
  gemini: {
    mats: [],
    whiteEdge: true,
    legend: {
      r: { rgba: hex('#ea4335') },
      o: { rgba: hex('#f5873a') },
      p: { rgba: hex('#b05fcf') },
      y: { rgba: hex('#fbbc04') },
      b: { rgba: hex('#4285f4') },
      c: { rgba: hex('#f7efe6') },
      l: { rgba: hex('#9dc63a') },
      g: { rgba: hex('#34a853') },
      t: { rgba: hex('#2d9fa5') },
    },
    rows: [
      '.....r.....',
      '.....r.....',
      '....rrr....',
      '....orp....',
      '..yyorpbb..',
      'yyyyycbbbbb',
      '..yylgtbb..',
      '....lgt....',
      '....ggg....',
      '.....g.....',
      '.....g.....',
    ],
  },
  gemma: {
    mats: ['logo'],
    rows: ['...m...', '..mlm..', '.mmlmm.', 'mmmhmmm', '.mmmmm.', '..mmm..', '...m...'],
  },
  whale: {
    mats: ['logo'],
    legend: { W: WHITE },
    rows: ['.m.........', 'mm...mmmm..', '.mmmmmmmmm.', '..mmmmmWmmm', '..llmmmmmmm', '...llllmmm.', '.....mmm...'],
  },
  zai: {
    mats: ['badge', 'logo'],
    rows: ['.mmmmm.', 'mMMMMMm', 'mmmmMMm', 'mmmMMmm', 'mmMMmmm', 'mMMMMMm', '.mmmmm.'],
  },
  qwen: {
    mats: ['badge', 'logo'],
    rows: ['..mmmmm..', '.mmMMMmm.', 'mmMmmmMmm', 'mMmmMmmMm', 'mMmMMMmMm', 'mMmmMmmMm', 'mmMmmmMmm', '.mmMMMmm.', '..mmmmm..'],
  },
  kimi: {
    mats: ['badge', 'logo', 'dot'],
    rows: ['.mmmmmmm.', 'mmmmmmm22', 'mMmmmMm22', 'mMmmMmmmm', 'mMMMmmmmm', 'mMmmMmmmm', 'mMmmmMmmm', 'mmmmmmmmm', '.mmmmmmm.'],
  },
  xai: {
    mats: ['badge', 'logo'],
    rows: ['.mmmmmmm.', 'mMmmmmmMm', 'mmMmmmMmm', 'mmmMmMmmm', 'mmmmMmmmm', 'mmmMmMmmm', 'mmMmmmMmm', 'mMmmmmmMm', '.mmmmmmm.'],
  },
  meta: {
    mats: ['logo'],
    rows: ['.mm...mm.', 'm..m.m..m', 'm...m...m', 'm..m.m..m', '.mm...mm.'],
  },
  mistral: {
    mats: ['logo'],
    rows: ['mm...mm', 'mmm.mmm', 'mmmmmmm', 'mm.m.mm', 'mm...mm'],
  },
  nvidia: {
    mats: ['logo'],
    rows: ['..mmmmm..', '.mm...mm.', 'mm..m..mm', 'm..mmm..m', 'mm..m..mm', '.mm...mm.', '..mmmmm..'],
  },
  cohere: {
    mats: ['logo', 'logo2', 'logo3'],
    rows: ['.mmm.', 'mmmMM', '.22MM', '222M.', '.2...'],
  },
  microsoft: {
    mats: [],
    legend: { r: { rgba: hex('#f25022') }, g: { rgba: hex('#7fba00') }, b: { rgba: hex('#00a4ef') }, y: { rgba: hex('#ffb900') } },
    rows: ['rrr.ggg', 'rrr.ggg', 'rrr.ggg', '.......', 'bbb.yyy', 'bbb.yyy', 'bbb.yyy'],
  },
  amazon: {
    mats: ['logo'],
    rows: ['m.......m.', '.m.....mmm', '..mmmmm..m'],
  },
  hunyuan: {
    mats: ['logo', 'badge'],
    rows: ['..mmmmm..', '.mmmmMMM.', 'mmmmMMMMM', 'mmmmMMmMM', 'mmmMMMMMm', 'mmMmMMMMm', 'mmmmmMMmm', '.mmmmmmm.', '..mmmmm..'],
  },
  minimax: {
    mats: ['logo'],
    rows: ['..m....', '..m.m..', 'm.m.m.m', 'm.m.m.m', 'm.m.m.m', '..m.m..', '..m....'],
  },
  xiaomi: {
    mats: ['logo', 'badge'],
    rows: ['.mmmmmmm.', 'mmmmmmmmm', 'mMMMMmMmm', 'mMmmMmMmm', 'mMmmMmMmm', 'mMmmMmMmm', 'mmmmmmmmm', '.mmmmmmm.'],
  },
  fish: {
    mats: ['logo'],
    legend: { W: WHITE },
    rows: ['.mmmm..m.', 'mWmmmmmm.', 'mmmmmmmm.', '.mmmm..m.'],
  },
  perplexity: {
    mats: ['logo'],
    rows: ['m..m..m', '.m.m.m.', '..mmm..', 'mmmmmmm', '..mmm..', '.m.m.m.', 'm..m..m'],
  },
  ibm: {
    mats: ['logo'],
    rows: ['mmmmmmmm', '........', 'mmmmmmmm', '........', 'mmmmmmmm'],
  },
  stairs: {
    mats: ['logo'],
    rows: ['.....mm', '.....mm', '...mmmm', '...mmmm', '.mmmmmm', 'mmmmmmm'],
  },
  paw: {
    mats: ['logo'],
    rows: ['.m...m.', 'm.m.m.m', '..mmm..', '.mmmmm.', '.mmmmm.', '..mmm..'],
  },
  clip: {
    mats: ['logo'],
    rows: ['lmmmmd', 'mmmmmd'],
  },
  moon: {
    mats: ['logo'],
    rows: ['..mmm.', '.mm...', 'mm....', 'mm....', 'mm....', '.mm...', '..mmm.'],
  },
  sun: {
    mats: ['logo'],
    rows: ['m..m..m', '.mmmmm.', '.mlmmm.', 'mmmmmmm', '.mmmmm.', '.mmmmm.', 'm..m..m'],
  },
};

export type OrnamentSide = 'left' | 'right';

/** Pinned on the upper side of the head, overlapping the fringe edge like a hair clip. */
export function ornament(id: LogoId, side: OrnamentSide): Layer {
  const art = LOGOS[id];
  const w = Math.max(...art.rows.map((r) => r.length));
  const h = art.rows.length;
  const cx = side === 'left' ? 20 : 43;
  return {
    x: Math.round(cx - w / 2),
    y: Math.round(11 - h / 2),
    rows: art.rows,
    mats: art.mats,
    legend: art.legend,
    outlineColor: art.whiteEdge ? hex('#ffffff') : undefined,
  };
}

/** A round badge carrying one letter, for vendors without a dedicated mark. */
export function letterBadge(side: OrnamentSide, glyph: string): Layer {
  const rows = ['.mmmmm.', 'mmmmmmm', ...glyph.split('|').map((g) => `mm${g.replace(/#/g, 'M').replace(/\./g, 'm')}mm`), 'mmmmmmm', '.mmmmm.'];
  return { x: side === 'left' ? 16 : 41, y: 6, rows, mats: ['badge', 'logo'] };
}
