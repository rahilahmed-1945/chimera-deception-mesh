const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Compact relative time, e.g. "3 seconds ago". */
export function relativeTime(iso: string): string {
  const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (Math.abs(sec) < 60) return rtf.format(sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
  return rtf.format(Math.round(hr / 24), 'day');
}
