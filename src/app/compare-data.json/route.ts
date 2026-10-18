import { buildCompareData } from '@/lib/compare';
import { loadSnapshot } from '@/lib/snapshot';
import { listSpriteSlugs } from '@/lib/sprites-available';

/**
 * 对比页的数据文件。静态导出时落成站点根下的 `compare-data.json`，
 * 对比页打开后才去拉，其余 600 多个页面不受影响。
 */
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildCompareData(loadSnapshot(), listSpriteSlugs()));
}
