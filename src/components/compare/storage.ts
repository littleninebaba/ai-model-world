/**
 * 对比页与详情页「加入对比」按钮之间的握手：上一次对比了哪些模型。
 * 单独成文件，详情页只引这几行，不把整个对比页打进它的包里。
 */
export const COMPARE_STORAGE_KEY = 'amw-compare';
export const MAX_PICK = 4;

export function parsePicked(raw: string | null): string[] {
  try {
    const list: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function writePicked(slugs: string[]): void {
  try {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // 无痕模式或容器禁用存储时照常工作，只是详情页接不上已选的
  }
}
