'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { COMPARE_STORAGE_KEY, MAX_PICK, parsePicked } from './storage';

function VsIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="3" width="4" height="6" fill="currentColor" opacity="0.35" />
      <rect x="7" y="3" width="4" height="6" fill="currentColor" opacity="0.35" />
      <rect x="5" y="5" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function snapshot(): string | null {
  try {
    return localStorage.getItem(COMPARE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * 详情页的「加入对比」。
 *
 * 链接本身就是答案：把当前模型接在上次对比过的模型后面，点过去就是那一场对阵。
 * 是真链接而不是按钮加 `router.push`——作为 B 站 Toy 发布时，站内跳转全靠
 * 打包脚本注入的点击兜底改写地址，`router.push` 绕过了它就会落到 404。
 */
export function CompareButton({ slug, className }: { slug: string; className: string }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const others = useMemo(
    () => parsePicked(raw).filter((s) => s !== slug).slice(-(MAX_PICK - 1)),
    [raw, slug],
  );

  return (
    <Link href={`/compare/?m=${[...others, slug].join(',')}`} className={className}>
      <VsIcon />
      {others.length > 0 ? `和已选的 ${others.length} 个对比` : '加入对比'}
    </Link>
  );
}
