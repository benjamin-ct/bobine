// Bornage et détection de plage inversée pour les champs numériques
// min/max des filtres avancés (page Découvrir et roue aléatoire) : évite
// de laisser passer une valeur hors échelle (ex. note > 10) ou une plage
// incohérente (min > max) jusqu'à l'appel API, où elle retombait
// silencieusement sur "Aucun résultat".

export function clampNumericValue(value: string, min: number, max: number = Infinity): string {
  if (value === "") {
    return value;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return value;
  }
  const clamped = Math.min(max, Math.max(min, num));
  return String(clamped);
}

export function isRangeInverted(min: string, max: string): boolean {
  if (min === "" || max === "") {
    return false;
  }
  const minNum = Number(min);
  const maxNum = Number(max);
  if (Number.isNaN(minNum) || Number.isNaN(maxNum)) {
    return false;
  }
  return minNum > maxNum;
}
