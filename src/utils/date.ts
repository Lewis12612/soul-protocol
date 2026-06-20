// ───────────────────────────────────────────────────────────────────────
// Date Utilities — 公共日期函数
// ───────────────────────────────────────────────────────────────────────

/** 获取今日日期字符串 YYYY-MM-DD */
export function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 获取今日日期字符串 YYYYMMDD（用于日志文件名） */
export function getTodayStrShort(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** 格式化任意日期为 YYYYMMDD */
export function formatDateShort(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}