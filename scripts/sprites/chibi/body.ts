/**
 * The shared chibi body: head, face, neck, arms, legs, shoes, and the outfits
 * worn over them. Every character in the world stands on this one frame, which
 * is what makes the cast read as a set rather than 60 unrelated drawings.
 *
 * Proportions are "desk pet": a big round head over a short, soft body, so the
 * face carries the character at the small sizes the site shows them at.
 *
 * Cell geometry (64 × 64, feet on y = 56, outline on 57):
 *   head skin  x20–43  y11–35       eyes  y21–27, left x23–28, right x35–40
 *   neck       x30–33  y35–37       torso x22–41  y37–49
 *   legs       x27–29 / x34–36  y50–53      shoes y54–56
 */

import { hex } from './color.ts';
import type { Layer, Slot } from './grid.ts';

export type EyeState = 'open' | 'closed';
export type OutfitStyle = 'frill' | 'sailor' | 'shirt' | 'jacket' | 'maid' | 'gothic' | 'hanfu' | 'coat' | 'hoodie';
export type SleeveStyle = 'long' | 'puff';

export const legs = (shoeStyle: 'shoe' | 'boot' = 'shoe'): Layer[] => [
  { x: 27, y: 50, mats: ['legs'], rows: Array(4).fill('lmd....lmd') },
  shoeStyle === 'boot'
    ? { x: 26, y: 51, mats: ['shoe'], rows: ['.lmm....lmm.', '.lmm....lmm.', '.mmm....mmm.', 'lmmmm..lmmmm', 'mmmmm..mmmmm', '.ddd....ddd.'] }
    : { x: 26, y: 54, mats: ['shoe'], rows: ['.lmm....lmm.', 'lmmmm..lmmmm', '.ddd....ddd.'] },
];

export const neck: Layer = { x: 30, y: 35, mats: ['skin'], rows: ['dddd', 'mmmm', 'mmmm'] };

export const head: Layer = {
  x: 20,
  y: 11,
  mats: ['skin'],
  rows: [
    '......mmmmmmmmmmmm......',
    '....mmmmmmmmmmmmmmmm....',
    '..mmmmmmmmmmmmmmmmmmmm..',
    '.mmmmmmmmmmmmmmmmmmmmmm.',
    ...Array(16).fill('mmmmmmmmmmmmmmmmmmmmmmmm'),
    '.mmmmmmmmmmmmmmmmmmmmmm.',
    '.mmmmmmmmmmmmmmmmmmmmmm.',
    '..mmmmmmmmmmmmmmmmmmmm..',
    '....mmmmmmmmmmmmmmmm....',
    '.......mmmmmmmmmm.......',
  ],
};

const faceLegend: Record<string, Slot> = {
  k: { rgba: hex('#2b1a2c') },
  a: { mat: 'eye', shade: 0 },
  b: { mat: 'eye', shade: 2 },
  c: { mat: 'eye', shade: 3 },
  h: { rgba: hex('#ffffff') },
  w: { rgba: hex('#ffffff', 230) },
  p: { rgba: hex('#ff6f8a', 120) },
  r: { rgba: hex('#7a2e38') },
  t: { rgba: hex('#ff8a98') },
};

/**
 * Big round eyes with two catchlights, blush, and an open smile. Closed eyes
 * (text-only models) are a soft "︶" with the lash flick kept, which still
 * reads as content rather than asleep next to the smile.
 */
