import { CompareView } from '@/components/compare/CompareView';
import { GroundBackdrop } from '@/components/world/Ground';
import { SiteHeader } from '@/components/world/SiteHeader';
import { asset } from '@/lib/asset';
import { DEFAULT_LANG } from '@/lib/i18n';

export const metadata = { title: '模型对比' };

/**
 * 模型对比。选哪几个模型全在地址栏里（`?m=a,b`），页面本身是一张空壳，
 * 数据由 `compare-data.json` 按需拉取。
 *
 * 两个资源地址在服务端算好再传下去，而不是在客户端调 `asset()`：
 * 作为 B 站 Toy 发布时，打包脚本只改写 HTML 与 JS 里**字面出现**的部署前缀，
 * 服务端渲染进 HTML 的字符串一定是字面值，客户端拼出来的则不一定。
 */
export default function ComparePage() {
  const lang = DEFAULT_LANG;
  return (
    <main className="relative min-h-dvh">
      <GroundBackdrop />
      <div className="relative">
        <SiteHeader current="compare" lang={lang} />
        <div className="page-shell pb-16 pt-2">
          <CompareView dataUrl={asset('/compare-data.json')} spriteBase={asset('/sprites/')} />
        </div>
      </div>
    </main>
  );
}
