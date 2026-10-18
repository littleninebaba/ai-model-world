import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkScore, ModelRecord, WorldSnapshot } from './types';
import { SAMPLE_SNAPSHOT } from './sample-snapshot';
import { isCodingBenchmark } from '@/data/benchmark-registry';
import { OFFICIAL_SCORES } from '@/data/official-scores';
import { continentForCountry } from '@/data/vendor-registry';

/**
 * 读取数据管线产出的世界快照。
 *
 * 这个函数只在构建期的服务端组件里调用——前端运行时不请求任何上游 API，
 * 页面拿到的永远是构建那一刻仓库里的静态快照。
 *
 * 缺少 data/models.json 时的行为按环境区分：
 * 开发环境退回样本数据并大声告警，好让刚 clone 仓库的人也能看到界面；
 * 生产构建直接抛错中断，绝不允许一个以「展示真实状态」为使命的站点
 * 因为管线失败而静默上线一堆编造的数据。
 */

const SNAPSHOT_PATH = join(process.cwd(), 'data', 'models.json');

/*
 * 只在生产构建里缓存。开发时每次请求都重读磁盘——
 * 否则 `npm run sync` 换了快照、`npm run sprites` 补了图，页面都要重启服务器才看得到，
 * 这个坑之前踩过不止一次。构建期每个页面都会调一次，生产缓存仍然必要。
 */
let cached: WorldSnapshot | null = null;
const CACHE = process.env.NODE_ENV === 'production';

/**
 * 「国内 / 国外」的归属以前端注册表为准，而不是信快照里写的。
 * 划分规则改过一次（从「东方 / 西方」改成「国内 / 国外」），
 * 而快照是管线上一次运行时写死的——两边不一致时，界面上会出现韩国厂商站在国内区。
 * 这里统一按总部国家重算，保证规则只有一处。
 */
function normalize(snapshot: WorldSnapshot): WorldSnapshot {
  return {
    ...snapshot,
    vendors: snapshot.vendors.map((v) => ({ ...v, continent: continentForCountry(v.country) })),
    models: withOfficialScores(snapshot.models),
  };
}

/**
 * 把 `official-scores.ts` 里人工录入的发布当天官方成绩并进去。
 *
 * 放在读快照这一步而不是管线里：管线的产出应当只含机器可复现的东西，
 * 人工录入的一层单独放、单独看，哪天要撤只删那一张表。
 * 编程类同时进 `coding[]`，详情页的编程战绩表只读那里。
 */
function withOfficialScores(models: ModelRecord[]): ModelRecord[] {
  const byModel = new Map<string, BenchmarkScore[]>();
  for (const o of OFFICIAL_SCORES) {
    const list = byModel.get(o.model) ?? [];
    list.push({
      league: o.league,
      score: o.score,
      unit: o.unit,
      attribution: o.attribution,
      source: 'override',
      sourceUrl: o.url,
    });
    byModel.set(o.model, list);
  }
  return models.map((m) => {
    const extra = byModel.get(m.id);
    if (!extra) return m;
    const has = (list: BenchmarkScore[] | undefined, s: BenchmarkScore) =>
      (list ?? []).some((x) => x.league === s.league && x.attribution === s.attribution);
    const scores = [...(m.scores ?? []), ...extra.filter((s) => !has(m.scores, s))];
    const coding = [
      ...(m.coding ?? []),
      ...extra.filter((s) => isCodingBenchmark(s.league) && !has(m.coding, s)),
    ];
    return { ...m, scores, coding };
  });
}

export function loadSnapshot(): WorldSnapshot {
  if (cached) return cached;

  if (existsSync(SNAPSHOT_PATH)) {
    const snap = normalize(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as WorldSnapshot);
    if (CACHE) cached = snap;
    return snap;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `缺少 data/models.json。\n` +
        `生产构建不接受样本数据回退——先运行 \`npx tsx scripts/sync/index.ts\` 生成真实快照。`,
    );
  }

  console.warn(
    '\n⚠️  未找到 data/models.json，正在使用样本数据。\n' +
      '   运行 `npx tsx scripts/sync/index.ts` 获取真实数据。\n',
  );
  cached = SAMPLE_SNAPSHOT;
  return cached;
}

/** 快照里是否为样本数据，用于在页面上打出醒目提示 */
export function isSampleData(snapshot: WorldSnapshot): boolean {
  return snapshot === SAMPLE_SNAPSHOT;
}
