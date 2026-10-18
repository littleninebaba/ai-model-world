import type { Attribution, ScoreUnit } from '@/lib/types';

/**
 * **人类常识层之四：发布当天的官方成绩。**
 *
 * 为什么要有这张表：第三方评测有滞后，新旗舰发布后通常要几天到两周才出现在 Epoch 里，
 * 而读者恰恰在发布当天最想知道「新模型比对手强在哪」。这段空窗期里唯一可查的数字，
 * 是厂商自己在发布文里公布的成绩。
 *
 * 录入纪律，改这张表之前必须读完：
 *
 * 1. **只收原文里用文字写明的数字。** 不从柱状图、散点图里目测读数，不收第三方聚合站的转述。
 *    每一条都要能在 `url` 指向的页面上用 Ctrl+F 搜到。
 * 2. **厂商自己测的一律 `vendor-self-reported`**，页面上会缀「自报」。由独立机构跑的
 *    （比如 Zapier 运营的 AutomationBench）标 `third-party`，`url` 指向那个机构的榜。
 * 3. **口径不同就开不同的 league**，哪怕名字一样。两家公布的 OSWorld 2.0 一个是
 *    Anthropic 的部分得分、一个是 OpenAI 的离线集，同一个 Claude Opus 5 在两边分别是 74.0% 和 60.3%，
 *    放进同一行比就是误导。拿不准是不是同一口径的，宁可分开。
 * 4. **只录厂商自家的新模型**，不录它们发布文里顺带列出的竞品分数——那是一方替另一方报的数，
 *    被报的一方没法核对。
 * 5. **Artificial Analysis 的榜（GDPval-AA 等）永不录入**，合规红线见 HANDOFF 4.2。
 *
 * 这些条目和管线产出的成绩按「榜单 + 测量方」分池，与第三方复跑的成绩永不混算。
 * 第三方数据到了之后两者并存、各占一行，这张表不需要回头删。
 */

export interface OfficialScore {
  model: string;
  league: string;
  score: number;
  unit: ScoreUnit;
  attribution: Attribution;
  url: string;
  /** 原文怎么说的：评测版本、推理档位。只给维护者看，不上页面 */
  note: string;
}

const ANTHROPIC_OPUS_55 = 'https://www.anthropic.com/claude-opus-5-5';
const OPENAI_SOL = 'https://openai.com/index/introducing-gpt-6-sol-and-luna/';
const ZAPIER = 'https://zapier.com/benchmarks';

export const OFFICIAL_SCORES: OfficialScore[] = [
  // ── Claude Opus 5.5（2026-09-22 发布文「Performance and cost-effectiveness」表）──
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'terminal_bench_4_0',
    score: 66.4,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'Terminal-Bench 4.0，xhigh 档',
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'frontier_code',
    score: 54.4,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'FrontierCode v1.1 (Main)，max 档',
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'cursorbench',
    score: 57.8,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'CursorBench 4.0，max 档',
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'hle_tools',
    score: 67.7,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: "Humanity's Last Exam，with tools，max 档",
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'terminal_bench_science',
    score: 58.7,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'Terminal-Bench-Science 0.1，max 档',
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'osworld_2_partial',
    score: 81.8,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'OSWorld 2.0，partial，max 档',
  },
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'chartography',
    score: 89.0,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: ANTHROPIC_OPUS_55,
    note: 'Chartography，with tools，max 档',
  },

  // ── GPT-6 Sol（2026-09-22 发布文，正文里写明数字的四项）──
  {
    model: 'openai/gpt-6-sol',
    league: 'deepswe',
    score: 68.8,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: OPENAI_SOL,
    note: 'DeepSWE v1.1，max 档',
  },
  {
    model: 'openai/gpt-6-sol',
    league: 'agents_last_exam',
    score: 56.4,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: OPENAI_SOL,
    note: "Agents' Last Exam V1，max 档",
  },
  {
    model: 'openai/gpt-6-sol',
    league: 'osworld_2_offline',
    score: 60.5,
    unit: 'pct',
    attribution: 'vendor-self-reported',
    url: OPENAI_SOL,
    note: 'OSWorld 2.0 offline set，partial reward，v2026.08.08，xhigh 档',
  },

  // ── AutomationBench：Zapier 自己跑、自己发榜，两家发布文引用的都是它。各取最高档 ──
  {
    model: 'anthropic/claude-opus-5-5',
    league: 'automationbench',
    score: 40.0,
    unit: 'pct',
    attribution: 'third-party',
    url: ZAPIER,
    note: 'AutomationBench，Max 档，Zapier 榜 2026-09-23 查',
  },
  {
    model: 'openai/gpt-6-sol',
    league: 'automationbench',
    score: 33.2,
    unit: 'pct',
    attribution: 'third-party',
    url: ZAPIER,
    note: 'AutomationBench 1.0.6，XHigh 档（该模型最高分），Zapier 榜 2026-09-23 查',
  },
];