export function face(eyes: EyeState): Layer {
  const L = eyes === 'open'
    ? ['.kkkk.', 'kkaaak', 'kahhak', 'kahhbk', 'kbbbbk', 'kbbcwk', '.aaaa.']
    : ['......', '......', '......', 'k....k', '.kkkk.', '......', '......'];
  const R = eyes === 'open'
    ? ['.kkkk.', 'kaaakk', 'kahhak', 'kahhbk', 'kbbbbk', 'kbbcwk', '.aaaa.']
    : ['......', '......', '......', 'k....k', '.kkkk.', '......', '......'];
  const wing = eyes === 'open' ? ['.', 'k', '.', '.', '.', '.', '.'] : ['.', '.', '.', 'k', '.', '.', '.'];
  const eyeRows = L.map((l, i) => `.${wing[i]}${l}......${R[i]}${wing[i]}.`);
  return {
    x: 21,
    y: 21,
    outline: false,
    legend: faceLegend,
    rows: [
      ...eyeRows,
      '......................',
      '.ppp..............ppp.',
      'pppp..............pppp',
      '.........rttr.........',
      '..........rr..........',
    ],
  };
}

/** Short, soft arms with mitten hands, drawn over the torso. */
export function arms(style: SleeveStyle, mat: string): Layer {
  const top = [
    '...MM..............MM...',
    '..LMMM............MMMD..',
    '.LMMMM............MMMMD.',
    '.LMMM..............MMMD.',
  ];
  const lower =
    style === 'long'
      ? ['.LMM................MMD.', '.DDD................DDD.']
      : ['.lmm................mmd.', '.lmm................mmd.'];
  return {
    x: 20,
    y: 37,
    mats: ['skin', mat],
    rows: [...top, ...lower, '.lmm................mmd.', '.mmm................mmm.', '..d..................d..'],
  };
}

const SKIRT_BODY = [
  '.....mmmmmmmmmmmm.....',
  '....lmmmmmmmmmmmmd....',
  '...lmmdmmmmmmmmdmmd...',
  '..llmmdmmmmmmmmdmmdd..',
  '..lmmmdmmmmmmmmdmmmd..',
  '.lmmmmdmmmmmmmmdmmmmd.',
];

function skirt(hem: string): Layer {
  return { x: 21, y: 43, mats: ['skirt', 'blouse', 'accent'], rows: [...SKIRT_BODY, hem] };
}

const pleats: Layer = {
  x: 21,
  y: 43,
  mats: ['skirt', 'blouse', 'accent'],
  rows: [
    '.....mmmmmmmmmmmm.....',
    '....lmdmmdmmdmmdmd....',
    '...lmdmmdmmdmmdmmdd...',
    '..lmmdmmdmmdmmdmmdmd..',
    '..lmdmmdmmmdmmdmmdmd..',
    '.lmmdmmdmmmdmmdmmdmmd.',
    '.dddddddddddddddddddd.',
  ],
};

const trousers: Layer = {
  x: 25,
  y: 43,
  mats: ['skirt'],
  rows: ['mmmmmmmmmmmmmm', 'lmmmmmmmmmmmmd', 'lmmmmmddmmmmmd', '.lmmmd..lmmmd.', ...Array(6).fill('.lmmmd..lmmmd.'), '.ddddd..ddddd.'],
};

/** Bodice rows are 7 tall (y37–43), 20 wide (x22–41). */
function bodice(rows: string[], mats = ['cloth', 'blouse', 'accent']): Layer {
  return { x: 22, y: 37, mats, rows };
}

/**
 * Torso + skirt. Slots: main = `cloth`, second = `blouse`, third = `accent`.
 * Skirts use the `skirt` material so a design can give it its own colour or a
 * gradient (Gemini's rainbow hem) without touching the bodice.
 */
