/**
 * 自动发布前的判断：这一次要不要送审。给 `.github/workflows/toy.yml` 用，本机也能跑。
 *
 * 依次看三件事：
 * 1. **上一版还在审核中** → 跳过。叠着提交没有意义，明天再看。
 * 2. **上一版被驳回** → 以非零退出码结束，让工作流开 issue。被驳回说明内容有问题，
 *    原样再送一次大概率还是驳回，而且连续驳回对账号不好，必须有人先看一眼。
 *    人工修好、手动发布之后状态会变，自动发布随之恢复。
 * 3. **内容指纹与线上一致** → 跳过。线上包根的 `toy-release.json` 记着上次发布的指纹，
 *    读不到（旧包没有这个文件、网络失败）就当作需要发布。
 *
 * 环境变量：TOY_ID（必填）、TOY_BIN（默认 toy）、FORCE=true 时跳过第 3 条。
 * 结果写进 GITHUB_OUTPUT 的 publish=true|false 与 reason。
 *
 * 用法：TOY_ID=34090174887936 npx tsx scripts/toy/should-publish.ts
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { contentFingerprint, RELEASE_FILE } from './fingerprint.ts';

interface ToyItem {
  id: number;
  url: string;
  status: string;
  reject_reason?: string;
}

const TOY_ID = process.env.TOY_ID;
const TOY_BIN = process.env.TOY_BIN || 'toy';
const FORCE = process.env.FORCE === 'true';

function output(publish: boolean, reason: string): void {
  console.log(`${publish ? '发布' : '跳过'}：${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\nreason=${reason}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${publish ? '送审' : '不送审'}\n\n${reason}\n`);
  }
}

/** 外层页面只是个壳，真正的包挂在它 iframe 指向的版本化目录下 */
async function liveFingerprint(toyUrl: string): Promise<string | null> {
  try {
    const shell = await (await fetch(toyUrl)).text();
    const m = /<iframe[^>]+src="(https:\/\/[^"]+?)\/index\.html"/.exec(shell);
    if (!m) return null;
    const res = await fetch(`${m[1]}/${RELEASE_FILE}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { fingerprint?: string };
    return json.fingerprint ?? null;
  } catch (err) {
    console.warn(`读取线上指纹失败：${String(err)}`);
    return null;
  }
}

async function main(): Promise<void> {
  if (!TOY_ID) throw new Error('缺少 TOY_ID');

  const list = JSON.parse(execFileSync(TOY_BIN, ['mylist', '--json'], { encoding: 'utf8' })) as { list: ToyItem[] };
  const toy = list.list.find((t) => String(t.id) === TOY_ID);
  if (!toy) throw new Error(`当前账号下找不到 Toy ${TOY_ID}`);

  if (toy.status === 'auditing') return output(false, '上一版还在审核中');
  if (toy.status === 'rejected') {
    console.error(`上一版被驳回：${toy.reject_reason ?? '（平台没给原因）'}。先人工处理，手动发布一次后自动发布会恢复。`);
    process.exit(1);
  }

  const local = contentFingerprint();
  const live = await liveFingerprint(toy.url);
  console.log(`本地指纹 ${local}，线上指纹 ${live ?? '（读不到）'}，平台状态 ${toy.status}`);

  if (FORCE) return output(true, '手动触发，强制发布');
  if (live === local) return output(false, '页面内容与线上一致');
  output(true, live ? `内容有变化（${live} → ${local}）` : '读不到线上指纹，按需要发布处理');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
