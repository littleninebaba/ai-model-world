'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AbilityBars } from '@/components/character/AbilityBars';
import { VendorCrest } from '@/components/character/VendorCrest';
import { useUrlQuery } from '@/components/leaderboard/useUrlQuery';
import { APTITUDES, type AptitudeRow } from '@/lib/aptitude';
import { getDict, DEFAULT_LANG } from '@/lib/i18n';
import type { Modality } from '@/lib/types';
import {
  cutoffMonth,
  cutoffText,
  headToHead,
  highlightsFor,
  isContested,
  presetsOf,
  specWinners,
  tally,
  type H2HRow,
  type SpecBetter,
  type Tally,
} from './insights';
import { ModelPicker } from './ModelPicker';
import { MAX_PICK, writePicked } from './storage';
import type { CmpModel, CompareData } from './types';

/**
 * 模型对比页的交互层。
 *
 * 选中的模型全部记在地址栏 `?m=a,b` 里，复制链接就是分享这一场对阵；
 * 同时存一份到 localStorage，详情页的「加入对比」按钮靠它把新模型接在已选的后面。
 *
 * 版面按「一张截图讲清楚」来排：对阵卡与比分 → 各自长处 → 能力条 → 跑分 → 规格。
 * 越往下越细，截到哪里都成立。刚发布、还没有共同跑分的两个模型，规格反而是主要差别，
 * 这时规格排到跑分前面。
 */

const dict = getDict(DEFAULT_LANG);

const MOD_ZH: Record<Modality, string> = { text: '文字', image: '图片', audio: '声音', video: '视频', pdf: '文件' };

/** 同一套跑分至少要交手这么多项，才默认只看共同项、并把跑分排在规格前面 */
const MIN_CONTESTED = 3;

function usd(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return '免费';
  return `$${n < 0.1 ? n.toFixed(3) : n < 10 ? +n.toFixed(2) : Math.round(n)}`;
}

function tokens(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function yesNo(v: boolean | null): string | null {
  return v == null ? null : v ? '支持' : '不支持';
}

function aptRow(m: CmpModel): AptitudeRow {
  return {
    values: Object.fromEntries(
      APTITUDES.map(({ id }) => {
        const [fill, literal, self, labelOverride] = m.apt[id];
        return [id, { id, fill, literal, verdict: null, selfReported: self === 1, labelOverride, title: '' }];
      }),
    ) as AptitudeRow['values'],
    known: 0,
    codingScore: null,
  };
}

// ─── 规格行 ──────────────────────────────────────────────────────

interface SpecDef {
  label: string;
  text: (m: CmpModel) => string | null;
  value?: (m: CmpModel) => number | null;
  better?: SpecBetter;
  /** 各家一样时也照常占一行。发布日期即使同一天也是读者要找的信息 */
  keep?: boolean;
}

const SPECS: SpecDef[] = [
  { label: '发布日期', text: (m) => m.dateText, keep: true },
  { label: '类型', text: (m) => (m.kind ? `${dict.kind.label[m.kind]}模型` : null) },
  { label: '上下文窗口', text: (m) => tokens(m.ctx), value: (m) => m.ctx, better: 'high' },
  { label: '单次最多输出', text: (m) => tokens(m.maxOut), value: (m) => m.maxOut, better: 'high' },
  { label: '输入价 / 百万 tokens', text: (m) => usd(m.priceIn), value: (m) => m.priceIn, better: 'low' },
  { label: '输出价 / 百万 tokens', text: (m) => usd(m.priceOut), value: (m) => m.priceOut, better: 'low' },
  { label: '缓存命中价', text: (m) => usd(m.priceCached), value: (m) => m.priceCached, better: 'low' },
  { label: '知识截止', text: (m) => cutoffText(m.cutoff), value: (m) => cutoffMonth(m.cutoff), better: 'high' },
  { label: '能读', text: (m) => (m.inputs.length ? m.inputs.map((x) => MOD_ZH[x]).join('、') : null) },
  { label: '能生成', text: (m) => (m.outputs.length ? m.outputs.map((x) => MOD_ZH[x]).join('、') : null) },
  { label: '深度思考', text: (m) => yesNo(m.reasoning) },
  { label: '工具调用', text: (m) => yesNo(m.tool) },
  { label: '开源权重', text: (m) => (m.open == null ? null : m.open ? '开源' : '闭源') },
  { label: '参数量', text: (m) => m.params ?? '未公布' },
];

// ─── 小部件 ──────────────────────────────────────────────────────

function Sprite({ m, base, accent }: { m: CmpModel; base: string; accent: string }) {
  const box = 96;
  const cell = Math.round(box * m.scale);
  return (
    <div className="relative flex items-end justify-center" style={{ width: box, height: box }} aria-hidden>
      <div
        className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{ width: cell * 0.42, height: 7, background: 'rgb(0 0 0 / 0.32)', filter: 'blur(1px)' }}
      />
      {m.sprite ? (
        <div
          className="relative"
          style={{
            width: cell,
            height: cell,
            backgroundImage: `url(${base}${m.slug}.png)`,
            backgroundSize: `${cell * 9}px auto`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            opacity: m.retired ? 0.5 : 1,
          }}
        />
      ) : (
        <div className="relative mb-1" style={{ width: cell * 0.36, height: cell * 0.78, background: accent }} />
      )}
    </div>
  );
}