export function outfit(style: OutfitStyle): Layer[] {
  switch (style) {
    case 'frill':
      return [
        skirt('.MMMMMMMMMMMMMMMMMMMM.'),
        bodice([
          '.....MMMM22MMMM.....',
          '....MMMM2222MMMM....',
          '....MMMMM22MMMMM....',
          '....lmmmmmmmmmmd....',
          '....lmmmmmmmmmmd....',
          '.....lmmmmmmmmd.....',
          '.....lmmmmmmmmd.....',
        ]),
      ];
    case 'sailor':
      return [
        pleats,
        bodice(
          [
            '.....MMMMMMMMMM.....',
            '....MMMLM22MLMMM....',
            '....LMMML22LMMML....',
            '....lmmmL22Lmmmd....',
            '....lmmmm22mmmmd....',
            '.....lmmmmmmmmd.....',
            '.....lmmmmmmmmd.....',
          ],
          ['blouse', 'cloth', 'accent'],
        ),
      ];
    case 'shirt':
      return [
        trousers,
        bodice([
          '.....mmmmddmmmm.....',
          '....lmmmmddmmmmd....',
          '....lmmmmmmm22md....',
          '....lmmmmmmm22md....',
          '....lmmmmmmmmmmd....',
          '.....lmmmmmmmmd.....',
          '.....dddddddddd.....',
        ]),
      ];
    case 'jacket':
      return [
        pleats,
        bodice([
          '.....mmmMMMMmmm.....',
          '....lmmmM22MmmmD....',
          '....lmmmM22Mmmmd....',
          '....lmmdMMMMdmmd....',
          '....lmmdMMMMdmmd....',
          '.....lmdMMMMdmd.....',
          '.....lmdMMMMdmd.....',
        ]),
      ];
    case 'maid':
      return [
        skirt('.MMMMMMMMMMMMMMMMMMMM.'),
        { x: 27, y: 43, mats: ['blouse'], rows: ['lmmmmmmmmd', 'lmmmmmmmmd', 'lmmmmmmmmd', 'lmmmmmmmmd', 'lmmmmmmmmd', 'dddddddddd'] },
        bodice([
          '.....MMMM22MMMM.....',
          '....MMMM2222MMMM....',
          '....lmmmm22mmmmd....',
          '....lmmMMMMMMmmd....',
          '....lmmMMMMMMmmd....',
          '.....lmMMMMMMmd.....',
          '.....lmMMMMMMmd.....',
        ]),
      ];
    case 'gothic':
      return [
        skirt('.MMMMMMMMMMMMMMMMMMMM.'),
        bodice([
          '.....MMMM22MMMM.....',
          '....MMMMM22MMMMM....',
          '....lmmmM22Mmmmd....',
          '....lm2mmMMmm2md....',
          '....lmm2mmmm2mmd....',
          '.....lmm2mm2mmd.....',
          '.....lmmm22mmmd.....',
        ]),
      ];
    case 'hanfu':
      return [
        skirt('.22222222222222222222.'),
        bodice([
          '.....MMMMMMMMmmm....',
          '....lMmmMMMMMmmd....',
          '....lmmmmMMMmmmd....',
          '....lmmmmmMMmmmd....',
          '....222222222222....',
          '.....3333333333.....',
          '.....lmmmmmmmmd.....',
        ]),
      ];
    case 'coat':
      return [
        skirt('.lmmmmmmmmmmmmmmmmmmd.'),
        { x: 29, y: 43, mats: ['cloth'], outline: false, rows: Array(6).fill('mmmmmm') },
        bodice(
          [
            '.....mmmMMMMmmm.....',
            '....lmmmM22Mmmmd....',
            '....lmmmM22Mmmmd....',
            '....lmmmMMMMmmmd....',
            '....lmmmMMMMmmmd....',
            '.....lmmMMMMmmd.....',
            '.....lmmMMMMmmd.....',
          ],
          ['blouse', 'cloth', 'accent'],
        ),
      ];
    case 'hoodie':
      return [
        pleats,
        {
          x: 22,
          y: 36,
          mats: ['cloth', 'blouse', 'accent'],
          rows: [
            '....ddmmmmmmmmdd....',
            '....lmmmmmmmmmmd....',
            '....lmmmmMmMmmmd....',
            '....lmmmmMmMmmmd....',
            '....lmmddddddmmd....',
            '....lmmdmmmmdmmd....',
            '.....lmddddddmd.....',
            '.....lmmmmmmmmd.....',
          ],
        },
      ];
  }
}
