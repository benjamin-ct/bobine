// « il y a 3 jours » ; null si la date manque ou est dans le futur.
export function timeAgo(ms: number | undefined, locale: string): string | null {
  if (!ms) {
    return null;
  }
  const seconds = (ms - Date.now()) / 1000;
  if (seconds > 60) {
    return null;
  }
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return rtf.format(0, "minute");
}