/** 每一行共用的网格：左边一列标签，右边每个模型一列。窄屏上标签独占一行 */
function Grid({ n, children, className = '' }: { n: number; children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-x-3 sm:grid-cols-[minmax(120px,200px)_repeat(var(--n),minmax(0,1fr))] sm:gap-x-5 ${className}`}
      style={{ '--n': n } as CSSProperties}
    >
      {children}
    </div>
  );
}

function RowLabel({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      title={title}
      className="col-span-full pt-2 text-[13px] leading-snug text-[var(--color-ghost)] sm:col-span-1 sm:py-2"
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1 mt-8 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-white/15 pb-1.5">
      <h2 className="text-[15px] font-medium text-[var(--color-parchment)]">{children}</h2>
      {aside}
    </div>
  );
}

/** 左上角的总比分。两人对阵是「20 : 5」，三四个人时列在各自卡片底部 */
function Scoreboard({ n, score, accents }: { n: number; score: Tally; accents: string[] }) {
  if (n < 2) return <div className="text-[13px] text-[var(--color-ghost)]">再添加一个模型开始对比</div>;
  if (score.contested === 0) {
    return <div className="text-[13px] leading-relaxed text-[var(--color-ghost)]">还没有共同参加的评测</div>;
  }
  if (n > 2) return <div className="text-[13px] text-[var(--color-ghost)]">跑分交手 {score.contested} 项</div>;
  return (
    <div className="text-center sm:text-left">
      <div className="text-[13px] text-[var(--color-ghost)]">跑分交手 {score.contested} 项</div>
      <div className="font-pixel mt-1 text-4xl leading-none tabular-nums">
        <span style={{ color: accents[0] }}>{score.wins[0]}</span>
        <span className="mx-2 text-white/40">:</span>
        <span style={{ color: accents[1] }}>{score.wins[1]}</span>
      </div>
      {score.ties > 0 && <div className="mt-1 text-[12px] text-[var(--color-ghost)]">打平 {score.ties} 项</div>}
    </div>
  );
}

function SpecsBlock({ picked }: { picked: CmpModel[] }) {
  const n = picked.length;
  const same: [string, string][] = [];
  const rows = SPECS.flatMap((spec) => {
    const texts = picked.map(spec.text);
    if (!spec.keep && n >= 2 && texts.every((t) => t === texts[0])) {
      same.push([spec.label.replace(' / 百万 tokens', ''), texts[0] ?? '暂无']);
      return [];
    }
    const winners = spec.value ? specWinners(picked.map(spec.value), spec.better ?? null) : [];
    return [
      <Grid key={spec.label} n={n} className="border-b border-white/[0.07]">
        <RowLabel>{spec.label}</RowLabel>
        {picked.map((m, i) => {
          const text = texts[i];
          return (
            <div
              key={m.slug}
              className={`py-2 text-[14px] tabular-nums ${
                text == null
                  ? 'text-white/30'
                  : winners.includes(i)
                    ? 'font-medium text-[var(--color-gold)]'
                    : 'text-[var(--color-parchment)]'
              }`}
            >
              {text ?? '暂无'}
            </div>
          );
        })}
      </Grid>,
    ];
  });

  return (
    <>
      <SectionTitle>基本信息</SectionTitle>
      {rows}
      {same.length > 0 && (
        <Grid n={n}>
          <RowLabel>{n === 2 ? '两者一样' : '都一样'}</RowLabel>
          <p
            className="flex flex-wrap gap-x-5 gap-y-1 py-2 text-[13px] leading-relaxed"
            style={{ gridColumn: 'span var(--n) / span var(--n)' }}
          >
            {same.map(([label, value]) => (
              <span key={label} className="whitespace-nowrap">
                <span className="text-[var(--color-ghost)]">{label}</span>
                <span className="ml-1.5 text-[var(--color-parchment)]">{value}</span>
              </span>
            ))}
          </p>
        </Grid>
      )}
    </>
  );
}

function ScoresBlock({
  rows,
  picked,
  accents,
  scope,
  setScope,
}: {
  rows: H2HRow[];
  picked: CmpModel[];
  accents: string[];
  scope: 'auto' | 'common' | 'all';
  setScope: (s: 'common' | 'all') => void;
}) {
  const n = picked.length;
  const common = rows.filter(isContested);
  const effective = scope === 'auto' ? (common.length >= MIN_CONTESTED ? 'common' : 'all') : scope;
  const shown = n >= 2 && effective === 'common' ? common : rows;

  const byCategory = new Map<string, H2HRow[]>();
  for (const r of shown) {
    const list = byCategory.get(r.bench.category) ?? [];
    list.push(r);
    byCategory.set(r.bench.category, list);
  }

  return (
    <>
      <SectionTitle
        aside={
          n >= 2 && common.length > 0 && common.length < rows.length ? (
            <div className="flex gap-1.5 text-[13px]" role="group" aria-label="显示范围">
              {(
                [
                  ['common', `共同参加 ${common.length}`],
                  ['all', `全部 ${rows.length}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={effective === key}
                  onClick={() => setScope(key)}
                  className={`border-2 px-2 py-0.5 ${
                    effective === key
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-white/20 text-[var(--color-ghost)] hover:text-[var(--color-parchment)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null
        }
      >
        评测跑分
      </SectionTitle>

      {rows.length === 0 && (
        <p className="py-4 text-[14px] text-[var(--color-ghost)]">
          {n === 1 ? '这个模型' : '这几个模型'}还没有公开的第三方评测成绩，新模型一般要一到两周才会被测到。
        </p>
      )}

      {[...byCategory.entries()].map(([category, list]) => (
        <div key={category}>
          <div className="mt-3 text-[13px] font-medium text-[var(--color-gold)]">{category}</div>
          {list.map((row) => (
            <Grid key={row.bench.key} n={n} className="border-b border-white/[0.07]">
              <RowLabel title={row.bench.blurb}>
                {row.bench.track ? (
                  <Link
                    href={`/leaderboard/?track=${encodeURIComponent(row.bench.track)}`}
                    className="text-[var(--color-parchment-dim)] hover:text-[var(--color-gold)]"
                  >
                    {row.bench.label}
                  </Link>
                ) : (
                  <span className="text-[var(--color-parchment-dim)]">{row.bench.label}</span>
                )}
                {!row.bench.higherIsBetter && <span className="ml-1 text-[11px]">越低越好</span>}
                {row.bench.superseded && <span className="ml-1 text-[11px]">旧版</span>}
              </RowLabel>
              {row.cells.map((c, i) => {
                const win = row.winners.includes(i);
                return (
                  <div key={picked[i].slug} className="flex items-center gap-2 py-1.5 sm:py-2">
                    {c ? (
                      <>
                        <span
                          className={`w-[4.5rem] shrink-0 text-[14px] tabular-nums sm:w-24 ${
                            win ? 'font-medium text-[var(--color-gold)]' : 'text-[var(--color-parchment)]'
                          }`}
                        >
                          {c.text}
                          {row.bench.selfReported && <span className="ml-1 text-[11px] text-white/40">自报</span>}
                        </span>
                        <div className="h-2 min-w-0 flex-1 bg-white/[0.06]">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.max(2, c.frac * 100)}%`,
                              background: accents[i],
                              opacity: win || row.present < 2 ? 1 : 0.45,
                            }}
                          />
                        </div>
                        {/* 榜上不足 3 个模型时「#1/1」没有信息量，官方自报的新榜常常只有它自己 */}
                        <span
                          className="hidden w-14 shrink-0 text-right text-[11px] tabular-nums text-white/35 sm:inline"
                          title={`在这个榜的 ${row.bench.n} 个模型里排第 ${c.rank}`}
                        >
                          {row.bench.n >= 3 ? `#${c.rank}/${row.bench.n}` : ''}
                        </span>
                      </>
                    ) : (
                      // 自报的榜是厂商自己挑着公布的，另一方没有数字是「没公布」，不是「没参加」
                      <span className="text-[13px] text-white/30">{row.bench.selfReported ? '未公布' : '未参赛'}</span>
                    )}
                  </div>
                );
              })}
            </Grid>
          ))}
        </div>
      ))}
    </>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────

