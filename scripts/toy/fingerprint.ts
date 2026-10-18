/**
 * Toy 包的内容指纹：页面上看得到的东西没变，指纹就不变。
 *
 * 自动发布靠它判断「要不要送审」。每次送审都要人工过一遍，而同步管线每天跑两次、
 * 几乎每次都会产生提交——多数只是时间戳和数据来源标注在动（比如某个价格的来源从
 * litellm 换成 openrouter，数值没变）。直接比文件哈希等于天天送审。
 *
 * 所以数据文件先剥掉这几类字段再算：`generatedAt` / `fetchedAt`（每次同步都变）、
 * `provenance`（字段出自哪个上游，换源不换值时也会变）、顶层 `sources`（各上游这次抓了多少条，
 * 页面不读）。代码与静态资源按内容全量计入，
 * 生成物（精灵图、搜索索引）由数据和代码决定，不单独算。
 *
 * 指纹随包写进 `.toy-pkg/toy-release.json`，线上那一份就是「上次发布了什么」的唯一记录——
 * 本机手动发布与 CI 自动发布共用同一个判据，不需要另外记账。
 *
 * 用法：npx tsx scripts/toy/fingerprint.ts   # 打印当前工作区的指纹
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

/** 包根下的发布记录，线上可直接读到 */
export const RELEASE_FILE = 'toy-release.json';

const DATA_FILES = ['data/models.json', 'data/bilibili.json', 'data/benchmark-attribution.json'];
const VOLATILE_KEYS = new Set(['generatedAt', 'fetchedAt', 'provenance', 'sources']);

/** 决定页面长什么样的代码与资源。`git ls-files` 会跳过被忽略的生成物 */
const CODE_PATHS = [
  'src',
  'public',
  'assets',
  'scripts/sprites',
  'scripts/search-index',
  'scripts/toy/pack.ts',
  'next.config.ts',
  'postcss.config.mjs',
  'package-lock.json',
];

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      if (!VOLATILE_KEYS.has(k)) out[k] = strip((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function contentFingerprint(): string {
  const h = createHash('sha256');
  for (const f of DATA_FILES) {
    h.update(`${f}\0`);
    try {
      h.update(JSON.stringify(strip(JSON.parse(readFileSync(join(ROOT, f), 'utf8')))));
    } catch {
      h.update('<missing>');
    }
  }
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...CODE_PATHS], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .sort();
  for (const f of files) {
    h.update(`${f}\0`);
    try {
      h.update(readFileSync(join(ROOT, f)));
    } catch {
      h.update('<deleted>');
    }
  }
  return h.digest('hex').slice(0, 16);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(contentFingerprint());
}