export function CompareView({ dataUrl, spriteBase }: { dataUrl: string; spriteBase: string }) {
  const [params, update] = useUrlQuery();
  const [data, setData] = useState<CompareData | null>(null);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState<'auto' | 'common' | 'all'>('auto');

  useEffect(() => {
    let alive = true;
    fetch(dataUrl)
      .then((r) => (r.ok ? (r.json() as Promise<CompareData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dataUrl]);

  const slugs = useMemo(() => {
    const raw = (params?.get('m') ?? '').split(',').filter(Boolean);
    return [...new Set(raw)].slice(0, MAX_PICK);
  }, [params]);

  const bySlug = useMemo(() => new Map((data?.models ?? []).map((m) => [m.slug, m])), [data]);
  const picked = useMemo(
    () => slugs.map((s) => bySlug.get(s)).filter((m): m is CmpModel => m != null),
    [slugs, bySlug],
  );

  const setSlugs = (next: string[]) => {
    update({ m: next.length ? next.join(',') : null });
    writePicked(next);
  };

  // 厂商色撞车（两个 Anthropic 模型）时换成固定色板，否则两列的条分不清谁是谁
  const accents = useMemo(() => {
    if (!data) return [];
    const own = picked.map((m) => data.vendors[m.vendor]?.accent ?? '#9fb3c8');
    const PALETTE = ['#7fd4ff', '#ffb27f', '#9ae6a0', '#e0a3ff'];
    return new Set(own).size < own.length ? picked.map((_, i) => PALETTE[i]) : own;
  }, [data, picked]);

  const rows = useMemo(() => (data ? headToHead(data, picked) : []), [data, picked]);
  const score = useMemo(() => tally(rows, picked.length), [rows, picked.length]);

  if (failed) {
    return (
      <div className="pixel-panel-dark mt-6 p-6 text-[14px] text-[var(--color-parchment)]">
        对比数据没有加载成功，刷新一下试试。
      </div>
    );
  }

  if (!data || !params) {
    return <div className="py-16 text-center text-[14px] text-[var(--color-ghost)]">正在载入模型数据…</div>;
  }

  const n = picked.length;
  const duel = n === 2;
  // 跑分是对比页的主角：有足够多的共同项、或者跑分行本身就不少时都排在规格前面
  const scoresFirst = score.contested >= MIN_CONTESTED || rows.length >= 6;
  const specs = <SpecsBlock picked={picked} />;
  const scores = <ScoresBlock rows={rows} picked={picked} accents={accents} scope={scope} setScope={setScope} />;

  return (
    <div className="mx-auto" style={{ maxWidth: n > 0 ? 200 + n * 380 : undefined }}>
      <div className="mb-5 mt-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="pixel-outline text-2xl sm:text-3xl">模型对比</h1>
        <ModelPicker data={data} picked={slugs} onPick={(s) => setSlugs([...slugs, s])} disabled={n >= MAX_PICK} />
      </div>

      {n === 0 && (
        <div className="pixel-panel-dark p-6">
          <p className="mb-4 text-[14px] text-[var(--color-parchment)]">在右上角挑两个模型，或者从这几场开始：</p>
          <div className="flex flex-wrap gap-3">
            {presetsOf(data).map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setSlugs(p.slugs)}
                className="pixel-button px-3 py-2 text-left text-[13px] text-[var(--color-ink)]"
              >
                <span className="block font-medium">{p.label}</span>
                <span className="block text-[12px] opacity-75">
                  {p.slugs.map((s) => bySlug.get(s)?.name).join(' 对 ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {n > 0 && (
        <>
          <Grid n={n}>
            <div className="col-span-full mb-3 flex flex-col justify-center sm:col-span-1 sm:mb-0">
              <Scoreboard n={n} score={score} accents={accents} />
            </div>

            {picked.map((m, i) => {
              const v = data.vendors[m.vendor];
              return (
                <div
                  key={m.slug}
                  className="pixel-panel-dark relative flex flex-col items-center px-3 pb-4 pt-3 text-center"
                  style={{ borderTop: `4px solid ${accents[i]}` }}
                >
                  <button
                    type="button"
                    onClick={() => setSlugs(slugs.filter((s) => s !== m.slug))}
                    aria-label={`移除 ${m.name}`}
                    title="移除"
                    className="absolute right-1.5 top-1 px-1.5 text-[16px] leading-none text-white/40 hover:text-[var(--color-gold)]"
                  >
                    ×
                  </button>
                  <Sprite m={m} base={spriteBase} accent={accents[i]} />
                  <Link
                    href={`/model/${m.slug}/`}
                    className="pixel-outline mt-1 text-[17px] leading-snug hover:text-[var(--color-gold)] sm:text-[20px]"
                  >
                    {m.name}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px]">
                    {v && (
                      <span className="flex items-center gap-1" style={{ color: v.accent }}>
                        <VendorCrest motif={v.motif} accentColor={v.accent} size={14} />
                        {v.name}
                      </span>
                    )}
                    {v && (
                      <span style={{ color: v.continent === 'west' ? 'var(--color-west)' : 'var(--color-east)' }}>
                        {dict.continent[v.continent]}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--color-gold)]">
                    {m.eciRank != null ? `综合智力第 ${m.eciRank} 名` : '综合智力暂无排名'}
                    {m.retired && <span className="ml-2 text-[var(--color-ghost)]">已退役</span>}
                  </div>
                  <p className="mt-2 text-[13px] leading-snug text-[var(--color-parchment-dim)]">{m.persona}</p>
                  {n >= 2 && score.contested > 0 && (
                    <div className="mt-3 text-[14px] text-[var(--color-parchment)]">
                      {duel ? '胜' : '第一'}{' '}
                      <span className="font-pixel text-[20px] tabular-nums" style={{ color: accents[i] }}>
                        {score.wins[i]}
                      </span>{' '}
                      项
                    </div>
                  )}
                </div>
              );
            })}
          </Grid>

          {n >= 2 && (
            <Grid n={n} className="mt-4">
              <RowLabel>各自亮点</RowLabel>
              {picked.map((m, i) => {
                const hs = highlightsFor(rows, picked, i);
                return (
                  <ul key={m.slug} className="flex flex-col gap-1.5 py-2">
                    {hs.length === 0 && <li className="text-[13px] text-white/30">暂无明显亮点</li>}
                    {hs.map((h) => (
                      <li key={h.text} className="flex gap-1.5 text-[13px] leading-snug text-[var(--color-parchment)]">
                        <span aria-hidden className="shrink-0" style={{ color: accents[i] }}>
                          {h.kind === 'bench' ? '▲' : '■'}
                        </span>
                        <span>{h.text}</span>
                      </li>
                    ))}
                  </ul>
                );
              })}
            </Grid>
          )}

          <Grid n={n} className="mt-2">
            <RowLabel title="在全部模型里的分位：聪明取综合智力，编程取最可信的一项编程评测，记性是上下文窗口，便宜是输出价">
              能力分位
            </RowLabel>
            {picked.map((m) => (
              <div key={m.slug} className="py-2">
                <div className="sm:hidden">
                  <AbilityBars row={aptRow(m)} compact />
                </div>
                <div className="hidden max-w-72 sm:block">
                  <AbilityBars row={aptRow(m)} />
                </div>
              </div>
            ))}
          </Grid>

          {scoresFirst ? (
            <>
              {scores}
              {specs}
            </>
          ) : (
            <>
              {specs}
              {scores}
            </>
          )}

          <p className="mt-8 text-[12px] leading-relaxed text-[var(--color-ghost)]">
            数据截至 {data.generatedAt.slice(0, 10)}。跑分来自 Epoch AI、LiveBench、LMArena 官方数据集等第三方公开评测，
            标「自报」的是厂商在官网发布文里公布的成绩，未经第三方复核。只在同一榜单、同一测量方之间比较；
            「#3/25」是在该榜全部模型里的名次。
          </p>
        </>
      )}
    </div>
  );
}
